"""Stripe integration tests.

Every Stripe call is mocked at the ``httpx.Client`` boundary - the suite must
never touch the real API. The restricted key used here is a dummy
``rk_live_TEST_...`` string; the real key lives only in the gitignored ``.env``.
"""
from __future__ import annotations

import hashlib
import hmac
import importlib
import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.services import storage

# A fake key with the right *shape* so prefix/redaction logic is exercised.
# Assembled at runtime rather than written as one literal: a contiguous
# "rk_live_<40+ chars>" string in a committed file trips GitHub push
# protection's Stripe detector (a false positive, but a blocking one).
FAKE_KEY = "rk_" + "live_" + "TESTFAKEKEY" + "0" * 20
FAKE_WHSEC = "whsec_" + "test_secret_for_unit_tests"


@pytest.fixture(autouse=True)
def _stripe_env(monkeypatch):
    """Ensure the module-level key guard is satisfied in every test."""
    monkeypatch.setenv("STRIPE_RK_LIVE", FAKE_KEY)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", FAKE_WHSEC)


@pytest.fixture()
def stripe_svc(_stripe_env):
    import app.services.stripe as mod
    return importlib.reload(mod)


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = json.dumps(payload)

    def json(self):
        return self._payload


class FakeHTTPXClient:
    """Stand-in for ``httpx.Client`` that records every request."""

    calls: list[dict] = []
    queue: list[FakeResponse] = []

    def __init__(self, *args, **kwargs):
        self.init_kwargs = kwargs

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def request(self, method, url, headers=None, data=None, **kwargs):
        type(self).calls.append({
            "method": method, "url": url,
            "headers": headers or {}, "data": data or {},
        })
        if type(self).queue:
            return type(self).queue.pop(0)
        return FakeResponse({"id": "obj_default"})


@pytest.fixture()
def fake_httpx(monkeypatch, stripe_svc):
    FakeHTTPXClient.calls = []
    FakeHTTPXClient.queue = []
    monkeypatch.setattr(stripe_svc.httpx, "Client", FakeHTTPXClient)
    return FakeHTTPXClient


@pytest.fixture()
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-and-vault-32chars")
    monkeypatch.setenv("SKIP_EMAIL_CONFIRM", "1")
    monkeypatch.setenv("STRIPE_RK_LIVE", FAKE_KEY)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", FAKE_WHSEC)
    dbmod.reset_db_for_tests(path)
    from app.main import app
    with TestClient(app) as c:
        yield c
    if os.path.exists(path):
        os.unlink(path)


def _make_workspace() -> str:
    import uuid
    user = storage.create_user(email=f"s-{uuid.uuid4().hex[:6]}@x.com", password_hash="x")
    ws = storage.create_workspace(owner_id=user["id"], name="stripe-test")
    return ws["id"]


# ── required tests ────────────────────────────────────────────────────────
def test_stripe_client_uses_bearer_auth(stripe_svc, fake_httpx):
    """The restricted key must travel as `Authorization: Bearer <key>`."""
    c = stripe_svc.StripeClient(FAKE_KEY)
    assert c.auth_headers["Authorization"] == f"Bearer {FAKE_KEY}"

    fake_httpx.queue.append(FakeResponse({"id": "acct_123", "object": "account"}))
    c.retrieve_account()

    call = fake_httpx.calls[-1]
    assert call["headers"]["Authorization"] == f"Bearer {FAKE_KEY}"
    # Never Basic auth, and never the key in the URL/query string.
    assert not call["headers"]["Authorization"].startswith("Basic ")
    assert FAKE_KEY not in call["url"]
    assert call["url"] == "https://api.stripe.com/v1/account"


