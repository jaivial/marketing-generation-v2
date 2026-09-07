"""AES-GCM encryption for workspace secrets.

The encrypted blob is ``Fernet``-compatible only by name: we use the
``cryptography`` library's ``AESGCM`` directly so we can store the
random 12-byte nonce alongside the ciphertext (the schema has a
dedicated ``app_password_nonce`` column for this).

The key is derived from ``vault_key`` (env var) by SHA-256 \u2014 same
derivation the JWT signer uses, so we only need one secret. Rotate it
with care: existing rows in the ``email_vault`` table will become
unreadable on rotation, so the manager UI must re-save them.
"""
from __future__ import annotations
import base64
import hashlib
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    raw = os.getenv("vault_key") or os.getenv("VAULT_KEY") or ""
    if not raw:
        raise RuntimeError("vault_key is not configured")
    return hashlib.sha256(raw.encode("utf-8")).digest()  # 32 bytes \u2192 AES-256


def encrypt(plaintext: str) -> tuple[str, str]:
    """Return ``(ciphertext_b64, nonce_b64)``."""
    aes = AESGCM(_key())
    nonce = secrets.token_bytes(12)
    ct = aes.encrypt(nonce, plaintext.encode("utf-8"), associated_data=None)
    return base64.b64encode(ct).decode("ascii"), base64.b64encode(nonce).decode("ascii")


def decrypt(ciphertext_b64: str, nonce_b64: str) -> str:
    aes = AESGCM(_key())
    ct = base64.b64decode(ciphertext_b64)
    nonce = base64.b64decode(nonce_b64)
    return aes.decrypt(nonce, ct, associated_data=None).decode("utf-8")
