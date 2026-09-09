"""OTP email confirmation flow (obs: tests.auth.otp, coord: auth.otp.flow)."""
import os
import tempfile
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.services import storage


@pytest.fixture()
def auth(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-signing-32-chars")
    monkeypatch.setenv("SKIP_EMAIL_CONFIRM", "")  # confirmation is enforced
    dbmod.reset_db_for_tests(path)
    sent: list[dict] = []

    def _fake_send(**kwargs):  # coord: auth.otp.mail.stub -- no SMTP in tests
        sent.append(kwargs)
        return True

    monkeypatch.setattr("app.api.auth.send_confirmation_otp", _fake_send)
    from app.main import app
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, sent=sent)
    if os.path.exists(path):
        os.unlink(path)


def _register(client, email="otp-user@example.com"):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "password123", "name": "OTP User",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _row(email):
    with dbmod.get_db().connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()


def test_register_mails_otp_and_returns_unconfirmed_token(auth):
    body = _register(auth.client)
    assert body["user"]["email_confirmed"] is False
    assert len(auth.sent) == 1
    mailed = auth.sent[0]
    assert mailed["to"] == "otp-user@example.com"
    assert len(mailed["otp"]) == 6 and mailed["otp"].isdigit()


def test_confirm_otp_succeeds_and_clears_otp(auth):
    _register(auth.client)
    otp = auth.sent[0]["otp"]
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "otp-user@example.com", "otp": otp})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email_confirmed"] is True
    row = _row("otp-user@example.com")
    assert row["email_confirmed"] == 1
    assert row["confirm_otp"] is None
    assert row["confirm_otp_expires"] is None


def test_confirm_otp_rejects_expired(auth):
    _register(auth.client)
    otp = auth.sent[0]["otp"]
    with dbmod.get_db().write() as conn:  # obs: auth.otp.expired
        conn.execute(
            "UPDATE users SET confirm_otp_expires = ? WHERE email = ?",
            (time.time() - 1, "otp-user@example.com"),
        )
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "otp-user@example.com", "otp": otp})
    assert r.status_code == 400


def test_confirm_otp_rejects_wrong_code(auth):
    _register(auth.client)
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "otp-user@example.com", "otp": "000000"})
    assert r.status_code == 400
    assert _row("otp-user@example.com")["email_confirmed"] == 0


def test_confirm_otp_unknown_email_is_404(auth):
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "nobody@example.com", "otp": "123456"})
    assert r.status_code == 404


def test_resend_otp_rate_limited(auth):
    _register(auth.client)
    r = auth.client.post("/api/auth/resend-otp",
                         json={"email": "otp-user@example.com"})
    assert r.status_code == 202, r.text
    assert len(auth.sent) == 2  # registration + resend
    assert auth.sent[1]["otp"] != auth.sent[0]["otp"]
    r = auth.client.post("/api/auth/resend-otp",
                         json={"email": "otp-user@example.com"})
    assert r.status_code == 429  # obs: auth.otp.cooldown
    assert len(auth.sent) == 2


def test_resend_otp_unknown_email_is_404(auth):
    r = auth.client.post("/api/auth/resend-otp",
                         json={"email": "nobody@example.com"})
    assert r.status_code == 404


def test_login_still_requires_email_confirmed(auth):
    _register(auth.client)
    r = auth.client.post("/api/auth/login",
                         json={"email": "otp-user@example.com", "password": "password123"})
    assert r.status_code == 403
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "otp-user@example.com", "otp": auth.sent[0]["otp"]})
    assert r.status_code == 200
    r = auth.client.post("/api/auth/login",
                         json={"email": "otp-user@example.com", "password": "password123"})
    assert r.status_code == 200, r.text


def test_legacy_confirm_accepts_otp(auth):
    _register(auth.client)
    r = auth.client.post("/api/auth/confirm",
                         json={"email": "otp-user@example.com", "otp": auth.sent[0]["otp"]})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["email_confirmed"] is True


def test_resend_otp_yields_a_fresh_working_code(auth):
    _register(auth.client)
    first = auth.sent[0]["otp"]
    auth.client.post("/api/auth/resend-otp", json={"email": "otp-user@example.com"})
    fresh = storage.get_user_by_email("otp-user@example.com")["confirm_otp"]
    assert fresh == auth.sent[1]["otp"] and fresh != first
    r = auth.client.post("/api/auth/confirm-otp",
                         json={"email": "otp-user@example.com", "otp": first})
    assert r.status_code == 400  # the stale code must not work anymore
