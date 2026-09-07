"""Tests for the Gmail SMTP vault (encrypt / decrypt round-trip + admin CRUD)."""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.core import db as dbmod, vault
from app.services import storage



@pytest.fixture(autouse=True)
def _vault_key(monkeypatch):
    monkeypatch.setenv("vault_key", "test-secret-key-for-jwt-and-vault")
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


def test_vault_encrypt_decrypt_roundtrip():
    plain = "abcd efgh ijkl mnop"
    ct, nonce = vault.encrypt(plain)
    assert ct != plain
    assert vault.decrypt(ct, nonce) == plain


def test_vault_wrong_nonce_fails():
    ct, _nonce = vault.encrypt("secret-1234")
    import secrets, base64
    bad_nonce = base64.b64encode(secrets.token_bytes(12)).decode()
    with pytest.raises(Exception):
        vault.decrypt(ct, bad_nonce)


def test_admin_upsert_then_get(client):
    # First create a user + workspace via register
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "password123"})
    user = r.json()["user"]
    ws_id = user["workspace_id"]
    assert ws_id

    # Use root override to set vault
    headers = {"X-Demo-Principal": "62:root:x"}  # 62 = GUEST|USER|ADMIN|ROOT
    payload = {
        "workspace_id": ws_id,
        "sender_email": "noreply@menustudioai.com",
        "app_password": "abcd-efgh-ijkl-mnop",
    }
    r = client.put("/api/admin/email-vault", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sender_email"] == "noreply@menustudioai.com"
    assert body["configured"] is True
    assert body["app_password" if "app_password" in body else "configured"] is True

    # GET \u2014 plaintext password must NOT be in the response
    r = client.get(f"/api/admin/email-vault/{ws_id}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "app_password" not in body
    assert body["sender_email"] == "noreply@menustudioai.com"


def test_admin_vault_requires_root(client):
    headers = {"X-Demo-Principal": "2:user:x"}  # USER only \u2014 not root
    r = client.put("/api/admin/email-vault", json={
        "workspace_id": "ws-anything",
        "sender_email": "x@y.com",
        "app_password": "password-long-enough",
    }, headers=headers)
    assert r.status_code == 403


def test_storage_roundtrip_through_vault(fresh_db):
    """Verify the storage layer can read what the vault layer wrote."""
    import uuid
    user = storage.create_user(email=f"u-{uuid.uuid4().hex[:6]}@x.com", password_hash="x")
    ws = storage.create_workspace(owner_id=user["id"], name="t")
    plain = "my-google-app-password"
    ct, nonce = vault.encrypt(plain)
    storage.upsert_email_vault(workspace_id=ws["id"],
                               sender_email="bot@example.com",
                               ct_b64=ct, nonce_b64=nonce)
    row = storage.get_email_vault(ws["id"])
    assert row["sender_email"] == "bot@example.com"
    decrypted = vault.decrypt(row["app_password_ct"], row["app_password_nonce"])
    assert decrypted == plain

@pytest.fixture()
def fresh_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    dbmod.reset_db_for_tests(path)
    yield path
    if os.path.exists(path):
        os.unlink(path)


def test_delete_vault(client):
    r = client.post("/api/auth/register", json={"email": "a@b.com", "password": "password123"})
    ws_id = r.json()["user"]["workspace_id"]
    headers = {"X-Demo-Principal": "62:root:x"}
    client.put("/api/admin/email-vault", json={
        "workspace_id": ws_id,
        "sender_email": "x@y.com",
        "app_password": "long-enough-password",
    }, headers=headers)
    r = client.delete(f"/api/admin/email-vault/{ws_id}", headers=headers)
    assert r.status_code == 204
    r = client.get(f"/api/admin/email-vault/{ws_id}", headers=headers)
    assert r.json()["configured"] is False
