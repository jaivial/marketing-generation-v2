"""Campaign persistence: history list, detail endpoint, orchestrator writes.

Everything external is faked -- no network, no agent-browser, no Wavespeed.
The HTTP tests drive the real FastAPI app against a throwaway SQLite file.
"""
import asyncio
import json
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core.acl import Role
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services import storage
from app.services.campaign_view import (
    campaign_summary, color_for, ui_status,
)
from app.services.orchestrator import CampaignRequest, Orchestrator
from app.services.wavespeed_client import WavespeedCLI


# ───────────────────────── fixtures ─────────────────────────
@pytest.fixture()
def client(monkeypatch):
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


def _register(client, email):
    """Register + confirm a user; return (token, workspace_id, user_id).

    ``app.main.ACLMiddleware`` resolves principals from the *demo* token
    format only, so the token we hand back is a demo token carrying the real
    user id. The workspace lookup in the endpoint keys off that id, so this
    exercises exactly the same code path a JWT caller will once the
    middleware learns to verify JWTs.
    """
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


def _seed(workspace_id, user_id, *, target, duration_s=30, status="done",
          plan_json=None, assets=()):
    row = storage.create_campaign(
        workspace_id=workspace_id, user_id=user_id, source_kind="url",
        target=target, duration_s=duration_s, style="cinematic",
    )
    cid = row["id"]
    if status != "pending":
        storage.set_campaign_status(cid, status, plan_json=plan_json)
    for kind, url in assets:
        storage.add_campaign_asset(cid, kind=kind, url=url)
    return cid


# ───────────────────────── history ─────────────────────────
def test_history_returns_only_callers_workspace(client):
    tok_a, ws_a, u_a = _register(client, "alice@example.com")
    tok_b, ws_b, u_b = _register(client, "bob@example.com")

    a1 = _seed(ws_a, u_a, target="https://alice-one.example")
    a2 = _seed(ws_a, u_a, target="https://alice-two.example", status="running")
    b1 = _seed(ws_b, u_b, target="https://bob-only.example")

    r = client.get("/api/campaigns/history", headers=_auth(tok_a))
    assert r.status_code == 200, r.text
    camps = r.json()["campaigns"]
    ids = {c["id"] for c in camps}
    assert ids == {a1, a2}
    assert b1 not in ids
    # Nothing from Bob's workspace leaks through the names either.
    assert all("bob-only" not in c["name"] for c in camps)

    r = client.get("/api/campaigns/history", headers=_auth(tok_b))
    assert {c["id"] for c in r.json()["campaigns"]} == {b1}


def test_history_row_shape_matches_frontend_table(client):
    tok, ws, uid = _register(client, "shape@example.com")
    cid = _seed(ws, uid, target="https://shape.example", duration_s=45)

    r = client.get("/api/campaigns/history", headers=_auth(tok))
    row = r.json()["campaigns"][0]
    for key in ("id", "name", "duration_s", "status", "created_at", "color"):
        assert key in row, f"{key} missing -- Campaigns.tsx would break"
    assert row["id"] == cid
    # Name falls back to the target because the schema has no name column.
    assert row["name"] == "https://shape.example"
    assert row["duration_s"] == 45
    assert row["status"] == "done"
    assert isinstance(row["created_at"], int) and row["created_at"] > 0
    assert row["color"].startswith("from-")


def test_history_maps_running_status_to_generating(client):
    tok, ws, uid = _register(client, "running@example.com")
    _seed(ws, uid, target="https://running.example", status="running")
    r = client.get("/api/campaigns/history", headers=_auth(tok))
    assert r.json()["campaigns"][0]["status"] == "generating"


def test_history_empty_for_workspaceless_principal(client):
    # A demo-token principal has the permission but no workspace at all.
    r = client.get(
        "/api/campaigns/history",
        headers={"Authorization": "Bearer demo:3:u-nobody:nobody@example.com"},
    )
    assert r.status_code == 200
    assert r.json()["campaigns"] == []


def test_history_requires_auth(client):
    r = client.get("/api/campaigns/history")
    assert r.status_code == 403


# ───────────────────────── detail ─────────────────────────
PLAN_BLOB = {
    "plan": {"hook": "Ship faster", "tagline": "Less code",
             "cta": "Try it", "audience": "devs", "tone": "bold"},
    "frames": ["https://img/a.png", "https://img/b.png"],
    "script": "Scene one. Scene two. Scene three.",
    "video_url": "https://vid/final.mp4",
    "screenshots": ["https://shot/1.png"],
    "multi_scene": False,
}


