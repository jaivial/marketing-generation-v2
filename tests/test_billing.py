"""Tests for the billing surface: plans, balance, top-up, checkout, estimate.

No external services are involved — the whole billing path is SQLite plus
pure-python arithmetic, so nothing needs mocking here.
"""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core.acl import Role
from app.services import credits, plans as plan_store, storage


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


@pytest.fixture()
def workspace(client):
    """A user + their workspace, plus the demo auth headers for each role."""
    user = storage.create_user(email="owner@example.com", password_hash="x")
    ws = storage.create_workspace(owner_id=user["id"], name="Acme")
    return {
        "user": user,
        "ws": ws,
        "owner_headers": {
            "Authorization": f"Bearer demo:{int(Role.USER)}:{user['id']}:owner@example.com"
        },
        "root_headers": {"Authorization": f"Bearer demo:{int(Role.ROOT)}:r-1:root@example.com"},
    }


# ─── Estimate ───────────────────────────────────────────────────────────────
def test_estimate_returns_credits_cost(client, workspace):
    r = client.get("/api/campaigns/estimate?duration_s=30",
                   headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    body = r.json()

    # The endpoint must agree with the service layer exactly.
    expected = credits.price_for_user(credits.estimate_campaign_cost(30))
    assert body["credits"] == pytest.approx(expected)
    assert body["duration_s"] == 30
    assert body["credits"] > 0

    # Amounts travel in credits; the dollar mirror uses the shared constant.
    assert body["credit_usd"] == credits.CREDIT_USD
    assert body["usd"] == pytest.approx(body["credits"] * credits.CREDIT_USD, abs=1e-4)

    # A longer video must cost strictly more.
    r15 = client.get("/api/campaigns/estimate?duration_s=15",
                     headers=workspace["owner_headers"])
    assert r15.json()["credits"] < body["credits"]


# ─── Top-up ─────────────────────────────────────────────────────────────────
def test_topup_increments_balance(client, workspace):
    ws_id = workspace["ws"]["id"]

    r = client.get(f"/api/billing/balance?workspace_id={ws_id}",
                   headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["balance_credits"] == 0

    r = client.post("/api/billing/topup",
                    json={"workspace_id": ws_id, "credits": 500},
                    headers=workspace["root_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["balance_credits"] == pytest.approx(500)

    # Top-ups accumulate, and the ledger records the reason.
    client.post("/api/billing/topup",
                json={"workspace_id": ws_id, "credits": 250},
                headers=workspace["root_headers"])
    r = client.get(f"/api/billing/balance?workspace_id={ws_id}",
                   headers=workspace["owner_headers"])
    assert r.json()["balance_credits"] == pytest.approx(750)
    assert storage.get_credit_balance(ws_id) == pytest.approx(750)

    with dbmod.get_db().connection() as conn:
        reasons = [row["reason"] for row in conn.execute(
            "SELECT reason FROM credit_ledger WHERE workspace_id = ?", (ws_id,))]
    assert reasons == ["topup", "topup"]


def test_topup_is_root_only(client, workspace):
    r = client.post("/api/billing/topup",
                    json={"workspace_id": workspace["ws"]["id"], "credits": 100},
                    headers=workspace["owner_headers"])
    assert r.status_code == 403
    assert storage.get_credit_balance(workspace["ws"]["id"]) == 0


# ─── Checkout ───────────────────────────────────────────────────────────────
def test_checkout_records_plan(client, workspace):
    ws_id = workspace["ws"]["id"]
    r = client.post("/api/billing/checkout",
                    json={"workspace_id": ws_id, "plan_name": "Pro"},
                    headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["plan_name"] == "Pro"
    assert body["monthly_credits"] == credits.get_plan("Pro").monthly_credits

    # It landed in the workspace_plan table.
    row = plan_store.get_workspace_plan(ws_id)
    assert row is not None
    assert row["plan_name"] == "Pro"
    assert row["since"] > 0

    # Re-checkout overwrites rather than duplicating (PK on workspace_id).
    r = client.post("/api/billing/checkout",
                    json={"workspace_id": ws_id, "plan_name": "Studio"},
                    headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    assert plan_store.get_workspace_plan(ws_id)["plan_name"] == "Studio"
    with dbmod.get_db().connection() as conn:
        n = conn.execute("SELECT COUNT(*) AS n FROM workspace_plan").fetchone()["n"]
    assert n == 1

    # Checkout is a stub: it must not move any credits.
    assert storage.get_credit_balance(ws_id) == 0


def test_checkout_rejects_unknown_plan(client, workspace):
    r = client.post("/api/billing/checkout",
                    json={"workspace_id": workspace["ws"]["id"], "plan_name": "Enterprise"},
                    headers=workspace["owner_headers"])
    assert r.status_code == 404


def test_checkout_rejects_other_users_workspace(client, workspace):
    other = storage.create_user(email="mallory@example.com", password_hash="x")
    r = client.post("/api/billing/checkout",
                    json={"workspace_id": workspace["ws"]["id"], "plan_name": "Pro"},
                    headers={"Authorization": f"Bearer demo:{int(Role.USER)}:{other['id']}"})
    assert r.status_code == 403
    assert plan_store.get_workspace_plan(workspace["ws"]["id"]) is None


# ─── Plan table ─────────────────────────────────────────────────────────────
def test_plans_endpoint_returns_three_plans(client):
    r = client.get("/api/billing/plans")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 3

    for plan in body:
        assert plan["name"]
        assert plan["tagline"]
        assert plan["monthly_credits"] > 0
        assert plan["price_usd"] > 0
        # The UI needs this to render "max duration per campaign".
        assert plan["cost_per_sec"] > 0

    # Tiers are ordered cheapest-first and allowances grow with price.
    assert [p["name"] for p in body] == ["Starter", "Pro", "Studio"]
    assert [p["monthly_credits"] for p in body] == sorted(
        p["monthly_credits"] for p in body)


def test_plans_endpoint_is_public(client):
    """Guests browse the pricing page before signing up."""
    assert client.get("/api/billing/plans").status_code == 200


# ─── Service-layer invariants ───────────────────────────────────────────────
def test_credit_usd_constant():
    assert credits.CREDIT_USD == 0.01
    assert credits.credits_to_usd(250) == pytest.approx(2.5)


def test_estimate_scales_with_duration():
    a = credits.estimate_campaign_cost(15)
    b = credits.estimate_campaign_cost(45)
    assert b.total_usd > a.total_usd
    assert b.n_frames > a.n_frames
    # Price for the user carries a margin over raw cost.
    assert credits.price_for_user(a) > a.total_usd / credits.CREDIT_USD


def test_balance_defaults_to_own_workspace(client, workspace):
    """The wizard omits workspace_id and just asks for "my balance"."""
    ws_id = workspace["ws"]["id"]
    storage.apply_credit_delta(ws_id, delta=120.0, reason="topup")

    r = client.get("/api/billing/balance", headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["workspace_id"] == ws_id
    assert body["balance_credits"] == pytest.approx(120)


def test_workspace_endpoint_reports_plan_and_balance(client, workspace):
    ws_id = workspace["ws"]["id"]

    r = client.get("/api/billing/workspace", headers=workspace["owner_headers"])
    assert r.status_code == 200, r.text
    assert r.json() == {"workspace_id": ws_id, "plan_name": None, "balance_credits": 0.0}

    client.post("/api/billing/checkout",
                json={"workspace_id": ws_id, "plan_name": "Starter"},
                headers=workspace["owner_headers"])
    r = client.get("/api/billing/workspace", headers=workspace["owner_headers"])
    assert r.json()["plan_name"] == "Starter"


def test_balance_requires_auth(client, workspace):
    r = client.get(f"/api/billing/balance?workspace_id={workspace['ws']['id']}")
    assert r.status_code == 403
