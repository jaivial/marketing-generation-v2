"""Root-only Gmail SMTP vault management.

Two endpoints:

- POST /api/admin/email-vault        \u2014 upsert (set / rotate) the creds
- GET  /api/admin/email-vault        \u2014 view metadata (sender email + last update)
- DELETE /api/admin/email-vault      \u2014 remove

The plaintext app password is never returned in a GET \u2014 only the
sender email and last-updated timestamp. To update the password, the
operator re-POSTs with the new value; we overwrite the ciphertext.
"""
from __future__ import annotations
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.core.acl import Principal, require_root
from app.core import vault
from app.services import storage


router = APIRouter(prefix="/email-vault", tags=["admin:email-vault"])


class VaultIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=64)
    sender_email: EmailStr
    app_password: str = Field(min_length=8, max_length=128,
                              description="Google App Password (16 chars typically)")


class VaultOut(BaseModel):
    workspace_id: str
    sender_email: str
    updated_at: float
    configured: bool


@router.put("", response_model=VaultOut)
def upsert_vault(payload: VaultIn, _: Principal = Depends(require_root())):
    ws = storage.get_workspace(payload.workspace_id)
    if ws is None:
        raise HTTPException(404, "workspace not found")
    ct, nonce = vault.encrypt(payload.app_password)
    storage.upsert_email_vault(
        workspace_id=payload.workspace_id,
        sender_email=payload.sender_email,
        ct_b64=ct, nonce_b64=nonce,
    )
    row = storage.get_email_vault(payload.workspace_id)
    return VaultOut(
        workspace_id=row["workspace_id"],
        sender_email=row["sender_email"],
        updated_at=row["updated_at"],
        configured=True,
    )


@router.get("/{workspace_id}", response_model=VaultOut)
def get_vault(workspace_id: str, _: Principal = Depends(require_root())):
    row = storage.get_email_vault(workspace_id)
    if not row:
        return VaultOut(workspace_id=workspace_id, sender_email="", updated_at=0.0, configured=False)
    return VaultOut(
        workspace_id=row["workspace_id"],
        sender_email=row["sender_email"],
        updated_at=row["updated_at"],
        configured=True,
    )


@router.delete("/{workspace_id}", status_code=204)
def delete_vault(workspace_id: str, _: Principal = Depends(require_root())):
    storage.delete_email_vault(workspace_id)
    return None
