"""Authentication endpoints: register, confirm, login, logout.

Tokens are JWTs (see ``app/core/security.py``). The user is identified by
the ``Authorization: Bearer <jwt>`` header. Email confirmation is enforced
via a token mailed at registration time; the user cannot log in until
they hit ``/auth/confirm/<token>`` (or the API is configured to skip
confirmation via ``SKIP_EMAIL_CONFIRM=1``).

Note: a real confirmation email is dispatched by the emailer service
added in PR #3. PR #2 only wires the data flow + token validation so
the system is testable end-to-end without a working SMTP.
"""
from __future__ import annotations
import os
from fastapi import APIRouter, HTTPException, status

from app.core.security import hash_password, jwt_decode, jwt_for_user, verify_password
from app.models.auth import (
    LoginIn, RegisterIn, TokenOut, UserOut, ConfirmIn, WhoAmIOut,
)
from app.services import storage
from app.services.emailer import send_confirmation_email


router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn):
    """Create a new user, issue a confirmation email, return a JWT.

    Until they hit ``/auth/confirm``, the user cannot log in.
    """
    existing = storage.get_user_by_email(payload.email)
    if existing is not None:
        raise HTTPException(409, "email already registered")
    user = storage.create_user(
        email=payload.email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    send_confirmation_email(to=user["email"], token=user["confirm_token"], name=user.get("name"))
    return TokenOut(
        access_token=jwt_for_user(user["id"], user["email"]),
        user=UserOut(id=user["id"], email=user["email"], name=user.get("name"),
                     email_confirmed=False),
    )


# ---------------------------------------------------------------------------
# Email confirmation
# ---------------------------------------------------------------------------
@router.post("/confirm", response_model=TokenOut)
def confirm_email(payload: ConfirmIn):
    """Confirm an email address using the token mailed at registration."""
    # We don't have a ``get_user_by_token`` helper because tokens are not
    # unique by themselves (rotated per request). Instead we scan; this
    # is fine because registration volume is low.
    with storage.get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE confirm_token = ?", (payload.token,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "invalid or expired token")
    storage.confirm_email(row["id"])
    user = storage.get_user_by_id(row["id"])
    return TokenOut(
        access_token=jwt_for_user(user["id"], user["email"]),
        user=UserOut(id=user["id"], email=user["email"], name=user.get("name"),
                     email_confirmed=True),
    )


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn):
    user = storage.get_user_by_email(payload.email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "invalid credentials")
    # Allow skipping confirmation only in tests / dev.
    if not user["email_confirmed"] and not os.getenv("SKIP_EMAIL_CONFIRM"):
        raise HTTPException(403, "email not confirmed; check your inbox")
    storage.touch_last_seen(user["id"])
    return TokenOut(
        access_token=jwt_for_user(user["id"], user["email"]),
        user=UserOut(id=user["id"], email=user["email"], name=user.get("name"),
                     email_confirmed=bool(user["email_confirmed"])),
    )


# ---------------------------------------------------------------------------
# Whoami (current user from JWT)
# ---------------------------------------------------------------------------
@router.get("/whoami", response_model=WhoAmIOut)
def whoami(request):
    from app.core.acl import Principal
    p = Principal.from_request(request)
    return WhoAmIOut(
        id=p.id, email=p.email, name=p.name,
        is_authenticated=p.is_authenticated, is_admin=p.is_admin,
    )
