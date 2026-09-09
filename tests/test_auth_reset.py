"""Forgot / reset password flow (obs: tests.auth.reset, coord: auth.reset.flow)."""
import os
import tempfile
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod
from app.core.security import verify_password
from app.services import storage


@pytest.fixture()
def reset_env(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DB_PATH", path)
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-signing-32-chars")
    monkeypatch.setenv("SKIP_EMAIL_CONFIRM", "")
    dbmod.reset_db_for_tests(path)
    sent: list[dict] = []

    def _fake_send(**kwargs):  # coord: auth.reset.mail.stub -- no SMTP in tests
        sent.append(kwargs)
        return True

    monkeypatch.setattr("app.api.auth.send_password_reset_email", _fake_send)
    from app.main import app
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, sent=sent)
    if os.path.exists(path):
        os.unlink(path)


EMAIL = "reset-user@example.com"


def _register(client, email=EMAIL):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "password123", "name": "Reset User",
    })
    assert r.status_code == 201, r.text
    return r.json()


def _forgot(client, email=EMAIL):
    return client.post("/api/auth/forgot-password", json={"email": email})


def _token_from_link(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


def _row(email=EMAIL):
    with dbmod.get_db().connection() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()


def test_forgot_password_mails_reset_link_and_stores_token(reset_env):
    _register(reset_env.client)
    r = _forgot(reset_env.client)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    assert len(reset_env.sent) == 1
    mailed = reset_env.sent[0]
    assert mailed["to"] == EMAIL
    assert mailed["link"].startswith("https://")
    token = _token_from_link(mailed["link"])
    assert len(token) >= 32
    row = _row()
    assert row["reset_token"] == token
    assert row["reset_expires"] - time.time() == pytest.approx(
        storage.PASSWORD_RESET_TTL_SECONDS, abs=5
    )
    assert row["last_password_reset_at"] is not None


def test_forgot_password_unknown_email_returns_200_without_leak(reset_env):
    r = _forgot(reset_env.client, "nobody@example.com")
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    assert reset_env.sent == []


def test_forgot_password_rate_limited_to_60s(reset_env):
    _register(reset_env.client)
    assert _forgot(reset_env.client).status_code == 200
    assert len(reset_env.sent) == 1
    limited = _forgot(reset_env.client)
    assert limited.status_code == 429
    assert len(reset_env.sent) == 1  # no second mail went out
    with dbmod.get_db().write() as conn:  # obs: auth.reset.cooldown elapsed
        conn.execute(
            "UPDATE users SET last_password_reset_at = ? WHERE email = ?",
            (time.time() - storage.PASSWORD_RESET_COOLDOWN_SECONDS - 1, EMAIL),
        )
    assert _forgot(reset_env.client).status_code == 200
    assert len(reset_env.sent) == 2


def test_reset_password_with_valid_token_updates_hash(reset_env):
    _register(reset_env.client)
    _forgot(reset_env.client)
    token = _token_from_link(reset_env.sent[0]["link"])
    r = reset_env.client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "brand-new-pass"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}
    row = _row()
    assert verify_password("brand-new-pass", row["password_hash"])
    assert not verify_password("password123", row["password_hash"])
    assert row["email_confirmed"] == 0  # confirmation state untouched


def test_reset_password_with_expired_token_rejected(reset_env):
    _register(reset_env.client)
    _forgot(reset_env.client)
    token = _token_from_link(reset_env.sent[0]["link"])
    with dbmod.get_db().write() as conn:  # obs: auth.reset.expired
        conn.execute(
            "UPDATE users SET reset_expires = ? WHERE email = ?", (time.time() - 1, EMAIL)
        )
    r = reset_env.client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "brand-new-pass"},
    )
    assert r.status_code == 400
    assert verify_password("password123", _row()["password_hash"])


def test_reset_password_with_wrong_token_rejected(reset_env):
    _register(reset_env.client)
    _forgot(reset_env.client)
    r = reset_env.client.post(
        "/api/auth/reset-password",
        json={"token": "f" * 43, "new_password": "brand-new-pass"},
    )
    assert r.status_code == 400
    assert verify_password("password123", _row()["password_hash"])


def test_reset_clears_token_so_it_cannot_be_reused(reset_env):
    _register(reset_env.client)
    _forgot(reset_env.client)
    token = _token_from_link(reset_env.sent[0]["link"])
    first = reset_env.client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "brand-new-pass"},
    )
    assert first.status_code == 200
    row = _row()
    assert row["reset_token"] is None and row["reset_expires"] is None
    replay = reset_env.client.post(
        "/api/auth/reset-password",
        json={"token": token, "new_password": "another-pass-1"},
    )
    assert replay.status_code == 400
    assert verify_password("brand-new-pass", _row()["password_hash"])
    assert _row()["email_confirmed"] == 0