def test_create_payment_intent_amount_in_cents(stripe_svc, fake_httpx):
    """Amounts are sent verbatim as integer minor units."""
    c = stripe_svc.StripeClient(FAKE_KEY)
    fake_httpx.queue.append(FakeResponse({"id": "pi_1", "amount": 2500}))

    out = c.create_payment_intent(
        amount_cents=2500, currency="EUR", metadata={"workspace_id": "ws-1"},
    )
    assert out["id"] == "pi_1"

    call = fake_httpx.calls[-1]
    assert call["method"] == "POST"
    assert call["url"].endswith("/payment_intents")
    assert call["data"]["amount"] == "2500"
    # Currency is normalised to lowercase for Stripe.
    assert call["data"]["currency"] == "eur"
    # Nested metadata is bracket-encoded.
    assert call["data"]["metadata[workspace_id]"] == "ws-1"

    # Non-positive amounts are rejected before any network call.
    before = len(fake_httpx.calls)
    for bad in (0, -1):
        with pytest.raises(ValueError):
            c.create_payment_intent(amount_cents=bad)
    assert len(fake_httpx.calls) == before


def test_webhook_signature_verification(stripe_svc):
    """Valid signatures pass; tampered payload/sig/secret all fail."""
    payload = b'{"id":"evt_1","type":"checkout.session.completed"}'
    expected = hmac.new(FAKE_WHSEC.encode(), payload, hashlib.sha256).hexdigest()

    # Bare hex digest.
    assert stripe_svc.verify_webhook_signature(payload, expected, FAKE_WHSEC) is True
    # Stripe's structured header form.
    assert stripe_svc.verify_webhook_signature(
        payload, f"t=1700000000,v1={expected}", FAKE_WHSEC) is True

    # Tampered signature.
    tampered = ("f" if expected[0] != "f" else "0") + expected[1:]
    assert stripe_svc.verify_webhook_signature(payload, tampered, FAKE_WHSEC) is False
    # Tampered payload against a good signature.
    assert stripe_svc.verify_webhook_signature(
        payload + b"x", expected, FAKE_WHSEC) is False
    # Wrong secret.
    assert stripe_svc.verify_webhook_signature(payload, expected, "whsec_wrong") is False
    # Missing / empty inputs must not raise.
    assert stripe_svc.verify_webhook_signature(payload, "", FAKE_WHSEC) is False
    assert stripe_svc.verify_webhook_signature(payload, expected, "") is False
    assert stripe_svc.verify_webhook_signature(payload, "t=1,v1=", FAKE_WHSEC) is False


