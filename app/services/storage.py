"""Domain-level storage helpers built on top of the raw SQLite layer.

We expose a thin, typed API so the rest of the app never has to write raw
SQL. Every method that mutates state uses ``db.write()``; reads use
``db.connection()``. Errors bubble up as Python exceptions.
"""
from __future__ import annotations
import hmac
import json
import secrets
import time
import uuid
from typing import Any, Iterable

from app.core.db import get_db


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
# OTP lifetime + resend cooldown, in seconds (obs: auth.otp.ttl / auth.otp.cooldown).
OTP_TTL_SECONDS = 900
OTP_RESEND_COOLDOWN_SECONDS = 60


def _new_otp(now: float) -> tuple[str, float]:
    """Return ``(code, expires_at)`` for a fresh 6-digit confirmation OTP."""
    return f"{secrets.randbelow(10 ** 6):06d}", now + OTP_TTL_SECONDS


def create_user(*, email: str, password_hash: str, name: str | None = None,
                roles: int = 2) -> dict:
    user_id = f"u-{uuid.uuid4().hex[:8]}"
    now = time.time()
    otp, expires = _new_otp(now)
    with get_db().write() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, name, email_confirmed, "
            "confirm_otp, confirm_otp_expires, reset_token, reset_expires, "
            "last_password_reset_at, roles, created_at) "
            "VALUES (?, ?, ?, ?, 0, ?, ?, NULL, NULL, NULL, ?, ?)",
            (user_id, email.lower(), password_hash, name, otp, expires, roles, now),
        )
    return {
        "id": user_id, "email": email.lower(), "name": name,
        "email_confirmed": False, "roles": roles, "created_at": now,
        "confirm_otp": otp, "confirm_otp_expires": expires,
        "reset_token": None, "reset_expires": None,
        "last_password_reset_at": None,
    }


def get_user_by_email(email: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def _mark_confirmed(user_id: str) -> None:
    """Consume the confirmation code and flip ``email_confirmed``."""
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET email_confirmed = 1, confirm_otp = NULL, "
            "confirm_otp_expires = NULL, confirm_token = NULL WHERE id = ?",
            (user_id,),
        )


def confirm_email(user_id: str) -> None:
    """Legacy token-based confirmation -- kept for backward compatibility."""
    _mark_confirmed(user_id)


def confirm_email_by_otp(email: str, otp: str) -> dict | None:
    """Confirm an email with its 6-digit OTP (coord: auth.otp.confirm).

    Returns the refreshed user row, or ``None`` on unknown email, wrong
    code or expired code.
    """
    user = get_user_by_email(email)
    if user is None:
        return None
    stored, expires = user.get("confirm_otp"), user.get("confirm_otp_expires")
    if not stored or not otp or not hmac.compare_digest(str(stored), str(otp)):
        return None
    if expires is None or float(expires) < time.time():
        return None
    _mark_confirmed(user["id"])
    return get_user_by_id(user["id"])


def resend_confirm_otp(user_id: str) -> dict:
    """Regenerate the confirmation OTP (coord: auth.otp.resend)."""
    now = time.time()
    otp, expires = _new_otp(now)
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET confirm_otp = ?, confirm_otp_expires = ?, "
            "last_otp_resend_at = ? WHERE id = ?",
            (otp, expires, now, user_id),
        )
    return {
        "id": user_id, "confirm_otp": otp, "confirm_otp_expires": expires,
        "last_otp_resend_at": now,
    }


# ---------------------------------------------------------------------------
# Password reset (obs: auth.reset.storage, coord: auth.reset.token)
# ---------------------------------------------------------------------------
# Reset link lifetime + resend cooldown, in seconds (obs: auth.reset.ttl).
PASSWORD_RESET_TTL_SECONDS = 1800
PASSWORD_RESET_COOLDOWN_SECONDS = 60


def request_password_reset(email: str) -> dict | None:
    """Mint a single-use reset token for ``email`` (coord: auth.reset.request).

    Returns the refreshed user row, or ``None`` when no user has that email
    (the API layer swallows that case so the endpoint never enumerates).
    """
    user = get_user_by_email(email)
    if user is None:
        return None
    now = time.time()
    token = secrets.token_urlsafe(32)
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET reset_token = ?, reset_expires = ?, "
            "last_password_reset_at = ? WHERE id = ?",
            (token, now + PASSWORD_RESET_TTL_SECONDS, now, user["id"]),
        )
    return get_user_by_id(user["id"])


def consume_password_reset(token: str, new_password_hash: str) -> dict | None:
    """Swap the password for a valid, unexpired token (coord: auth.reset.consume).

    The token is single-use: it and its expiry are cleared on success, so a
    replayed link is dead. Returns the refreshed row, ``None`` on any miss.
    """
    if not token:
        return None
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE reset_token = ?", (token,)
        ).fetchone()
    if row is None:
        return None
    user = dict(row)
    expires = user.get("reset_expires")
    if expires is None or float(expires) < time.time():
        return None
    if not hmac.compare_digest(str(user["reset_token"]), str(token)):
        return None
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, "
            "reset_expires = NULL WHERE id = ?",
            (new_password_hash, user["id"]),
        )
    return get_user_by_id(user["id"])