def test_detail_returns_plan_and_assets(client):
    tok, ws, uid = _register(client, "detail@example.com")
    cid = _seed(
        ws, uid, target="https://detail.example", plan_json=PLAN_BLOB,
        assets=[("frame", "https://img/a.png"), ("frame", "https://img/b.png"),
                ("video", "https://vid/final.mp4")],
    )

    r = client.get(f"/api/campaigns/{cid}", headers=_auth(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"campaign", "plan", "assets"}

    assert body["campaign"]["id"] == cid
    assert body["campaign"]["status"] == "done"

    plan = body["plan"]
    assert plan["plan"]["hook"] == "Ship faster"
    assert plan["script"] == "Scene one. Scene two. Scene three."
    assert plan["frames"] == ["https://img/a.png", "https://img/b.png"]
    assert plan["video_url"] == "https://vid/final.mp4"

    kinds = [a["kind"] for a in body["assets"]]
    assert kinds.count("frame") == 2
    assert "video" in kinds


def test_detail_404_for_unknown_campaign(client):
    tok, _ws, _uid = _register(client, "missing@example.com")
    r = client.get("/api/campaigns/c-does-not-exist", headers=_auth(tok))
    assert r.status_code == 404


def test_detail_403_for_other_workspace(client):
    tok_a, ws_a, u_a = _register(client, "owner@example.com")
    tok_b, _ws_b, _u_b = _register(client, "intruder@example.com")
    cid = _seed(ws_a, u_a, target="https://private.example")

    r = client.get(f"/api/campaigns/{cid}", headers=_auth(tok_b))
    assert r.status_code == 403
    # And the owner still gets it.
    assert client.get(f"/api/campaigns/{cid}", headers=_auth(tok_a)).status_code == 200


def test_detail_works_without_persisted_plan(client):
    tok, ws, uid = _register(client, "noplan@example.com")
    cid = _seed(ws, uid, target="https://noplan.example", status="running")
    r = client.get(f"/api/campaigns/{cid}", headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["plan"]["plan"] is None
    assert r.json()["plan"]["frames"] == []


# ───────────────────────── orchestrator persistence ─────────────────────────
class FakeChat(ChatClient):
    async def complete(self, system, user):
        u = user.lower()
        # Order matters: the script prompt also embeds "Frames: [...]", so we
        # match the most specific marker of each step first.
        if "vo script" in u:
            return "A short script."
        if "sequential visual prompts" in u:
            return json.dumps({"frames": [{"t": 0, "prompt": "open"},
                                          {"t": 20, "prompt": "close"}]})
        if "decide the video generation strategy" in u or "multi_scene" in u:
            return json.dumps({"multi_scene": False,
                               "include_screenshots": False,
                               "rationale": "single",
                               "scenes": [{"title": "Ad", "prompt": ""}]})
        if "JSON with keys" in user:
            return json.dumps({"hook": "Hi", "tagline": "Fast", "cta": "Try",
                               "audience": "devs", "tone": "witty"})
        return "A short script."

    async def stream(self, system, user):
        for w in (await self.complete(system, user)).split():
            yield w


class FakeMedia(MediaClient):
    def __init__(self):
        self.images = []

    async def generate_image(self, prompt):
        url = f"https://img/{len(self.images)}.png"
        self.images.append(url)
        return url

    async def generate_video(self, prompt, frames, duration_s):
        return "https://vid/out.mp4"


class FakeWavespeed(WavespeedCLI):
    def __init__(self):
        super().__init__(bin_path="/bin/true")

    async def capture_screenshot(self, *a, **k):  # type: ignore[override]
        return "https://shot/fake.png"

    async def generate_video(self, prompt, frames, duration_s, **k):  # type: ignore[override]
        return "https://vid/out.mp4"

    async def generate_video_scenes(self, plan, master_prompt="", **k):  # type: ignore[override]
        return [f"https://vid/clip_{c.index}.mp4" for c in plan.clips]


class FakeStorage:
    """Records every persistence call the orchestrator makes."""

    def __init__(self):
        self.created = []
        self.statuses = []
        self.assets = []
        self._n = 0

    def create_campaign(self, **kw):
        self._n += 1
        cid = f"c-fake{self._n}"
        self.created.append({"id": cid, **kw})
        return {"id": cid, **kw}

    def set_campaign_status(self, campaign_id, status, **kw):
        self.statuses.append({"id": campaign_id, "status": status, **kw})

    def add_campaign_asset(self, campaign_id, *, kind, url, duration_s=None,
                           metadata=None):
        self.assets.append({"id": campaign_id, "kind": kind, "url": url,
                            "duration_s": duration_s, "metadata": metadata})
        return len(self.assets)


def _reader_factory(kind, target, username=None, password=None):
    class R(SourceReader):
        async def read(self, t):
            return "project context"
    return R()


def _run(orch, req):
    events = []

    async def go():
        async for ev in orch.run(req):
            events.append(ev)

    asyncio.run(go())
    return events


def test_orchestrator_persists_on_done():
    store = FakeStorage()
    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://persist.example", duration_s=30,
        workspace_id="ws-1", user_id="u-1",
    ))

    kinds = [e["event"] for e in events]
    assert "error" not in kinds, events
    assert kinds[-1] == "done"

    # 1. The row is created up-front and marked running before any work.
    assert len(store.created) == 1
    assert store.created[0]["workspace_id"] == "ws-1"
    assert store.created[0]["user_id"] == "u-1"
    assert store.statuses[0]["status"] == "running"
    cid = store.created[0]["id"]

    # 2. The final status write carries the plan blob + costs.
    done = store.statuses[-1]
    assert done["id"] == cid
    assert done["status"] == "done"
    blob = done["plan_json"]
    assert blob["plan"]["hook"] == "Hi"
    assert blob["video_url"] == "https://vid/out.mp4"
    assert blob["script"] == "A short script."
    assert len(blob["frames"]) == 2
    assert blob["multi_scene"] is False
    assert done["total_cost_usd"] > 0
    assert done["credits_spent"] >= done["total_cost_usd"]

    # 3. One asset row per frame plus the final video.
    frames = [a for a in store.assets if a["kind"] == "frame"]
    videos = [a for a in store.assets if a["kind"] == "video"]
    assert len(frames) == 2
    assert len(videos) == 1
    assert videos[0]["url"] == "https://vid/out.mp4"
    assert videos[0]["duration_s"] == 30
    assert all(a["id"] == cid for a in store.assets)


