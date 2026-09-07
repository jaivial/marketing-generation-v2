"""Authentication endpoints: register, confirm, login.

Tokens are JWTs (see ``app/core/security.py``). Email confirmation is
enforced unless ``SKIP_EMAIL_CONFIRM`` is set. Every new user gets a
personal workspace created at registration time; the email vault (if
any) lives in that workspace.
"""
from __future__ import annotations
import os

from fastapi import APIRouter, HTTPException

from app.core.security import hash_password, jwt_for_user, verify_password
from app.models.auth import (
    ConfirmIn, LoginIn, RegisterIn, TokenOut, UserOut, WhoAmIOut,
)
from app.services import storage
from app.services.emailer import send_confirmation_email


router = APIRouter(prefix="/auth", tags=["auth"])


def _make_token(user: dict) -> TokenOut:
    ws = storage.get_workspace_by_owner(user["id"])
    return TokenOut(
        access_token=jwt_for_user(user["id"], user["email"]),
        user=UserOut(
            id=user["id"], email=user["email"], name=user.get("name"),
            email_confirmed=bool(user.get("email_confirmed")),
            workspace_id=ws["id"] if ws else None,
        ),
    )


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn):
    """Create a new user + personal workspace, mail a confirmation link."""
    existing = storage.get_user_by_email(payload.email)
    if existing is not None:
        raise HTTPException(409, "email already registered")
    user = storage.create_user(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    workspace = storage.create_workspace(
        owner_id=user["id"], name=payload.name or user["email"],
    )
    send_confirmation_email(
        to=user["email"], token=user["confirm_token"],
        name=user.get("name"), workspace_id=workspace["id"],
    )
    out = _make_token(user)
    out.user.workspace_id = workspace["id"]
    out.user.email_confirmed = False
    return out


@router.post("/confirm", response_model=TokenOut)
def confirm_email(payload: ConfirmIn):
    """Confirm an email address using the token mailed at registration."""
    with storage.get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE confirm_token = ?", (payload.token,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "invalid or expired token")
    storage.confirm_email(row["id"])
    user = storage.get_user_by_id(row["id"])
    out = _make_token(user)
    out.user.email_confirmed = True
    return out


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn):
    user = storage.get_user_by_email(payload.email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    if not user["email_confirmed"] and not os.getenv("SKIP_EMAIL_CONFIRM"):
        raise HTTPException(403, "email not confirmed; check your inbox")
    storage.touch_last_seen(user["id"])
    return _make_token(user)


@router.get("/whoami", response_model=WhoAmIOut)
def whoami(request):
    from app.core.acl import Principal
    p = Principal.from_request(request)
    return WhoAmIOut(
        id=p.id, email=p.email, name=p.name,
        is_authenticated=p.is_authenticated, is_admin=p.is_admin,
    )
