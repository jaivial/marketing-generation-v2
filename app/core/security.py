"""Password hashing + JWT helpers.

We deliberately keep dependencies minimal:

- Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib ``hashlib``).
  No external dep, no native build.

- JWTs are signed with HMAC-SHA256 using ``vault_key`` from the
  environment (same secret that decrypts the email vault). Tokens
  carry ``sub`` (user id), ``email``, and ``exp`` and are valid for
  ``JWT_TTL_HOURS`` hours.
"""
from __future__ import annotations
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any


# ---------------------------------------------------------------------------
# Passwords
# ---------------------------------------------------------------------------
_ITERATIONS = 200_000
_HASH_NAME = "sha256"
_SALT_BYTES = 16


def hash_password(plain: str) -> str:
    """Return ``pbkdf2_sha256$<iter>$<salt_b64>$<hash_b64>`` (PHC-ish)."""
    salt = secrets.token_bytes(_SALT_BYTES)
    h = hashlib.pbkdf2_hmac(_HASH_NAME, plain.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2_{_HASH_NAME}${_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(h).decode()}"


def verify_password(plain: str, stored: str) -> bool:
    try:
        scheme, iters, salt_b64, hash_b64 = stored.split("$", 3)
    except ValueError:
        return False
    if not scheme.startswith("pbkdf2_"):
        return False
    h_name = scheme.split("_", 1)[1]
    salt = base64.b64decode(salt_b64)
    expected = base64.b64decode(hash_b64)
    h = hashlib.pbkdf2_hmac(h_name, plain.encode("utf-8"), salt, int(iters))
    return hmac.compare_digest(h, expected)


# ---------------------------------------------------------------------------
# JWTs (HMAC-SHA256, no external dep)
# ---------------------------------------------------------------------------
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _key() -> bytes:
    """The same vault_key we use for the email vault."""
    k = os.getenv("vault_key") or os.getenv("VAULT_KEY") or ""
    if not k:
        raise RuntimeError(
            "vault_key is not set. Refusing to sign JWTs with an empty secret. "
            "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(48))'"
        )
    # Pad / hash to a stable 32-byte key
    return hashlib.sha256(k.encode("utf-8")).digest()


def jwt_encode(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64url(json.dumps(header, separators=(",", ":"), sort_keys=True).encode())
    p = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    signing = f"{h}.{p}".encode()
    sig = hmac.new(_key(), signing, hashlib.sha256).digest()
    return f"{h}.{p}.{_b64url(sig)}"


def jwt_decode(token: str) -> dict[str, Any] | None:
    try:
        h, p, s = token.split(".", 2)
    except ValueError:
        return None
    expected = hmac.new(_key(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(_b64url_decode(s), expected):
        return None
    try:
        return json.loads(_b64url_decode(p))
    except (ValueError, json.JSONDecodeError):
        return None


def jwt_for_user(user_id: str, email: str, ttl_hours: int = 24 * 7) -> str:
    """Issue a token with the standard claims used by ``get_current_principal``."""
    payload = {
        "sub": user_id,
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    return jwt_encode(payload)
