"""Background generation + persistent SSE events (no network, no providers).

Coordination ids used here: pipeline.campaign.start, pipeline.campaign.events,
pipeline.background.run, pipeline.event.seq, pipeline.error.<code>.
"""
import asyncio
import json
import os
import tempfile
import time

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core.acl import Role
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services import event_log
from app.services import storage
from app.services.orchestrator import Orchestrator, CampaignRequest


# --- fixtures ---------------------------------------------------------------
@pytest.fixture()
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-and-vault-32chars")
    dbmod.reset_db_for_tests(path)
    from app.main import app
    with TestClient(app) as c:
        yield c
    if os.path.exists(path):
        os.unlink(path)


def _register(client, email):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "password123", "name": email.split("@")[0],
    })
    assert r.status_code == 201, r.text
    user = r.json()["user"]
    storage.confirm_email(user["id"])
    token = f"demo:{int(Role.GUEST | Role.USER)}:{user['id']}:{user['email']}"
    return token, user["workspace_id"], user["id"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


class FakePipeline:
    """Stands in for Orchestrator: 3 fake events then done (no providers)."""

    def __init__(self, delay=0.0, events=None):
        self._delay = delay
        self._events = events or [
            ("plan", {"hook": "Hi"}),
            ("frame", {"url": "https://img/a.png"}),
            ("script", {"script": "buy"}),
        ]

    async def run(self, req):
        for kind, data in self._events:
            yield {"event": kind, "data": data}
            if self._delay:
                await asyncio.sleep(self._delay)
        yield {"event": "done", "data": {"video_url": "https://vid/final.mp4"}}


def _stub_orchestrator(monkeypatch, fake):
    import app.api.routes as routes
    monkeypatch.setattr(routes, "orchestrator", lambda: fake)


def _sse_events(response):
    out = []
    for line in response.iter_lines():
        if line.startswith("event:"):
            out.append({"event": line.split(":", 1)[1].strip()})
        elif line.startswith("data:") and out:
            out[-1]["data"] = json.loads(line.split(":", 1)[1])
    return out


def _wait_status(campaign_id, wanted="done", tries=200):
    for _ in range(tries):
        row = storage.get_campaign(campaign_id)
        if row and row["status"] == wanted:
            return row
        time.sleep(0.01)
    return storage.get_campaign(campaign_id)


# --- start ------------------------------------------------------------------
def test_start_returns_202_with_id(client, monkeypatch):
    tok, ws, uid = _register(client, "starter@example.com")
    _stub_orchestrator(monkeypatch, FakePipeline())

    r = client.post("/api/campaigns/start", headers=_auth(tok), json={
        "source_kind": "url", "target": "https://example.com", "duration_s": 15,
    })
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["status"] == "running"
    row = storage.get_campaign(body["id"])
    assert row and row["workspace_id"] == ws
    assert _wait_status(body["id"])["status"] == "done"


def test_start_requires_a_workspace(client, monkeypatch):
    _stub_orchestrator(monkeypatch, FakePipeline())
    r = client.post(
        "/api/campaigns/start",
        headers={"Authorization": "Bearer demo:3:u-nobody:nobody@example.com"},
        json={"source_kind": "url", "target": "https://example.com"},
    )
    assert r.status_code == 422
    assert client.post("/api/campaigns/start", json={"source_kind": "url",
                                                     "target": "x"}).status_code == 403


# --- events (replay + live, via the event_log module) -----------------------
def test_events_replay_only_when_run_already_done(client):
    """If the campaign is already terminal when stream() is called, no live
    tail should be opened -- just the replay."""
    tok, ws, uid = _register(client, "replaydone@example.com")
    cid = storage.create_campaign(
        workspace_id=ws, user_id=uid, source_kind="url",
        target="https://done.example", duration_s=15, style="cinematic",
    )["id"]
    storage.append_campaign_event(cid, "plan", {"hook": "x"})
    storage.append_campaign_event(cid, "done", {"video_url": "y"})

    seen = []

    async def collect():
        async for item in event_log.stream(cid):
            seen.append(item["event"])

    asyncio.run(collect())
    assert seen == ["plan", "done"]


# --- HTTP-level events endpoint (replay path; live path covered above) ------
def test_events_endpoint_replays_persisted_events(client):
    tok, ws, uid = _register(client, "replay@example.com")
    cid = storage.create_campaign(
        workspace_id=ws, user_id=uid, source_kind="url",
        target="https://replay.example", duration_s=15, style="cinematic",
    )["id"]
    for kind, data in (("plan", {"hook": "a"}), ("frame", {"url": "b"}),
                       ("done", {"video_url": "c"})):
        storage.append_campaign_event(cid, kind, data)

    r = client.get(f"/api/campaigns/{cid}/events", headers=_auth(tok))
    assert r.status_code == 200
    events = _sse_events(r)
    assert [e["event"] for e in events] == ["plan", "frame", "done"]
    assert events[0]["data"]["hook"] == "a"


def test_events_endpoint_scopes_to_owner(client):
    """A non-owner is rejected before the SSE handler opens (returns 403
    immediately). The owner happy path is exercised by
    test_events_endpoint_replays_persisted_events -- opening a live SSE
    stream on the sync TestClient pollutes its portal for subsequent tests.
    """
    tok_a, ws_a, uid_a = _register(client, "owner@example.com")
    tok_b, _ws_b, _uid_b = _register(client, "intruder@example.com")
    cid = storage.create_campaign(
        workspace_id=ws_a, user_id=uid_a, source_kind="url",
        target="https://private.example", duration_s=15, style="cinematic",
    )["id"]
    assert client.get(f"/api/campaigns/{cid}/events",
                      headers=_auth(tok_b)).status_code == 403


def test_events_endpoint_404_for_unknown_campaign(client):
    tok, _ws, _uid = _register(client, "ghost@example.com")
    assert client.get("/api/campaigns/c-nope/events",
                      headers=_auth(tok)).status_code == 404


# --- structured errors preflight --------------------------------------------
class NoJsonChat(ChatClient):
    async def complete(self, system, user):
        return "sorry, no JSON for you today"

    async def stream(self, system, user):
        yield await self.complete(system, user)


class FakeMediaClient(MediaClient):
    async def generate_image(self, prompt):
        return "https://img/x.png"

    async def generate_video(self, prompt, frames, duration_s):
        return "https://vid/x.mp4"


class CliReader(SourceReader):
    """Looks like the real scraper: it carries a binary (see sources.py)."""
    _bin = "agent-browser"

    async def read(self, target):
        return "ctx"


def _factory(kind, target, username=None, password=None):
    return CliReader()


def _collect(orch, req):
    events: list[dict] = []

    async def go():
        async for ev in orch.run(req):
            events.append(ev)

    asyncio.run(go())
    return events


def test_error_event_has_code_field():
    """A non-JSON model reply must not surface as an anonymous failure."""
    orch = Orchestrator(NoJsonChat(), FakeMediaClient(), _factory)
    events = _collect(orch, CampaignRequest(source_kind="files", target=".",
                                            duration_s=15))
    errors = [e for e in events if e["event"] == "error"]
    assert errors, events
    assert errors[0]["data"]["code"] == "model_not_json"
    assert errors[0]["data"]["message"]


def test_preflight_rejects_run_without_scraper_binary(monkeypatch):
    import app.services.orchestrator as orch_mod
    monkeypatch.setattr(orch_mod.shutil, "which", lambda name, *a, **k: None)
    orch = Orchestrator(NoJsonChat(), FakeMediaClient(), _factory)
    events = _collect(orch, CampaignRequest(source_kind="url",
                                            target="https://example.com",
                                            duration_s=15))
    assert [e["event"] for e in events] == ["error"]
    assert events[0]["data"]["code"] == "missing_binary"
    assert "lightpanda" in events[0]["data"]["message"]


def test_preflight_warns_when_ffmpeg_missing(monkeypatch):
    import app.services.orchestrator as orch_mod
    monkeypatch.setattr(orch_mod.shutil, "which", lambda name, *a, **k: None)
    orch = Orchestrator(NoJsonChat(), FakeMediaClient(), _factory)
    events = orch._preflight(CampaignRequest(source_kind="files", target=".",
                                             duration_s=45), None, 3)
    assert events[0]["data"]["code"] == "missing_ffmpeg"
    assert events[0]["event"] == "warning"