def touch_last_seen(user_id: str) -> None:
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET last_seen = ? WHERE id = ?", (time.time(), user_id)
        )


# ---------------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------------
def create_workspace(*, owner_id: str, name: str) -> dict:
    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    now = time.time()
    with get_db().write() as conn:
        conn.execute(
            "INSERT INTO workspaces (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)",
            (ws_id, owner_id, name, now),
        )
    return {"id": ws_id, "owner_id": owner_id, "name": name, "created_at": now}


def get_workspace(ws_id: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute("SELECT * FROM workspaces WHERE id = ?", (ws_id,)).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Onboarding + RAG
# ---------------------------------------------------------------------------
def add_onboarding_note(*, workspace_id: str, section: str, content: str) -> int:
    now = time.time()
    with get_db().write() as conn:
        cur = conn.execute(
            "INSERT INTO onboarding_notes (workspace_id, section, content, created_at) "
            "VALUES (?, ?, ?, ?)",
            (workspace_id, section, content, now),
        )
        note_id = int(cur.lastrowid)
        # mirror into FTS5 for RAG
        conn.execute(
            "INSERT INTO workspace_kb (workspace_id, kind, source_id, title, body) "
            "VALUES (?, 'onboarding', ?, ?, ?)",
            (workspace_id, str(note_id), section, content),
        )
    return note_id


def list_onboarding_notes(workspace_id: str) -> list[dict]:
    with get_db().connection() as conn:
        rows = conn.execute(
            "SELECT * FROM onboarding_notes WHERE workspace_id = ? ORDER BY created_at",
            (workspace_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def search_workspace_kb(workspace_id: str, query: str, limit: int = 8) -> list[dict]:
    """Run a FTS5 MATCH query against the workspace's RAG index.

    ``query`` is a free-form string. We tokenise it (split on whitespace,
    drop tokens shorter than 2 chars) and feed the tokens joined by
    implicit AND with a wildcard suffix so a single-word search still
    works without the user having to phrase it exactly.
    """
    tokens = [t.strip(",.;:!?()[]{}\u0027\u0022") for t in query.split()]
    tokens = [t for t in tokens if len(t) >= 2]
    if not tokens:
        return []
    match_expr = " ".join(f"{t}*" for t in tokens)
    with get_db().connection() as conn:
        rows = conn.execute(
            "SELECT kind, source_id, title, "
            "snippet(workspace_kb, 4, '<b>', '</b>', '…', 12) AS snip, "
            "rank FROM workspace_kb WHERE workspace_id = ? AND workspace_kb MATCH ? "
            "ORDER BY rank LIMIT ?",
            (workspace_id, match_expr, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def index_campaign_artifact(workspace_id: str, *, kind: str, source_id: str,
                            title: str, body: str) -> None:
    """Add a campaign-derived snippet into the workspace KB for future RAG."""
    with get_db().write() as conn:
        conn.execute(
            "INSERT INTO workspace_kb (workspace_id, kind, source_id, title, body) "
            "VALUES (?, ?, ?, ?, ?)",
            (workspace_id, kind, source_id, title, body),
        )


# ---------------------------------------------------------------------------
# Credits
# ---------------------------------------------------------------------------
def get_credit_balance(workspace_id: str) -> float:
    """Sum of every ledger entry. Reads are O(1) when the table is small."""
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_ledger WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()
    return float(row["bal"] or 0)


def apply_credit_delta(workspace_id: str, *, delta: float, reason: str) -> float:
    """Append a ledger row and return the new balance.

    Refuses to make the balance negative (caller must check first).
    """
    with get_db().write() as conn:
        bal = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_ledger WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()["bal"] or 0
        bal = float(bal)
        if bal + delta < -1e-9:
            raise ValueError(f"insufficient credits: balance={bal}, delta={delta}")
        new_bal = bal + delta
        conn.execute(
            "INSERT INTO credit_ledger (workspace_id, delta, reason, balance_after, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (workspace_id, float(delta), reason, new_bal, time.time()),
        )
    return new_bal


# ---------------------------------------------------------------------------
# Campaigns + assets
# ---------------------------------------------------------------------------
def create_campaign(*, workspace_id: str, user_id: str, source_kind: str,
                    target: str, duration_s: int, style: str) -> dict:
    cid = f"c-{uuid.uuid4().hex[:10]}"
    now = time.time()
    with get_db().write() as conn:
        conn.execute(
            "INSERT INTO campaigns (id, workspace_id, user_id, source_kind, target, "
            "duration_s, style, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
            (cid, workspace_id, user_id, source_kind, target, duration_s, style, now),
        )
    return {"id": cid, "workspace_id": workspace_id, "user_id": user_id,
            "source_kind": source_kind, "target": target,
            "duration_s": duration_s, "style": style, "status": "pending",
            "created_at": now}


def set_campaign_status(campaign_id: str, status: str, *,
                        plan_json: dict | None = None,
                        total_cost_usd: float | None = None,
                        credits_spent: float | None = None) -> None:
    fields = ["status = ?"]
    args: list[Any] = [status]
    if plan_json is not None:
        fields.append("plan_json = ?")
        args.append(json.dumps(plan_json))
    if total_cost_usd is not None:
        fields.append("total_cost_usd = ?")
        args.append(total_cost_usd)
    if credits_spent is not None:
        fields.append("credits_spent = ?")
        args.append(credits_spent)
    if status in ("done", "failed"):
        fields.append("finished_at = ?")
        args.append(time.time())
    args.append(campaign_id)
    with get_db().write() as conn:
        conn.execute(f"UPDATE campaigns SET {', '.join(fields)} WHERE id = ?", args)


def get_campaign(campaign_id: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute("SELECT * FROM campaigns WHERE id = ?", (campaign_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get("plan_json"):
        d["plan"] = json.loads(d["plan_json"])
    return d


def list_campaigns_for_workspace(workspace_id: str, *, limit: int = 100) -> list[dict]:
    with get_db().connection() as conn:
        rows = conn.execute(
            "SELECT * FROM campaigns WHERE workspace_id = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (workspace_id, limit),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d.get("plan_json"):
            d["plan"] = json.loads(d["plan_json"])
        out.append(d)
    return out


def add_campaign_asset(campaign_id: str, *, kind: str, url: str,
                       duration_s: int | None = None,
                       metadata: dict | None = None) -> int:
    now = time.time()
    with get_db().write() as conn:
        cur = conn.execute(
            "INSERT INTO campaign_assets (campaign_id, kind, url, duration_s, "
            "metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (campaign_id, kind, url, duration_s,
             json.dumps(metadata) if metadata else None, now),
        )
    return int(cur.lastrowid)


def list_campaign_assets(campaign_id: str) -> list[dict]:
    with get_db().connection() as conn:
        rows = conn.execute(
            "SELECT * FROM campaign_assets WHERE campaign_id = ? ORDER BY created_at",
            (campaign_id,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if d.get("metadata_json"):
            d["metadata"] = json.loads(d["metadata_json"])
        out.append(d)
    return out



# ---------------------------------------------------------------------------
# Campaign event log (SSE replay)
# ---------------------------------------------------------------------------
def append_campaign_event(campaign_id: str, event: str, data: dict | None) -> int:
    """Persist one pipeline event and return its per-campaign sequence number.

    ``seq`` starts at 1 and is allocated inside the same write transaction as
    the insert, so a reconnecting client can rely on it being gapless.
    """
    now = time.time()
    with get_db().write() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(seq), 0) FROM campaign_events WHERE campaign_id = ?",
            (campaign_id,),
        ).fetchone()
        seq = int(row[0]) + 1
        conn.execute(
            "INSERT INTO campaign_events (campaign_id, seq, event, data_json, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (campaign_id, seq, event,
             json.dumps(data) if data is not None else None, now),
        )
    return seq


def list_campaign_events(campaign_id: str) -> list[dict]:
    """Every persisted event for a campaign, oldest first."""
    with get_db().connection() as conn:
        rows = conn.execute(
            "SELECT campaign_id, seq, event, data_json, created_at "
            "FROM campaign_events WHERE campaign_id = ? ORDER BY seq",
            (campaign_id,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["data"] = json.loads(d.pop("data_json")) if d.get("data_json") else {}
        out.append(d)
    return out


# ---------------------------------------------------------------------------
# Email vault (encrypted Gmail SMTP credentials)
# ---------------------------------------------------------------------------
def upsert_email_vault(workspace_id: str, *, sender_email: str,
                       ct_b64: str, nonce_b64: str) -> None:
    now = time.time()
    with get_db().write() as conn:
        conn.execute(
            """INSERT INTO email_vault (workspace_id, sender_email, app_password_ct,
                                       app_password_nonce, updated_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(workspace_id) DO UPDATE SET
                   sender_email = excluded.sender_email,
                   app_password_ct = excluded.app_password_ct,
                   app_password_nonce = excluded.app_password_nonce,
                   updated_at = excluded.updated_at""",
            (workspace_id, sender_email, ct_b64, nonce_b64, now),
        )


def get_email_vault(workspace_id: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM email_vault WHERE workspace_id = ?", (workspace_id,)
        ).fetchone()
    return dict(row) if row else None


def delete_email_vault(workspace_id: str) -> None:
    with get_db().write() as conn:
        conn.execute("DELETE FROM email_vault WHERE workspace_id = ?", (workspace_id,))


def get_workspace_by_owner(owner_id: str) -> dict | None:
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at LIMIT 1",
            (owner_id,),
        ).fetchone()
    return dict(row) if row else None
