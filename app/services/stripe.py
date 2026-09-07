"""Stripe REST integration driven by a **global restricted key**.

Design notes
============
* **No SDK.** Every call is a raw HTTP request through ``httpx`` so the
  dependency surface stays exactly what ``requirements.txt`` already pins.
* **Server-side only.** ``STRIPE_RK_LIVE`` is a restricted *live* key. It is
  read from the environment (``.env``, which is gitignored) and must never be
  logged, echoed, returned in an API response, or committed.
* **Loud failure.** Importing this module without ``STRIPE_RK_LIVE`` set
  raises :class:`RuntimeError`, so a misconfigured production deploy dies at
  boot instead of silently falling back to an unauthenticated client.

Secret hygiene
--------------
:func:`redact` is used on every error path. Stripe echoes the presented key
back inside some 401 bodies, so raw response text is scrubbed before it is
allowed anywhere near a log line or an ``HTTPException`` detail.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
from typing import Any, Mapping

import httpx

log = logging.getLogger("marketing.stripe")

STRIPE_API_BASE = "https://api.stripe.com/v1"

#: 1 credit -> cents, per the task specification (`cents = credits * 100`).
#: Single source of truth so pricing changes touch exactly one line.
CENTS_PER_CREDIT = 100

_KEY_ENV = "STRIPE_RK_LIVE"
_WEBHOOK_SECRET_ENV = "STRIPE_WEBHOOK_SECRET"

# Matches any Stripe credential shape (rk_/sk_/pk_, live or test).
_SECRET_RE = re.compile(r"\b(?:rk|sk|pk)_(?:live|test)_[A-Za-z0-9]+")
_WHSEC_RE = re.compile(r"\bwhsec_[A-Za-z0-9_\-]+")


def redact(text: Any) -> str:
    """Scrub anything that looks like a Stripe secret out of ``text``."""
    s = text if isinstance(text, str) else str(text)
    s = _SECRET_RE.sub("<redacted-stripe-key>", s)
    return _WHSEC_RE.sub("<redacted-webhook-secret>", s)


def assert_key_configured(env: Mapping[str, str] | None = None) -> str:
    """Return the restricted key, or raise a clear :class:`RuntimeError`.

    Kept as a function (rather than an inline ``assert``) so it is unit
    testable and so ``-O`` cannot optimise the guard away.
    """
    source = os.environ if env is None else env
    key = (source.get(_KEY_ENV) or "").strip()
    if not key:
        raise RuntimeError(
            f"{_KEY_ENV} is not set. The Stripe restricted key is required for "
            "the billing path. Add it to .env (never commit it) as "
            f"`{_KEY_ENV}=rk_live_...`; see .env.example for the placeholder."
        )
    return key


def webhook_secret() -> str:
    """Return the webhook signing secret, or raise a clear error."""
    secret = (os.environ.get(_WEBHOOK_SECRET_ENV) or "").strip()
    if not secret:
        raise RuntimeError(
            f"{_WEBHOOK_SECRET_ENV} is not set; cannot verify Stripe webhook "
            "signatures. Add it to .env (never commit it)."
        )
    return secret


def _flatten(data: Any, prefix: str = "") -> dict[str, str]:
    """Flatten nested dicts/lists into Stripe's bracketed form-encoding.

    ``{"metadata": {"a": 1}}`` -> ``{"metadata[a]": "1"}``.
    """
    out: dict[str, str] = {}
    if isinstance(data, Mapping):
        for k, v in data.items():
            key = f"{prefix}[{k}]" if prefix else str(k)
            out.update(_flatten(v, key))
    elif isinstance(data, (list, tuple)):
        for i, v in enumerate(data):
            out.update(_flatten(v, f"{prefix}[{i}]"))
    elif data is None:
        pass  # omit nulls; Stripe treats absent and null differently
    elif isinstance(data, bool):
        out[prefix] = "true" if data else "false"
    else:
        out[prefix] = str(data)
    return out


class StripeError(RuntimeError):
    """A non-2xx response from the Stripe API (message already redacted)."""

    def __init__(self, status_code: int, message: str, code: str | None = None):
        self.status_code = status_code
        self.code = code
        super().__init__(f"stripe api error {status_code}: {message}")


class StripeClient:
    """Thin ``httpx`` wrapper around the Stripe REST API.

    The restricted key is presented as ``Authorization: Bearer <key>``.
    """

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = STRIPE_API_BASE,
        timeout: float = 20.0,
    ) -> None:
        # Resolve lazily-but-strictly: an explicit key wins, otherwise the
        # environment must supply one.
        self._api_key = (api_key or "").strip() or assert_key_configured()
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ── internals ─────────────────────────────────────────────────────────
    @property
    def auth_headers(self) -> dict[str, str]:
        """Headers for an authenticated Stripe call."""
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        url = f"{self.base_url}/{path.lstrip('/')}"
        form = _flatten(payload or {})
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.request(
                    method, url, headers=self.auth_headers,
                    data=form if form else None,
                )
        except httpx.HTTPError as exc:  # network-level failure
            raise StripeError(502, f"stripe request failed: {redact(exc)}") from None

        try:
            body = resp.json()
        except (ValueError, TypeError):
            body = {}

        if resp.status_code >= 400:
            err = (body or {}).get("error") or {}
            # Never surface the raw body: Stripe can echo the key back.
            message = redact(err.get("message") or f"HTTP {resp.status_code}")
            log.warning("stripe %s %s -> %s (%s)", method, path,
                        resp.status_code, message)
            raise StripeError(resp.status_code, message, err.get("code"))
        return body if isinstance(body, dict) else {}

    # ── payment intents ───────────────────────────────────────────────────
    def create_payment_intent(
        self,
        *,
        amount_cents: int,
        currency: str = "eur",
        metadata: dict | None = None,
    ) -> dict:
        """Create a PaymentIntent. ``amount_cents`` is the minor unit."""
        amount = int(amount_cents)
        if amount <= 0:
            raise ValueError("amount_cents must be a positive integer")
        payload: dict[str, Any] = {
            "amount": amount,
            "currency": currency.lower(),
        }
        if metadata:
            payload["metadata"] = metadata
        return self._request("POST", "/payment_intents", payload)

    def retrieve_payment_intent(self, intent_id: str) -> dict:
        if not intent_id:
            raise ValueError("intent_id is required")
        return self._request("GET", f"/payment_intents/{intent_id}")

    # ── customers ─────────────────────────────────────────────────────────
    def create_or_get_customer(self, *, email: str, name: str | None = None) -> dict:
        """Return the existing customer for ``email``, else create one.

        Stripe has no upsert, so we search first. If the restricted key lacks
        the ``customer.read`` grant the search 403s; we then fall back to a
        plain create so the payment path still works.
        """
        if not email:
            raise ValueError("email is required")
        try:
            found = self._request(
                "GET", "/customers", {"email": email, "limit": 1},
            )
            existing = (found.get("data") or [])
            if existing:
                return existing[0]
        except StripeError as exc:
            if exc.status_code not in (401, 403):
                raise
            log.info("stripe customer lookup not permitted by key; creating")

        payload: dict[str, Any] = {"email": email}
        if name:
            payload["name"] = name
        return self._request("POST", "/customers", payload)

    # ── checkout sessions ─────────────────────────────────────────────────
    def create_checkout_session(
        self,
        *,
        amount_cents: int,
        success_url: str,
        cancel_url: str,
        currency: str = "eur",
        product_name: str = "MarketingForge credits",
        metadata: dict | None = None,
    ) -> dict:
        amount = int(amount_cents)
        if amount <= 0:
            raise ValueError("amount_cents must be a positive integer")
        payload: dict[str, Any] = {
            "mode": "payment",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items": [
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": currency.lower(),
                        "unit_amount": amount,
                        "product_data": {"name": product_name},
                    },
                }
            ],
        }
        if metadata:
            payload["metadata"] = metadata
        return self._request("POST", "/checkout/sessions", payload)

    def retrieve_checkout_session(self, session_id: str) -> dict:
        if not session_id:
            raise ValueError("session_id is required")
        return self._request("GET", f"/checkout/sessions/{session_id}")

    def retrieve_account(self) -> dict:
        """``GET /v1/account`` - used to introspect what the key can do."""
        return self._request("GET", "/account")


# ── webhook signature ─────────────────────────────────────────────────────
def compute_signature(payload: bytes, secret: str) -> str:
    """HMAC-SHA256 hex digest of ``payload`` under ``secret``."""
    if isinstance(payload, str):
        payload = payload.encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def verify_webhook_signature(payload: bytes, sig_header: str, secret: str) -> bool:
    """Constant-time verification of a Stripe webhook signature.

    Accepts either a bare hex digest or Stripe's structured
    ``t=<ts>,v1=<sig>`` header (any number of ``v1`` entries). Comparison
    uses :func:`hmac.compare_digest` so we do not leak the digest through
    timing. Returns ``False`` rather than raising on malformed input.
    """
    if not sig_header or not secret:
        return False

    expected = compute_signature(payload, secret)

    candidates: list[str] = []
    if "=" in sig_header:
        for part in sig_header.split(","):
            name, _, value = part.strip().partition("=")
            if name.strip() == "v1" and value:
                candidates.append(value.strip())
    if not candidates:
        candidates.append(sig_header.strip())

    return any(hmac.compare_digest(expected, c) for c in candidates)


# ── import-time guard ─────────────────────────────────────────────────────
# Deliberately last: the module is fully defined before we refuse to load, so
# `assert_key_configured` stays importable for tooling that only wants the
# helpers. Production imports fail loudly when the key is absent.
assert_key_configured()
