"""Tests for the onboarding wizard endpoints and the workspace RAG helper.

Everything runs against a throw-away SQLite file (``reset_db_for_tests``)
and FastAPI's in-process ``TestClient`` — no network, no external
services.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.services import rag, storage


# ─── Fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture()
def fresh_db():
    """A brand-new SQLite database, torn down afterwards."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    dbmod.reset_db_for_tests(path)
    yield path
    if os.path.exists(path):
        os.unlink(path)


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


@pytest.fixture()
def owner(client):
    """Register a user (which also creates their personal workspace)."""
    r = client.post("/api/auth/register",
                    json={"email": "owner@example.com", "password": "password123",
                          "name": "Owner"})
    assert r.status_code == 201, r.text
    body = r.json()
    return {
        "user_id": body["user"]["id"],
        "workspace_id": body["user"]["workspace_id"],
        "headers": {"Authorization": f"Bearer {body['access_token']}"},
    }


def _seed_notes(workspace_id):
    storage.add_onboarding_note(
        workspace_id=workspace_id, section="brand",
        content="We are a luxury paella restaurant in Valencia by the beach")
    storage.add_onboarding_note(
        workspace_id=workspace_id, section="audience",
        content="Tourists and locals who love authentic Mediterranean cuisine")
    storage.add_onboarding_note(
        workspace_id=workspace_id, section="tone",
        content="Warm, sun-drenched, traditional yet refined")


# ─── rag.workspace_rag_context ──────────────────────────────────────────────
def test_rag_context_returns_markdown_for_query(fresh_db):
    user = storage.create_user(email="a@b.com", password_hash="x")
    ws = storage.create_workspace(owner_id=user["id"], name="Acme")
    _seed_notes(ws["id"])

    ctx = rag.workspace_rag_context(ws["id"], "paella restaurant")

    assert isinstance(ctx, str)
    assert ctx.strip()
    # Markdown headings, named after the onboarding sections.
    assert "### brand" in ctx
    # FTS5 highlight markup must be stripped before it reaches the prompt.
    assert "<b>" not in ctx and "</b>" not in ctx


def test_workspace_rag_context_returns_top_snippets(fresh_db):
    """`limit` must actually cap the snippets, which are joined by the
    documented separator.

    FTS5 combines query tokens with an implicit AND, so the corpus here
    deliberately shares one token ("restaurant") across four sections —
    otherwise a multi-word query matches nothing and the assertions
    below would be vacuous.
    """
    user = storage.create_user(email="c@d.com", password_hash="x")
    ws = storage.create_workspace(owner_id=user["id"], name="Acme")
    for section, content in [
        ("brand", "Our restaurant serves luxury paella in Valencia"),
        ("audience", "Tourists who pick a restaurant for authentic cuisine"),
        ("tone", "Warm refined restaurant voice, sun-drenched"),
        ("usps", "The only restaurant with a beachfront terrace"),
    ]:
        storage.add_onboarding_note(workspace_id=ws["id"], section=section,
                                    content=content)

    # All four notes match; `limit` truncates to the top-ranked ones.
    assert len(rag.workspace_rag_context(ws["id"], "restaurant", limit=1)
               .split(rag.SNIPPET_SEPARATOR)) == 1
    assert len(rag.workspace_rag_context(ws["id"], "restaurant", limit=2)
               .split(rag.SNIPPET_SEPARATOR)) == 2

    many = rag.workspace_rag_context(ws["id"], "restaurant", limit=6)
    snippets = many.split(rag.SNIPPET_SEPARATOR)
    assert len(snippets) == 4
    # Every snippet is a markdown section carrying its section name.
    assert all(s.startswith("### ") for s in snippets)
    assert {"brand", "audience", "tone", "usps"} == {
        s.splitlines()[0].removeprefix("### ").split(" (")[0] for s in snippets
    }

    # Unknown terms / empty input degrade gracefully to "".
    assert rag.workspace_rag_context(ws["id"], "zzzquux") == ""
    assert rag.workspace_rag_context(ws["id"], "") == ""
    assert rag.workspace_rag_context("", "paella") == ""
    assert rag.workspace_rag_context(ws["id"], "paella", limit=0) == ""


