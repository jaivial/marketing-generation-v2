"""Tests for the SQLite + FTS5 storage layer."""
import os
import tempfile
import pytest

from app.core import db as dbmod
from app.services import storage


@pytest.fixture()
def fresh_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    dbmod.reset_db_for_tests(path)
    yield path
    if os.path.exists(path):
        os.unlink(path)


def test_create_and_fetch_user(fresh_db):
    u = storage.create_user(email="Alice@Example.com", password_hash="x", name="Alice")
    assert u["id"].startswith("u-")
    fetched = storage.get_user_by_email("alice@example.com")
    assert fetched["email"] == "alice@example.com"
    assert not fetched["email_confirmed"]  # SQLite stores 0/1


def test_confirm_email(fresh_db):
    u = storage.create_user(email="a@b.com", password_hash="x")
    storage.confirm_email(u["id"])
    assert storage.get_user_by_id(u["id"])["email_confirmed"] == 1


def test_workspace_round_trip(fresh_db):
    u = storage.create_user(email="x@y.com", password_hash="x")
    ws = storage.create_workspace(owner_id=u["id"], name="Acme")
    assert storage.get_workspace(ws["id"])["name"] == "Acme"


def test_onboarding_and_fts5_search(fresh_db):
    u = storage.create_user(email="x@y.com", password_hash="x")
    ws = storage.create_workspace(owner_id=u["id"], name="Acme")
    storage.add_onboarding_note(workspace_id=ws["id"], section="brand",
                                content="We are a luxury paella restaurant in Valencia")
    storage.add_onboarding_note(workspace_id=ws["id"], section="audience",
                                content="Tourists and locals who love Mediterranean cuisine")
    storage.add_onboarding_note(workspace_id=ws["id"], section="tone",
                                content="Warm, sun-drenched, traditional yet refined")
    notes = storage.list_onboarding_notes(ws["id"])
    assert len(notes) == 3

    results = storage.search_workspace_kb(ws["id"], "paella restaurant Valencia")
    assert len(results) >= 1
    assert any("paella" in r["snip"].lower() for r in results)


def test_credit_ledger(fresh_db):
    u = storage.create_user(email="x@y.com", password_hash="x")
    ws = storage.create_workspace(owner_id=u["id"], name="Acme")
    assert storage.get_credit_balance(ws["id"]) == 0
    storage.apply_credit_delta(ws["id"], delta=10.0, reason="topup")
    storage.apply_credit_delta(ws["id"], delta=-2.5, reason="spend:c1")
    assert abs(storage.get_credit_balance(ws["id"]) - 7.5) < 1e-9
    with pytest.raises(ValueError):
        storage.apply_credit_delta(ws["id"], delta=-100.0, reason="overspend")


def test_campaign_lifecycle(fresh_db):
    u = storage.create_user(email="x@y.com", password_hash="x")
    ws = storage.create_workspace(owner_id=u["id"], name="Acme")
    c = storage.create_campaign(
        workspace_id=ws["id"], user_id=u["id"],
        source_kind="url", target="https://example.com",
        duration_s=15, style="cinematic",
    )
    assert c["status"] == "pending"
    storage.set_campaign_status(c["id"], "running")
    storage.add_campaign_asset(c["id"], kind="frame", url="https://img/a.png")
    storage.add_campaign_asset(c["id"], kind="video", url="https://vid/out.mp4", duration_s=15)
    storage.set_campaign_status(c["id"], "done",
                                plan_json={"hook": "hi"},
                                total_cost_usd=0.5, credits_spent=0.75)
    final = storage.get_campaign(c["id"])
    assert final["status"] == "done"
    assert final["plan"]["hook"] == "hi"
    assert abs(final["total_cost_usd"] - 0.5) < 1e-9
    assets = storage.list_campaign_assets(c["id"])
    assert len(assets) == 2
    assert {a["kind"] for a in assets} == {"frame", "video"}