def test_orchestrator_emits_campaign_id_on_every_event():
    store = FakeStorage()
    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://ids.example", duration_s=15,
        workspace_id="ws-1", user_id="u-1",
    ))
    cid = store.created[0]["id"]
    assert events[0]["event"] == "campaign"
    assert events[0]["data"]["campaign_id"] == cid
    assert all(e["data"].get("campaign_id") == cid for e in events)


def test_campaign_id_stamp_does_not_leak_into_persisted_plan():
    """Regression: stamping campaign_id onto SSE events must not mutate the
    plan dict that gets written to plan_json."""
    store = FakeStorage()
    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://leak.example", duration_s=15,
        workspace_id="ws-1", user_id="u-1",
    ))
    # The event the client sees does carry the id...
    plan_ev = next(e for e in events if e["event"] == "plan")
    assert plan_ev["data"]["campaign_id"] == store.created[0]["id"]
    # ...but the persisted plan is the clean model output.
    stored_plan = store.statuses[-1]["plan_json"]["plan"]
    assert "campaign_id" not in stored_plan
    assert set(stored_plan) == {"hook", "tagline", "cta", "audience", "tone"}


def test_orchestrator_skips_persistence_without_workspace():
    store = FakeStorage()
    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://ephemeral.example", duration_s=15,
    ))
    assert [e["event"] for e in events][-1] == "done"
    assert store.created == []
    assert store.statuses == []
    assert store.assets == []


def test_orchestrator_marks_failed_on_error():
    class Boom(FakeChat):
        async def complete(self, system, user):
            raise RuntimeError("model exploded")

    store = FakeStorage()
    orch = Orchestrator(Boom(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://boom.example",
        workspace_id="ws-1", user_id="u-1",
    ))
    assert events[-1]["event"] == "error"
    assert store.statuses[-1]["status"] == "failed"


def test_orchestrator_survives_storage_outage():
    """A broken store must not take the user's video down with it."""
    class BrokenStorage(FakeStorage):
        def create_campaign(self, **kw):
            raise RuntimeError("db is on fire")

    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=BrokenStorage())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://outage.example",
        workspace_id="ws-1", user_id="u-1",
    ))
    assert [e["event"] for e in events][-1] == "done"


# ───────────────────── end-to-end: run then read back ─────────────────────
def test_run_then_history_and_detail_roundtrip(client):
    tok, ws, uid = _register(client, "e2e@example.com")
    orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://e2e.example", duration_s=15,
        workspace_id=ws, user_id=uid,
    ))
    assert [e["event"] for e in events][-1] == "done"

    r = client.get("/api/campaigns/history", headers=_auth(tok))
    camps = r.json()["campaigns"]
    assert len(camps) == 1
    assert camps[0]["status"] == "done"
    assert camps[0]["name"] == "https://e2e.example"

    cid = camps[0]["id"]
    d = client.get(f"/api/campaigns/{cid}", headers=_auth(tok)).json()
    assert d["plan"]["video_url"] == "https://vid/out.mp4"
    assert len(d["plan"]["frames"]) >= 2
    assert any(a["kind"] == "video" for a in d["assets"])


# ───────────────────────── view helpers ─────────────────────────
def test_color_for_is_stable_and_in_palette():
    from app.services.campaign_view import GRADIENTS
    a = color_for("c-abc123")
    assert a == color_for("c-abc123")
    assert a in GRADIENTS


