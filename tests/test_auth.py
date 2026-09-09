"""Tests for the auth flow: register -> confirm -> login -> whoami + JWT."""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core import security


@pytest.fixture()
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-signing-32-chars")
    monkeypatch.setenv("SKIP_EMAIL_CONFIRM", "")  # require confirmation in tests
    # Demo bearer tokens are dev-only now (obs: tests.auth.dev_bypass).
    monkeypatch.setenv("MSWEA_DEV_AUTH_BYPASS", "1")
    dbmod.reset_db_for_tests(path)
    from app.main import app
    with TestClient(app) as c:
        yield c
    if os.path.exists(path):
        os.unlink(path)


def test_register_creates_user_and_returns_token(client):
    r = client.post("/api/auth/register", json={
        "email": "alice@example.com", "password": "password123", "name": "Alice",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert "access_token" in body
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["email_confirmed"] is False


def test_register_rejects_duplicate(client):
    client.post("/api/auth/register", json={"email": "x@y.com", "password": "password123"})
    r = client.post("/api/auth/register", json={"email": "x@y.com", "password": "password123"})
    assert r.status_code == 409


def test_login_blocked_until_confirmed(client):
    client.post("/api/auth/register", json={"email": "x@y.com", "password": "password123"})
    r = client.post("/api/auth/login", json={"email": "x@y.com", "password": "password123"})
    assert r.status_code == 403


def test_confirm_then_login(client):
    client.post("/api/auth/register", json={"email": "x@y.com", "password": "password123"})
    # Fetch the code from the DB (the emailer stub does nothing in tests)
    with dbmod.get_db().connection() as conn:
        row = conn.execute("SELECT confirm_otp FROM users WHERE email = 'x@y.com'").fetchone()
    r = client.post("/api/auth/confirm", json={"otp": row["confirm_otp"]})
    assert r.status_code == 200, r.text
    # Now login works
    r = client.post("/api/auth/login", json={"email": "x@y.com", "password": "password123"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["email_confirmed"] is True


def test_login_rejects_wrong_password(client):
    client.post("/api/auth/register", json={"email": "x@y.com", "password": "password123"})
    with dbmod.get_db().connection() as conn:
        row = conn.execute("SELECT confirm_token FROM users WHERE email = 'x@y.com'").fetchone()
    client.post("/api/auth/confirm", json={"token": row["confirm_token"]})
    r = client.post("/api/auth/login", json={"email": "x@y.com", "password": "WRONG"})
    assert r.status_code == 401


def test_whoami_with_jwt(client):
    r = client.post("/api/auth/register", json={"email": "w@x.com", "password": "password123"})
    token = r.json()["access_token"]
    r = client.get("/api/auth/whoami", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "w@x.com"
    assert r.json()["is_authenticated"] is True


def test_whoami_without_token_is_guest(client):
    r = client.get("/api/auth/whoami")
    assert r.status_code == 200
    assert r.json()["is_authenticated"] is False


def test_jwt_roundtrip(monkeypatch):
    monkeypatch.setenv("vault_key", "test-secret-key")
    tok = security.jwt_for_user("u-001", "a@b.com")
    payload = security.jwt_decode(tok)
    assert payload["sub"] == "u-001"
    assert payload["email"] == "a@b.com"


def test_jwt_tampered_is_rejected(monkeypatch):
    monkeypatch.setenv("vault_key", "test-secret-key")
    tok = security.jwt_for_user("u-001", "a@b.com")
    # flip a char inside the signature body -- the trailing char sits on
    # base64 padding bits, so flipping it can leave the bytes untouched.
    bad = tok[:-2] + ("A" if tok[-2] != "A" else "B") + tok[-1]
    assert security.jwt_decode(bad) is None
