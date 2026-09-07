"""Email service.

PR #2 ships a console-log stub so the data flow is end-to-end testable
without a working SMTP. PR #3 replaces this with the Gmail SMTP sender
whose credentials live in the encrypted DB vault.
"""
from __future__ import annotations
import logging
import os

log = logging.getLogger("marketing.email")


def send_confirmation_email(*, to: str, token: str, name: str | None = None) -> bool:
    """Send (or log) a confirmation email containing the link the user
    must click to confirm their address.

    The stub logs the link at INFO level; the real implementation will
    dispatch via Gmail SMTP using the workspace's stored app password.
    """
    base = os.getenv("PUBLIC_BASE_URL", "https://marketing-generation.menustudioai.com")
    link = f"{base}/confirm?token={token}"
    log.info(
        "emailer: would send confirmation to=%s name=%s link=%s (stub)",
        to, name, link,
    )
    return True