def test_ui_status_maps_unknown_to_draft():
    assert ui_status("pending") == "draft"
    assert ui_status("running") == "generating"
    assert ui_status("done") == "done"
    assert ui_status("failed") == "failed"
    assert ui_status(None) == "draft"
    assert ui_status("who-knows") == "draft"


def test_campaign_summary_falls_back_to_target():
    row = {"id": "c-1", "target": "/srv/projects/acme", "duration_s": 30,
           "status": "done", "created_at": 1.5}
    out = campaign_summary(row)
    assert out["name"] == "/srv/projects/acme"
    assert out["created_at"] == 1500


# ───────────────────── multi-scene + screenshot persistence ─────────────────
class MultiSceneChat(FakeChat):
    async def complete(self, system, user):
        u = user.lower()
        if "decide the video generation strategy" in u or "multi_scene" in u:
            return json.dumps({
                "multi_scene": True,
                "include_screenshots": True,
                "rationale": "distinct beats",
                "scenes": [{"title": "Hook", "prompt": "p1"},
                           {"title": "CTA", "prompt": "p2"}],
                "screenshot_pages": ["https://multi.example/dashboard"],
            })
        return await FakeChat.complete(self, system, user)


def test_orchestrator_persists_scene_clips_and_screenshots():
    store = FakeStorage()
    orch = Orchestrator(MultiSceneChat(), FakeMedia(), _reader_factory,
                        wavespeed=FakeWavespeed(), storage=store)
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://multi.example", duration_s=45,
        workspace_id="ws-1", user_id="u-1",
    ))
    assert [e["event"] for e in events][-1] == "done"

    done = store.statuses[-1]
    assert done["status"] == "done"
    assert done["plan_json"]["multi_scene"] is True
    assert len(done["plan_json"]["scenes"]) == 2
    assert done["plan_json"]["screenshots"] == ["https://shot/fake.png"]

    kinds = [a["kind"] for a in store.assets]
    assert kinds.count("screenshot") == 1
    assert kinds.count("stitched") == 2
    assert kinds.count("video") == 1


def test_cost_grows_with_duration():
    """Longer videos and more frames must cost strictly more."""
    def run_for(duration_s):
        store = FakeStorage()
        orch = Orchestrator(FakeChat(), FakeMedia(), _reader_factory,
                            wavespeed=FakeWavespeed(), storage=store)
        _run(orch, CampaignRequest(
            source_kind="url", target="https://cost.example",
            duration_s=duration_s, workspace_id="ws-1", user_id="u-1",
        ))
        return store.statuses[-1]["total_cost_usd"]

    assert run_for(45) > run_for(15)


# ───────────────────────── JWT readiness ─────────────────────────
# NOTE ON AUTH: ``app.main.ACLMiddleware`` resolves principals with
# ``_resolve_principal``, which only understands the *demo* token format --
# it never calls ``jwt_decode``. So a caller presenting a real JWT from
# ``/api/auth/login`` is seen as a guest and rejected by the middleware
# before any endpoint runs. That is a pre-existing gap in the middleware
# (it predates this change and lives in ``app/main.py``, which this task is
# not allowed to modify), not in these endpoints.
#
# The test below pins down the half we *do* own: mounted without the
# middleware, the router's own ``require_permission`` dependency resolves a
# real JWT via ``get_current_principal`` and scopes the query to that user's
# workspace correctly. It will keep passing once the middleware learns to
# verify JWTs.
def test_endpoints_scope_correctly_for_a_real_jwt(client):
    from fastapi import FastAPI

    from app.api.routes import router
    from app.core.security import jwt_for_user

    r = client.post("/api/auth/register", json={
        "email": "jwt@example.com", "password": "password123", "name": "Jay",
    })
    user = r.json()["user"]
    storage.confirm_email(user["id"])
    ws = user["workspace_id"]
    cid = _seed(ws, user["id"], target="https://jwt.example",
                plan_json=PLAN_BLOB)

    # A second workspace whose campaign must stay invisible.
    r2 = client.post("/api/auth/register", json={
        "email": "other@example.com", "password": "password123",
    })
    other = r2.json()["user"]
    other_cid = _seed(other["workspace_id"], other["id"],
                      target="https://other.example")

    bare = FastAPI()
    bare.include_router(router, prefix="/api")
    token = jwt_for_user(user["id"], user["email"])
    with TestClient(bare) as bc:
        h = {"Authorization": f"Bearer {token}"}

        resp = bc.get("/api/campaigns/history", headers=h)
        assert resp.status_code == 200, resp.text
        assert [c["id"] for c in resp.json()["campaigns"]] == [cid]

        assert bc.get(f"/api/campaigns/{cid}", headers=h).status_code == 200
        # Cross-workspace access is still denied for a JWT caller.
        assert bc.get(f"/api/campaigns/{other_cid}", headers=h).status_code == 403
