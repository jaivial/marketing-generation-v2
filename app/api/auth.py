"""Authentication endpoints: register, confirm, login.

Tokens are JWTs (see ``app/core/security.py``). Email confirmation is
enforced unless ``SKIP_EMAIL_CONFIRM`` is set. Every new user gets a
personal workspace created at registration time; the email vault (if
any) lives in that workspace.
"""
from __future__ import annotations
import logging
import os
import time

from fastapi import APIRouter, HTTPException

from app.core.security import hash_password, jwt_for_user, verify_password
from app.models.auth import (
    ConfirmIn, ConfirmOtpIn, ForgotPasswordIn, ForgotPasswordOut, LoginIn,
    OtpOut, RegisterIn, ResetPasswordIn, ResetPasswordOut, ResendOtpIn,
    TokenOut, UserOut, WhoAmIOut,
)
from app.services import storage
from app.services.emailer import (
    password_reset_link, send_confirmation_otp, send_password_reset_email,
)


log = logging.getLogger("marketing.auth")
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
    """Create a user + workspace and mail the 6-digit confirmation code."""
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
    send_confirmation_otp(
        to=user["email"], otp=user["confirm_otp"],
        name=user.get("name"), workspace_id=workspace["id"],
    )
    out = _make_token(user)
    out.user.workspace_id = workspace["id"]
    out.user.email_confirmed = False
    return out


def _confirmed_token_out(user: dict) -> TokenOut:
    out = _make_token(user)
    out.user.email_confirmed = True
    return out


@router.post("/confirm", response_model=TokenOut)
def confirm_email(payload: ConfirmIn):
    """Confirm an email with a 6-digit ``otp`` or a legacy mailed ``token``."""
    if payload.otp:
        email = payload.email
        if email is None:  # tolerate {otp} without email: resolve the pending row
            with storage.get_db().connection() as conn:
                row = conn.execute(
                    "SELECT email FROM users WHERE confirm_otp = ?", (payload.otp,)
                ).fetchone()
            email = row["email"] if row else None
        if email is None:
            raise HTTPException(404, "unknown email")
        user = storage.confirm_email_by_otp(email, payload.otp)
        if user is None:
            raise HTTPException(400, "invalid or expired code")
        return _confirmed_token_out(user)
    with storage.get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE confirm_token = ?", (payload.token,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "invalid or expired token")
    storage.confirm_email(row["id"])
    return _confirmed_token_out(storage.get_user_by_id(row["id"]))


@router.post("/confirm-otp", response_model=TokenOut)
def confirm_otp(payload: ConfirmOtpIn):
    """Confirm an email address with the 6-digit code (obs: auth.otp.confirm)."""
    if storage.get_user_by_email(payload.email) is None:
        raise HTTPException(404, "unknown email")
    user = storage.confirm_email_by_otp(payload.email, payload.otp)
    if user is None:
        raise HTTPException(400, "invalid or expired code")
    return _confirmed_token_out(user)


@router.post("/resend-otp", response_model=OtpOut, status_code=202)
def resend_otp(payload: ResendOtpIn):
    """Re-mail a fresh code, at most one per minute (obs: auth.otp.resend)."""
    user = storage.get_user_by_email(payload.email)
    if user is None:
        raise HTTPException(404, "unknown email")
    last = user.get("last_otp_resend_at")
    if last and (time.time() - float(last)) < storage.OTP_RESEND_COOLDOWN_SECONDS:
        raise HTTPException(429, "please wait before requesting a new code")
    ws = storage.get_workspace_by_owner(user["id"])
    fresh = storage.resend_confirm_otp(user["id"])
    sent = send_confirmation_otp(
        to=user["email"], otp=fresh["confirm_otp"],
        name=user.get("name"), workspace_id=ws["id"] if ws else None,
    )
    return OtpOut(sent=sent, expires_in=storage.OTP_TTL_SECONDS)


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(payload: ForgotPasswordIn):
    """Mail a one-time reset link (obs: auth.reset.request, coord: auth.reset.flow).

    The answer never depends on whether the address exists, so the endpoint
    cannot be used to enumerate accounts. Rate limited to one mail per
    minute per address.
    """
    user = storage.get_user_by_email(payload.email)
    if user is not None:
        last = user.get("last_password_reset_at")
        if last and (time.time() - float(last)) < storage.PASSWORD_RESET_COOLDOWN_SECONDS:
            raise HTTPException(429, "please wait before requesting another reset link")
        fresh = storage.request_password_reset(payload.email)
        if fresh is not None:  # raced away between the two reads: stay silent
            ws = storage.get_workspace_by_owner(fresh["id"])
            sent = send_password_reset_email(
                to=fresh["email"], link=password_reset_link(fresh["reset_token"]),
                name=fresh.get("name"), workspace_id=ws["id"] if ws else None,
            )
            log.info("auth.reset.requested user=%s sent=%s", fresh["id"], sent)
    return ForgotPasswordOut()


@router.post("/reset-password", response_model=ResetPasswordOut)
def reset_password(payload: ResetPasswordIn):
    """Consume a reset token and set the new password (coord: auth.reset.consume)."""
    updated = storage.consume_password_reset(
        payload.token, hash_password(payload.new_password),
    )
    if updated is None:
        log.warning("auth.reset.rejected")
        raise HTTPException(400, "invalid or expired reset link")
    log.info("auth.reset.completed user=%s", updated["id"])
    return ResetPasswordOut()


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
