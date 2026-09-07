"""Stripe-backed credit purchase endpoints.

Routes (mounted under ``/api/billing/stripe``):

- ``POST /checkout``          - create a Checkout Session for N credits
- ``POST /webhook``           - signed Stripe event sink
- ``GET  /session/{id}``      - poll a session's status

Pricing: 1 credit = $0.01, i.e. ``cents = credits * 100`` (the task's
definition, centralised in ``stripe.CENTS_PER_CREDIT``).

``app.services.stripe`` is imported **inside** the handlers on purpose. That
module refuses to import without ``STRIPE_RK_LIVE``, and we do not want an
unconfigured deploy (or the test suite, or the OpenAPI schema build) to fail
merely because this router is mounted. The failure still happens loudly on
the first request that actually needs Stripe.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import storage

log = logging.getLogger("marketing.billing.stripe")

router = APIRouter(prefix="/billing/stripe", tags=["billing:stripe"])


class CheckoutIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=64)
    credits: int = Field(gt=0, le=1_000_000, description="1 credit = $0.01")
    success_url: str = Field(min_length=1, max_length=2048)
    cancel_url: str = Field(min_length=1, max_length=2048)


class CheckoutOut(BaseModel):
    session_id: str
    url: str | None = None
    amount_cents: int
    credits: int


class SessionOut(BaseModel):
    session_id: str
    status: str | None = None
    payment_status: str | None = None
    amount_total: int | None = None
    currency: str | None = None


def credits_to_cents(credits: int) -> int:
    """1 credit = $0.01 -> ``credits * 100`` cents."""
    from app.services.stripe import CENTS_PER_CREDIT
    return int(credits) * CENTS_PER_CREDIT


@router.post("/checkout", response_model=CheckoutOut)
def create_checkout(payload: CheckoutIn) -> CheckoutOut:
    """Create a Stripe Checkout Session worth ``credits`` credits."""
    from app.services import stripe as stripe_svc

    ws = storage.get_workspace(payload.workspace_id)
    if ws is None:
        raise HTTPException(404, "workspace not found")

    amount_cents = credits_to_cents(payload.credits)
    try:
        session = stripe_svc.StripeClient().create_checkout_session(
            amount_cents=amount_cents,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            # The webhook credits the workspace based on this metadata, so it
            # must round-trip through Stripe.
            metadata={
                "workspace_id": payload.workspace_id,
                "credits": payload.credits,
            },
        )
    except stripe_svc.StripeError as exc:
        # `exc` is already redacted by the service layer.
        raise HTTPException(502, f"stripe checkout failed: {exc}") from None
    except RuntimeError as exc:
        raise HTTPException(503, stripe_svc.redact(exc)) from None

    return CheckoutOut(
        session_id=str(session.get("id") or ""),
        url=session.get("url"),
        amount_cents=amount_cents,
        credits=payload.credits,
    )


@router.get("/session/{session_id}", response_model=SessionOut)
def get_session(session_id: str) -> SessionOut:
    """Return the status of a Checkout Session."""
    from app.services import stripe as stripe_svc

    try:
        session = stripe_svc.StripeClient().retrieve_checkout_session(session_id)
    except stripe_svc.StripeError as exc:
        status_code = 404 if exc.status_code == 404 else 502
        raise HTTPException(status_code, f"stripe session lookup failed: {exc}") from None
    except RuntimeError as exc:
        raise HTTPException(503, stripe_svc.redact(exc)) from None

    return SessionOut(
        session_id=str(session.get("id") or session_id),
        status=session.get("status"),
        payment_status=session.get("payment_status"),
        amount_total=session.get("amount_total"),
        currency=session.get("currency"),
    )


def _extract_credit_grant(session: dict) -> tuple[str | None, int]:
    """Pull ``(workspace_id, credits)`` out of a completed session object."""
    meta = session.get("metadata") or {}
    workspace_id = meta.get("workspace_id") or None
    raw_credits = meta.get("credits")
    try:
        credits = int(raw_credits)
    except (TypeError, ValueError):
        credits = 0
    return workspace_id, credits


@router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    """Receive a Stripe event, verify its signature, and apply credits.

    Signature verification happens against the **raw** body: re-serialising
    the parsed JSON would change the bytes and invalidate the HMAC.
    """
    from app.services import stripe as stripe_svc

    raw = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        secret = stripe_svc.webhook_secret()
    except RuntimeError as exc:
        log.error("stripe webhook rejected: %s", stripe_svc.redact(exc))
        raise HTTPException(503, "stripe webhook secret not configured") from None

    if not stripe_svc.verify_webhook_signature(raw, sig_header, secret):
        # Do not leak whether the secret or the payload was wrong.
        raise HTTPException(400, "invalid stripe signature")

    try:
        event = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        raise HTTPException(400, "malformed json payload") from None
    if not isinstance(event, dict):
        raise HTTPException(400, "malformed json payload")

    event_type = event.get("type") or ""
    if event_type != "checkout.session.completed":
        # Acknowledge everything else so Stripe stops retrying.
        return {"received": True, "ignored": event_type or "unknown"}

    session = ((event.get("data") or {}).get("object")) or {}
    workspace_id, credits = _extract_credit_grant(session)
    if not workspace_id or credits <= 0:
        log.warning("stripe webhook: completed session without usable metadata")
        return {"received": True, "credited": False,
                "reason": "missing workspace_id/credits metadata"}

    try:
        balance = storage.apply_credit_delta(
            workspace_id, delta=credits, reason="stripe",
        )
    except ValueError as exc:
        log.warning("stripe webhook: credit apply failed: %s", exc)
        raise HTTPException(409, str(exc)) from None

    log.info("stripe webhook credited workspace=%s credits=%s", workspace_id, credits)
    return {"received": True, "credited": True,
            "workspace_id": workspace_id, "credits": credits,
            "balance": balance}