def test_rag_context_survives_broken_index(fresh_db, monkeypatch):
    """A failing search must never bubble up into campaign planning."""
    def boom(*_a, **_kw):
        raise RuntimeError("fts5 unavailable")
    monkeypatch.setattr(storage, "search_workspace_kb", boom)
    assert rag.workspace_rag_context("ws-x", "anything") == ""


# ─── POST /api/onboarding/{ws}/sections ─────────────────────────────────────
def test_onboarding_post_persists_to_fts(client, owner):
    ws = owner["workspace_id"]
    payload = [
        {"section": "brand", "content": "Menu Studio AI generates restaurant ads"},
        {"section": "audience", "content": "Independent restaurant owners in Spain"},
        {"section": "tone", "content": "Confident, appetising, no corporate jargon"},
    ]
    r = client.post(f"/api/onboarding/{ws}/sections", json=payload,
                    headers=owner["headers"])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ingested"] == 3
    assert len(body["note_ids"]) == 3

    # Persisted to onboarding_notes, ordered by created_at.
    r = client.get(f"/api/onboarding/{ws}/sections", headers=owner["headers"])
    assert r.status_code == 200, r.text
    rows = r.json()
    assert [row["section"] for row in rows] == ["brand", "audience", "tone"]

    # Mirrored into the FTS5 index and reachable through the RAG route.
    r = client.get(f"/api/onboarding/{ws}/rag",
                   params={"q": "restaurant", "limit": 8},
                   headers=owner["headers"])
    assert r.status_code == 200, r.text
    hits = r.json()
    assert hits["count"] >= 1
    assert {h["title"] for h in hits["results"]} & {"brand", "audience", "tone"}

    # ... and through the service helper the orchestrator uses.
    ctx = rag.workspace_rag_context(ws, "restaurant ads")
    assert "Menu Studio AI" in ctx or "restaurant" in ctx.lower()


def test_onboarding_post_rejects_empty_batch(client, owner):
    r = client.post(f"/api/onboarding/{owner['workspace_id']}/sections",
                    json=[], headers=owner["headers"])
    assert r.status_code == 422


# ─── Authorization ──────────────────────────────────────────────────────────
def test_onboarding_403_when_not_workspace_owner(client, owner):
    """A second, authenticated user cannot read or write someone else's ws."""
    r = client.post("/api/auth/register",
                    json={"email": "intruder@example.com", "password": "password123"})
    assert r.status_code == 201, r.text
    intruder = {"Authorization": f"Bearer {r.json()['access_token']}"}

    victim_ws = owner["workspace_id"]

    r = client.post(f"/api/onboarding/{victim_ws}/sections",
                    json=[{"section": "brand", "content": "hijacked"}],
                    headers=intruder)
    assert r.status_code == 403, r.text
    assert victim_ws in r.json()["detail"]

    r = client.get(f"/api/onboarding/{victim_ws}/sections", headers=intruder)
    assert r.status_code == 403

    r = client.get(f"/api/onboarding/{victim_ws}/rag", params={"q": "brand"},
                   headers=intruder)
    assert r.status_code == 403

    # Nothing leaked into the victim's workspace.
    assert storage.list_onboarding_notes(victim_ws) == []


def test_onboarding_401_for_anonymous_guest(client, owner):
    r = client.get(f"/api/onboarding/{owner['workspace_id']}/sections")
    assert r.status_code == 401


def test_onboarding_owner_can_only_see_own_notes(client, owner):
    ws = owner["workspace_id"]
    client.post(f"/api/onboarding/{ws}/sections",
                json=[{"section": "brand", "content": "only mine"}],
                headers=owner["headers"])

    r = client.post("/api/auth/register",
                    json={"email": "other@example.com", "password": "password123"})
    other = r.json()["user"]["workspace_id"]
    other_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get(f"/api/onboarding/{other}/sections", headers=other_headers)
    assert r.status_code == 200
    assert r.json() == []