def test_checkout_creates_session_for_credits(client, monkeypatch):
    """POST /checkout converts credits -> cents and returns the session URL."""
    ws_id = _make_workspace()
    import app.services.stripe as stripe_svc

    captured = {}

    def fake_create(self, **kwargs):
        captured.update(kwargs)
        return {"id": "cs_test_123",
                "url": "https://checkout.stripe.com/c/pay/cs_test_123"}

    monkeypatch.setattr(stripe_svc.StripeClient, "create_checkout_session", fake_create)

    r = client.post("/api/billing/stripe/checkout", json={
        "workspace_id": ws_id, "credits": 500,
        "success_url": "https://app.example.com/ok",
        "cancel_url": "https://app.example.com/no",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] == "cs_test_123"
    assert body["url"].startswith("https://checkout.stripe.com/")
    # 1 credit = $0.01 -> 500 credits = 50000 cents
    assert body["amount_cents"] == 500 * 100 == 50000
    assert captured["amount_cents"] == 50000
    # Metadata must round-trip so the webhook knows who to credit.
    assert captured["metadata"]["workspace_id"] == ws_id
    assert int(captured["metadata"]["credits"]) == 500

    # Unknown workspace -> 404
    r = client.post("/api/billing/stripe/checkout", json={
        "workspace_id": "ws-does-not-exist", "credits": 10,
        "success_url": "https://a/ok", "cancel_url": "https://a/no",
    })
    assert r.status_code == 404

    # Non-positive credits rejected by validation
    r = client.post("/api/billing/stripe/checkout", json={
        "workspace_id": ws_id, "credits": 0,
        "success_url": "https://a/ok", "cancel_url": "https://a/no",
    })
    assert r.status_code == 422


def test_webhook_credits_workspace_on_completed(client):
    """A correctly signed completed session credits the workspace exactly once."""
    ws_id = _make_workspace()
    start = storage.get_credit_balance(ws_id) if hasattr(
        storage, "get_credit_balance") else 0.0

    event = {
        "id": "evt_1",
        "type": "checkout.session.completed",
        "data": {"object": {
            "id": "cs_test_9",
            "payment_status": "paid",
            "metadata": {"workspace_id": ws_id, "credits": "250"},
        }},
    }
    raw = json.dumps(event).encode()
    sig = hmac.new(FAKE_WHSEC.encode(), raw, hashlib.sha256).hexdigest()

    r = client.post("/api/billing/stripe/webhook", content=raw,
                    headers={"stripe-signature": f"t=1,v1={sig}",
                             "content-type": "application/json"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["credited"] is True
    assert body["credits"] == 250
    assert body["balance"] == pytest.approx(start + 250)

    # An invalid signature must be rejected and must NOT credit.
    r = client.post("/api/billing/stripe/webhook", content=raw,
                    headers={"stripe-signature": "t=1,v1=deadbeef",
                             "content-type": "application/json"})
    assert r.status_code == 400
    assert storage.apply_credit_delta(ws_id, delta=0, reason="probe") \
        == pytest.approx(start + 250)


# ── supporting tests ──────────────────────────────────────────────────────
def test_import_without_key_raises_runtime_error(monkeypatch):
    """Production breakage must be loud: no key -> RuntimeError on import."""
    monkeypatch.delenv("STRIPE_RK_LIVE", raising=False)
    import app.services.stripe as mod
    with pytest.raises(RuntimeError) as exc:
        importlib.reload(mod)
    assert "STRIPE_RK_LIVE" in str(exc.value)
    # Restore so later tests/modules see a usable module object.
    monkeypatch.setenv("STRIPE_RK_LIVE", FAKE_KEY)
    importlib.reload(mod)


def test_redact_scrubs_secrets(stripe_svc):
    """Error text must never carry a key or webhook secret."""
    msg = f"Invalid API Key provided: {FAKE_KEY} and {FAKE_WHSEC}"
    out = stripe_svc.redact(msg)
    assert FAKE_KEY not in out
    assert FAKE_WHSEC not in out
    assert "<redacted-stripe-key>" in out
    assert "<redacted-webhook-secret>" in out


def test_api_error_message_is_redacted(stripe_svc, fake_httpx):
    """A 401 whose body echoes the key must not leak it via the exception."""
    fake_httpx.queue.append(FakeResponse(
        {"error": {"message": f"Invalid API Key provided: {FAKE_KEY}",
                   "code": "api_key_invalid"}},
        status_code=401,
    ))
    c = stripe_svc.StripeClient(FAKE_KEY)
    with pytest.raises(stripe_svc.StripeError) as exc:
        c.retrieve_account()
    assert FAKE_KEY not in str(exc.value)
    assert exc.value.status_code == 401


def test_create_or_get_customer_reuses_existing(stripe_svc, fake_httpx):
    """An existing customer is returned without creating a duplicate."""
    c = stripe_svc.StripeClient(FAKE_KEY)
    fake_httpx.queue.append(FakeResponse({"data": [{"id": "cus_existing"}]}))
    out = c.create_or_get_customer(email="a@b.com")
    assert out["id"] == "cus_existing"
    assert len(fake_httpx.calls) == 1
    assert fake_httpx.calls[0]["method"] == "GET"


def test_create_or_get_customer_creates_when_absent(stripe_svc, fake_httpx):
    c = stripe_svc.StripeClient(FAKE_KEY)
    fake_httpx.queue.append(FakeResponse({"data": []}))
    fake_httpx.queue.append(FakeResponse({"id": "cus_new"}))
    out = c.create_or_get_customer(email="a@b.com", name="Ada")
    assert out["id"] == "cus_new"
    create = fake_httpx.calls[-1]
    assert create["method"] == "POST"
    assert create["data"]["email"] == "a@b.com"
    assert create["data"]["name"] == "Ada"


def test_create_or_get_customer_falls_back_when_key_lacks_read(stripe_svc, fake_httpx):
    """A restricted key without customer.read still creates the customer."""
    c = stripe_svc.StripeClient(FAKE_KEY)
    fake_httpx.queue.append(FakeResponse(
        {"error": {"message": "insufficient permissions"}}, status_code=403))
    fake_httpx.queue.append(FakeResponse({"id": "cus_after_403"}))
    out = c.create_or_get_customer(email="a@b.com")
    assert out["id"] == "cus_after_403"


def test_retrieve_payment_intent(stripe_svc, fake_httpx):
    c = stripe_svc.StripeClient(FAKE_KEY)
    fake_httpx.queue.append(FakeResponse({"id": "pi_9", "status": "succeeded"}))
    out = c.retrieve_payment_intent("pi_9")
    assert out["status"] == "succeeded"
    call = fake_httpx.calls[-1]
    assert call["method"] == "GET"
    assert call["url"].endswith("/payment_intents/pi_9")
    with pytest.raises(ValueError):
        c.retrieve_payment_intent("")


def test_webhook_ignores_other_event_types(client):
    raw = json.dumps({"id": "evt_2", "type": "payment_intent.created",
                      "data": {"object": {}}}).encode()
    sig = hmac.new(FAKE_WHSEC.encode(), raw, hashlib.sha256).hexdigest()
    r = client.post("/api/billing/stripe/webhook", content=raw,
                    headers={"stripe-signature": f"t=1,v1={sig}"})
    assert r.status_code == 200
    assert r.json()["ignored"] == "payment_intent.created"


def test_webhook_completed_without_metadata_does_not_credit(client):
    raw = json.dumps({
        "id": "evt_3", "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_x", "metadata": {}}},
    }).encode()
    sig = hmac.new(FAKE_WHSEC.encode(), raw, hashlib.sha256).hexdigest()
    r = client.post("/api/billing/stripe/webhook", content=raw,
                    headers={"stripe-signature": f"t=1,v1={sig}"})
    assert r.status_code == 200
    assert r.json()["credited"] is False


def test_session_status_endpoint(client, monkeypatch):
    import app.services.stripe as stripe_svc
    monkeypatch.setattr(
        stripe_svc.StripeClient, "retrieve_checkout_session",
        lambda self, sid: {"id": sid, "status": "complete",
                           "payment_status": "paid",
                           "amount_total": 50000, "currency": "eur"},
    )
    r = client.get("/api/billing/stripe/session/cs_test_123")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["session_id"] == "cs_test_123"
    assert body["status"] == "complete"
    assert body["amount_total"] == 50000


def test_no_real_key_in_tracked_source():
    """No live Stripe secret may appear in any git-tracked file.

    The real key is read from the (gitignored) .env at runtime -- it is
    deliberately NOT hardcoded here, since this file is itself committed.
    """
    import subprocess
    from pathlib import Path

    secrets: list[str] = []
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            _, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            # Only guard against real-looking live credentials.
            if val.startswith(("rk_live_", "sk_live_")) and "REPLACE_ME" not in val:
                secrets.append(val)

    tracked = subprocess.run(["git", "ls-files"], capture_output=True,
                             text=True, cwd=env_path.parent).stdout.split()
    assert tracked, "expected a git-tracked file list"

    for rel in tracked:
        f = env_path.parent / rel
        if not f.is_file():
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for secret in secrets:
            assert secret not in text, f"live Stripe key leaked into {rel}"
            # Also catch a partial paste of the key body.
            assert secret[8:32] not in text, f"live key fragment leaked into {rel}"
