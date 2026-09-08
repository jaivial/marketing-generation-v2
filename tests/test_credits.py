"""Tests for the credits system: cost table, margin, reservation, refunds."""
import asyncio
import json
import math
import os
import tempfile

import pytest

from app.core import db as dbmod
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services import credits, storage
from app.services.credits import (
    COSTS,
    PROFIT_MARGIN,
    InsufficientCreditsError,
    estimate_campaign_cost,
    price_for_user,
    refund_reservation,
    require_credits,
)
from app.services.orchestrator import CampaignRequest, Orchestrator
from app.services.wavespeed_client import WavespeedCLI


@pytest.fixture()
def ws(monkeypatch):
    """A fresh DB with one user + workspace. Yields the workspace id."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    dbmod.reset_db_for_tests(path)
    user = storage.create_user(email="pay@example.com", password_hash="x")
    workspace = storage.create_workspace(owner_id=user["id"], name="Acme")
    yield workspace["id"]
    if os.path.exists(path):
        os.unlink(path)


# ─── Cost table ────────────────────────────────────────────────────────────
def test_estimate_campaign_cost_matches_table():
    cost = estimate_campaign_cost(n_frames=10, n_video_clips=2, n_llm_calls=4)
    expected = (
        10 * COSTS["image"]
        + 2 * COSTS["video_15s"]
        + 4 * COSTS["minimax_chat"]
    )
    assert cost == pytest.approx(expected)
    assert cost == pytest.approx(0.30 + 1.00 + 0.008)

    # Screenshots are free, so they never move the number.
    assert COSTS["screenshot"] == 0.0
    # Empty campaign costs nothing.
    assert estimate_campaign_cost(
        n_frames=0, n_video_clips=0, n_llm_calls=0) == 0.0


def test_price_for_user_applies_margin():
    assert PROFIT_MARGIN == 1.5
    # 1.00 base -> 1.50 credits
    assert price_for_user(1.0) == pytest.approx(1.50)
    # 0.03 base -> 0.045 -> rounded *up* to 0.05
    assert price_for_user(0.03) == pytest.approx(0.05)
    assert price_for_user(0.0) == 0.0
    # Always >= base * margin and never more than a cent above it.
    for base in (0.002, 0.031, 0.507, 1.458, 12.34):
        p = price_for_user(base)
        assert p >= base * PROFIT_MARGIN - 1e-9
        assert p < base * PROFIT_MARGIN + 0.01
        assert p == round(p, 2)


# ─── Reservation ───────────────────────────────────────────────────────────
def test_require_credits_deducts_when_sufficient(ws):
    storage.apply_credit_delta(ws, delta=10.0, reason="topup")
    base = 1.0
    new_balance = require_credits(ws, base, campaign_id="c-abc")

    price = price_for_user(base)          # 1.50
    assert new_balance == pytest.approx(10.0 - price)
    assert storage.get_credit_balance(ws) == pytest.approx(8.5)


def test_require_credits_raises_when_insufficient(ws):
    storage.apply_credit_delta(ws, delta=1.0, reason="topup")
    with pytest.raises(InsufficientCreditsError) as exc:
        require_credits(ws, 1.0)          # needs 1.50, only has 1.00
    assert exc.value.required == pytest.approx(1.5)
    assert exc.value.balance == pytest.approx(1.0)
    # Nothing was deducted.
    assert storage.get_credit_balance(ws) == pytest.approx(1.0)


def test_refund_restores_balance(ws):
    storage.apply_credit_delta(ws, delta=10.0, reason="topup")
    require_credits(ws, 2.0, campaign_id="c-1")     # -3.00
    assert storage.get_credit_balance(ws) == pytest.approx(7.0)

    refund_reservation(ws, 3.0, campaign_id="c-1")
    assert storage.get_credit_balance(ws) == pytest.approx(10.0)

    # Non-positive refunds are a harmless no-op.
    assert refund_reservation(ws, 0.0, campaign_id="c-1") == pytest.approx(10.0)
    assert storage.get_credit_balance(ws) == pytest.approx(10.0)


# ─── Orchestrator integration ──────────────────────────────────────────────
class FakeChat(ChatClient):
    async def complete(self, system, user):
        u = user.lower()
        if "frames" in u or "visual prompts" in u:
            return json.dumps({"frames": [{"t": 0, "prompt": "open"},
                                          {"t": 30, "prompt": "close"}]})
        if "decide the video generation strategy" in u or "multi_scene" in u:
            return json.dumps({"multi_scene": False, "include_screenshots": False,
                               "rationale": "x", "scenes": [{"title": "Ad", "prompt": ""}]})
        if "JSON with keys" in user:
            return json.dumps({"hook": "Hi", "tagline": "Fast", "cta": "Try",
                               "audience": "devs", "tone": "witty"})
        return "A short script."

    async def stream(self, system, user):
        for w in (await self.complete(system, user)).split():
            yield w


class OkMedia(MediaClient):
    async def generate_image(self, prompt):
        return f"https://img/{prompt}.png"

    async def generate_video(self, prompt, frames, duration_s):
        return "https://vid/out.mp4"


class ExplodingMedia(MediaClient):
    """Blows up on the very first image \u2014 nothing paid has succeeded yet."""

    async def generate_image(self, prompt):
        raise RuntimeError("gpt-image is down")

    async def generate_video(self, prompt, frames, duration_s):
        return "https://vid/out.mp4"


class FakeWavespeed(WavespeedCLI):
    def __init__(self):
        super().__init__(bin_path="/bin/true")

    async def capture_screenshot(self, *a, **kw):   # type: ignore[override]
        return "https://shot/fake.png"

    async def generate_video(self, prompt, frames, duration_s, **kw):  # type: ignore[override]
        return "https://vid/out.mp4"

    async def generate_video_scenes(self, plan, master_prompt="", **kw):  # type: ignore[override]
        return [f"https://vid/clip_{c.index}.mp4" for c in plan.clips]


def _factory(kind, target, username=None, password=None):
    class R(SourceReader):
        async def read(self, t):
            return "ctx"
    return R()


def _run(orch, req):
    events = []

    async def go():
        async for ev in orch.run(req):
            events.append(ev)

    asyncio.run(go())
    return events


def test_orchestrator_refunds_on_image_failure(ws):
    """A campaign that throws on the first image must leave the balance intact."""
    storage.apply_credit_delta(ws, delta=50.0, reason="topup")
    before = storage.get_credit_balance(ws)

    orch = Orchestrator(FakeChat(), ExplodingMedia(), _factory,
                        wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="x", duration_s=30, workspace_id=ws,
    ))

    kinds = [e["event"] for e in events]
    assert "error" in kinds, kinds
    assert "frame" not in kinds
    err = events[-1]["data"]
    assert "gpt-image is down" in err["message"]

    # Acceptance criterion: balance unchanged.
    assert storage.get_credit_balance(ws) == pytest.approx(before)


def test_orchestrator_reserves_budget_up_front(ws):
    storage.apply_credit_delta(ws, delta=50.0, reason="topup")
    orch = Orchestrator(FakeChat(), OkMedia(), _factory, wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="x", duration_s=30, workspace_id=ws,
    ))

    kinds = [e["event"] for e in events]
    assert "error" not in kinds, events
    budget = next(e for e in events if e["event"] == "budget")["data"]

    n_frames = Orchestrator._n_frames(30)
    n_clips = Orchestrator._n_video_clips(30)
    assert n_clips == math.ceil(30 / 15) == 2
    assert budget["base_cost_usd"] == pytest.approx(estimate_campaign_cost(
        n_frames=n_frames, n_video_clips=n_clips,
        n_llm_calls=Orchestrator.N_LLM_CALLS,
    ))
    assert budget["reserved_credits"] == pytest.approx(
        price_for_user(budget["base_cost_usd"]))

    done = next(e for e in events if e["event"] == "done")["data"]
    assert done["credits_spent"] == pytest.approx(price_for_user(done["cost_usd"]))
    # Charged no more than reserved, and the ledger agrees.
    assert done["credits_spent"] <= budget["reserved_credits"] + 1e-9
    assert storage.get_credit_balance(ws) == pytest.approx(
        50.0 - done["credits_spent"])


def test_orchestrator_blocks_when_balance_too_low(ws):
    """No top-up at all \u2192 the run aborts before any provider is touched."""
    calls = []

    class Watched(OkMedia):
        async def generate_image(self, prompt):
            calls.append(prompt)
            return await super().generate_image(prompt)

    orch = Orchestrator(FakeChat(), Watched(), _factory, wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="x", duration_s=30, workspace_id=ws,
    ))

    assert [e["event"] for e in events] == ["error"]
    assert events[0]["data"]["code"] == "insufficient_credits"
    assert calls == []
    assert storage.get_credit_balance(ws) == pytest.approx(0.0)


def test_orchestrator_without_workspace_is_not_charged(ws):
    """Backward compatibility: no workspace_id \u2192 no ledger activity."""
    orch = Orchestrator(FakeChat(), OkMedia(), _factory, wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(source_kind="url", target="x", duration_s=30))
    kinds = [e["event"] for e in events]
    assert "error" not in kinds, events
    assert "budget" not in kinds
    assert storage.get_credit_balance(ws) == pytest.approx(0.0)


# ─── Admin top-up endpoint ─────────────────────────────────────────────────
@pytest.fixture()
def client(monkeypatch):
    from fastapi.testclient import TestClient

    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-and-vault-32chars")
    monkeypatch.setenv("SKIP_EMAIL_CONFIRM", "1")
    dbmod.reset_db_for_tests(path)
    from app.main import app
    with TestClient(app) as c:
        yield c
    if os.path.exists(path):
        os.unlink(path)


ROOT = {"X-Demo-Principal": "62:root:x"}   # GUEST|USER|ADMIN|ROOT


def _register(client) -> str:
    r = client.post("/api/auth/register",
                    json={"email": "topup@example.com", "password": "password123"})
    return r.json()["user"]["workspace_id"]


def test_admin_topup_adds_credits(client):
    ws_id = _register(client)
    r = client.post("/api/admin/credits/topup",
                    json={"workspace_id": ws_id, "amount_usd": 25.5},
                    headers=ROOT)
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == pytest.approx(25.5)

    # Top-ups accumulate.
    r = client.post("/api/admin/credits/topup",
                    json={"workspace_id": ws_id, "amount_usd": 4.5},
                    headers=ROOT)
    assert r.json()["balance"] == pytest.approx(30.0)

    r = client.get(f"/api/admin/credits/{ws_id}", headers=ROOT)
    assert r.status_code == 200
    assert r.json()["balance"] == pytest.approx(30.0)


def test_admin_topup_requires_root(client):
    ws_id = _register(client)
    body = {"workspace_id": ws_id, "amount_usd": 10.0}
    # Anonymous
    assert client.post("/api/admin/credits/topup", json=body).status_code == 403
    # Plain admin is not root
    r = client.post("/api/admin/credits/topup", json=body,
                    headers={"X-Demo-Principal": "16:admin:x"})
    assert r.status_code == 403


def test_admin_topup_unknown_workspace_404(client):
    r = client.post("/api/admin/credits/topup",
                    json={"workspace_id": "ws-nope", "amount_usd": 1.0},
                    headers=ROOT)
    assert r.status_code == 404


def test_admin_topup_rejects_non_positive_amount(client):
    ws_id = _register(client)
    r = client.post("/api/admin/credits/topup",
                    json={"workspace_id": ws_id, "amount_usd": 0},
                    headers=ROOT)
    assert r.status_code == 422
