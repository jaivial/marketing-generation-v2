"""Domain-level storage helpers built on top of the raw SQLite layer.

We expose a thin, typed API so the rest of the app never has to write raw
SQL. Every method that mutates state uses ``db.write()``; reads use
``db.connection()``. Errors bubble up as Python exceptions.
"""
from __future__ import annotations
import json
import secrets
import time
import uuid
from typing import Any, Iterable

from app.core.db import get_db


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
def create_user(*, email: str, password_hash: str, name: str | None = None,
                roles: int = 2) -> dict:
    user_id = f"u-{uuid.uuid4().hex[:8]}"
    now = time.time()
    confirm = secrets.token_urlsafe(32)
    with get_db().write() as conn:
        conn.execute(
            "INSERT INTO users (id, email, password_hash, name, email_confirmed, "
            "confirm_token, roles, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
            (user_id, email.lower(), password_hash, name, confirm, roles, now),
        )
    return {
        "id": user_id, "email": email.lower(), "name": name,
        "email_confirmed": False, "confirm_token": confirm,
        "roles": roles, "created_at": now,
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


def confirm_email(user_id: str) -> None:
    with get_db().write() as conn:
        conn.execute(
            "UPDATE users SET email_confirmed = 1, confirm_token = NULL WHERE id = ?",
            (user_id,),
        )


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
