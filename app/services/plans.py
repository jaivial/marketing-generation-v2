"""Storage helpers for the ``workspace_plan`` table.

Kept out of ``app/services/storage.py`` on purpose: that module shipped in
PR #1 and we don't want billing-specific helpers to collide with the rest
of the queue. Same style as ``storage`` — thin, typed, no raw SQL leaks
into callers.
"""
from __future__ import annotations

import time

from app.core.db import get_db


def set_workspace_plan(workspace_id: str, plan_name: str, *,
                       since: float | None = None) -> dict:
    """Record (or overwrite) the plan a workspace is on.

    Idempotent: choosing the same plan twice just refreshes ``since``.
    """
    ts = time.time() if since is None else float(since)
    with get_db().write() as conn:
        conn.execute(
            """INSERT INTO workspace_plan (workspace_id, plan_name, since)
               VALUES (?, ?, ?)
               ON CONFLICT(workspace_id) DO UPDATE SET
                   plan_name = excluded.plan_name,
                   since     = excluded.since""",
            (workspace_id, plan_name, ts),
        )
    return {"workspace_id": workspace_id, "plan_name": plan_name, "since": ts}


def get_workspace_plan(workspace_id: str) -> dict | None:
    """Return the workspace's plan row, or ``None`` if it never checked out."""
    with get_db().connection() as conn:
        row = conn.execute(
            "SELECT * FROM workspace_plan WHERE workspace_id = ?", (workspace_id,)
        ).fetchone()
    return dict(row) if row else None


def clear_workspace_plan(workspace_id: str) -> None:
    """Drop the workspace's plan row (downgrade / cancellation)."""
    with get_db().write() as conn:
        conn.execute("DELETE FROM workspace_plan WHERE workspace_id = ?", (workspace_id,))
