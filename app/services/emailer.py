"""Gmail SMTP sender.

The Google App Password is fetched from the encrypted DB vault
(``app/core/vault.py``) and decrypted in-memory just before the SMTP
``login()`` call. We never write the plaintext to disk or logs.

Two entry points are exposed:

- :func:`send_confirmation_otp` \u2014 public, called by ``app/api/auth.py``
  at registration and resend time. Looks up the workspace's stored SMTP
  creds; if none are configured the 6-digit code is logged at INFO so
  dev / test environments without a Gmail account still work.
- :func:`send_confirmation_email` \u2014 legacy link-based entry point, kept
  as a thin wrapper over :func:`send_confirmation_otp`.
- :func:`send_email` \u2014 internal, used by the rest of the app for
  notifications (e.g. campaign-failed alerts in a future PR).
"""
from __future__ import annotations
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core import vault
from app.services import storage


log = logging.getLogger("marketing.email")


def _send_via_gmail(*, sender_email: str, app_password: str, to: str,
                    subject: str, html: str, text: str, workspace_id: str | None) -> bool:
    msg = EmailMessage()
    msg["From"] = sender_email
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context, timeout=30) as s:
            s.login(sender_email, app_password)
            s.send_message(msg)
        log.info("emailer: sent subject=%r to=%s workspace=%s", subject, to, workspace_id)
        return True
    except Exception as e:  # noqa: BLE001 \u2014 surface to caller
        log.warning("emailer: gmail send failed: %s", e)
        return False


def _send_stub(*, to: str, subject: str, link: str) -> bool:
    log.info(
        "emailer: stub-send to=%s subject=%s link=%s (no SMTP vault configured)",
        to, subject, link,
    )
    return True


def _resolve_credentials(workspace_id: str | None) -> tuple[str, str] | None:
    """Return ``(sender_email, app_password)`` or ``None`` if not configured."""
    if not workspace_id:
        return None
    row = storage.get_email_vault(workspace_id)
    if not row:
        return None
    try:
        return row["sender_email"], vault.decrypt(row["app_password_ct"], row["app_password_nonce"])
    except Exception as e:  # noqa: BLE001
        log.error("emailer: vault decrypt failed: %s", e)
        return None


def send_email(*, to: str, subject: str, html: str, text: str,
               workspace_id: str | None = None) -> bool:
    """Low-level: send a transactional email via the workspace's Gmail vault."""
    creds = _resolve_credentials(workspace_id)
    if not creds:
        log.warning("emailer: no vault creds for workspace=%s; message dropped", workspace_id)
        return False
    return _send_via_gmail(
        sender_email=creds[0], app_password=creds[1],
        to=to, subject=subject, html=html, text=text, workspace_id=workspace_id,
    )


def send_confirmation_otp(*, to: str, otp: str, name: str | None = None,
                          workspace_id: str | None = None) -> bool:
    """Send (or log) the 6-digit confirmation code (coord: auth.otp.mail)."""
    subject = "Your MarketingForge confirmation code"
    html = (
        f"<p>Hi {name or ''},</p>"
        f"<p>Your MarketingForge confirmation code is:</p>"
        f"<p><strong data-testid=\"email-otp-code\">{otp}</strong></p>"
        f"<p>It expires in 15 minutes.</p>"
    )
    text = f"Hi {name or ''},\n\nYour confirmation code is {otp}. It expires in 15 minutes.\n"

    creds = _resolve_credentials(workspace_id)
    if not creds:
        log.info(
            "emailer: stub-send to=%s subject=%s otp=%s (no SMTP vault configured)",
            to, subject, otp,
        )
        return True
    return _send_via_gmail(
        sender_email=creds[0], app_password=creds[1],
        to=to, subject=subject, html=html, text=text, workspace_id=workspace_id,
    )


def send_confirmation_email(*, to: str, token: str, name: str | None = None,
                            workspace_id: str | None = None) -> bool:
    """Legacy link-based confirmation -- now a thin wrapper over the OTP mail."""
    return send_confirmation_otp(to=to, otp=token, name=name, workspace_id=workspace_id)
