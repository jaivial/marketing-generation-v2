"""Real-JWT-first middleware (obs: tests.auth.middleware, coord: auth.jwt-first).

The middleware must trust a signed JWT before anything else, and must ignore
demo tokens / the ``X-Demo-Principal`` header unless the dev bypass is on.
"""
import os
import tempfile

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core import security
from app.core.acl import DEV_AUTH_BYPASS_ENV, Role, get_current_principal
from app.services import storage


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-signing-32-chars")
    monkeypatch.delenv(DEV_AUTH_BYPASS_ENV, raising=False)  # production default
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    dbmod.reset_db_for_tests(path)
    yield monkeypatch
    if os.path.exists(path):
        os.unlink(path)


@pytest.fixture()
def client(env):
    """Minimal app wired to the real ACL dependency (no demo middleware)."""
    app = FastAPI()

    @app.get("/principal")
    def principal_view(principal: object = Depends(get_current_principal)):
        return {"id": principal.id, "email": principal.email,
                "roles": int(principal.roles)}

    with TestClient(app) as c:
        yield c


def _user(email="jwt-user@example.com"):
    return storage.create_user(
        email=email, password_hash=security.hash_password("password123"),
        name="JWT User",
    )


def test_demo_token_is_guest_without_bypass(client):
    r = client.get("/principal", headers={"Authorization": "Bearer demo:5:u-001:x@y"})
    assert r.status_code == 200
    assert r.json() == {"id": "guest", "email": "", "roles": int(Role.GUEST)}


def test_real_jwt_resolves_the_principal(client):
    user = _user()
    token = security.jwt_for_user(user["id"], user["email"])
    r = client.get("/principal", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == user["id"]
    assert body["email"] == user["email"]
    assert body["roles"] == int(user["roles"])


def test_demo_token_works_with_bypass(client, env):
    env.setenv(DEV_AUTH_BYPASS_ENV, "1")  # obs: auth.dev_bypass.on
    r = client.get("/principal", headers={"Authorization": "Bearer demo:5:u-001:x@y"})
    assert r.status_code == 200
    assert r.json()["id"] == "u-001"
    assert r.json()["roles"] == 5


def test_demo_header_is_ignored_without_bypass(client):
    r = client.get("/principal", headers={"X-Demo-Principal": "62:root:x"})
    assert r.status_code == 200
    assert r.json()["id"] == "guest"
