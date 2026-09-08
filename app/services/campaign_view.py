"""Presentation helpers: DB campaign rows -> API/JSON payloads.

The frontend tables (``Campaigns.tsx``, ``Library.tsx``) were written against
the old hardcoded demo payload, so they expect a flat object with exactly
these keys::

    {id, name, duration_s, status, created_at, color}

The database rows are richer (and use different names), so rather than
touching the React tables we normalise here. Two details worth calling out:

* ``created_at`` is returned as **epoch milliseconds**, not a pre-rendered
  "2h ago" string. The frontend already ships ``timeAgo()`` in
  ``lib/utils.ts`` and uses it for every other timestamp, so handing it a
  number is both smaller (no server-side formatting) and better UX (the
  label re-renders as time passes instead of going stale).

* ``color`` is derived deterministically from the campaign id. Gradients are
  purely cosmetic but they must be *stable* across reloads, so we hash the id
  into a fixed palette instead of storing a column for it.
"""
from __future__ import annotations
import hashlib
from typing import Any


# The gradient palette used by the original demo data. Keeping the exact same
# Tailwind class strings means no CSS/safelist changes are needed.
GRADIENTS: tuple[str, ...] = (
    "from-rose-500 to-amber-500",
    "from-indigo-500 to-fuchsia-500",
    "from-cyan-500 to-blue-500",
    "from-violet-500 to-pink-500",
    "from-amber-500 to-orange-500",
    "from-emerald-500 to-lime-500",
)

# DB statuses -> the four statuses the UI knows how to render a pill for.
_STATUS_MAP = {
    "pending": "draft",
    "running": "generating",
    "generating": "generating",
    "done": "done",
    "failed": "failed",
    "draft": "draft",
}


def color_for(campaign_id: str) -> str:
    """Stable gradient for a campaign id (cosmetic, but must not flicker)."""
    if not campaign_id:
        return GRADIENTS[0]
    digest = hashlib.sha1(campaign_id.encode("utf-8")).digest()
    return GRADIENTS[digest[0] % len(GRADIENTS)]


def ui_status(raw: str | None) -> str:
    """Map a DB status onto one the status-pill component understands."""
    return _STATUS_MAP.get((raw or "").lower(), "draft")


def display_name(row: dict[str, Any]) -> str:
    """Human label for a campaign.

    The schema has no ``name`` column yet (that lands with the wizard
    rework), so we fall back to the target -- the source URL or the local
    file path -- exactly as the task specifies.
    """
    for key in ("name", "target"):
        val = row.get(key)
        if val:
            return str(val)
    return "Untitled campaign"


def _created_at_ms(row: dict[str, Any]) -> int:
    """Epoch *milliseconds*, which is what ``timeAgo()`` expects."""
    try:
        return int(float(row.get("created_at") or 0) * 1000)
    except (TypeError, ValueError):
        return 0


def campaign_summary(row: dict[str, Any]) -> dict[str, Any]:
    """One row of the history list."""
    cid = str(row.get("id") or "")
    plan_blob = row.get("plan") or {}
    if not isinstance(plan_blob, dict):
        plan_blob = {}
    return {
        "id": cid,
        "name": display_name(row),
        "duration_s": int(row.get("duration_s") or 0),
        "status": ui_status(row.get("status")),
        "created_at": _created_at_ms(row),
        "color": color_for(cid),
        # Extras the tables already render when present; harmless otherwise.
        "source": row.get("target") or "",
        "source_kind": row.get("source_kind") or "url",
        "style": row.get("style") or "cinematic",
        "plan": plan_blob.get("plan") or None,
        "videoUrl": plan_blob.get("video_url") or None,
    }


def campaign_detail_payload(row: dict[str, Any],
                            assets: list[dict[str, Any]] | None = None,
                            ) -> dict[str, Any]:
    """``{campaign, plan, assets}`` for the detail page."""
    assets = assets or []
    plan_blob = row.get("plan") or {}
    if not isinstance(plan_blob, dict):
        plan_blob = {}

    summary = campaign_summary(row)
    summary.update({
        "workspace_id": row.get("workspace_id"),
        "total_cost_usd": float(row.get("total_cost_usd") or 0),
        "credits_spent": float(row.get("credits_spent") or 0),
        "finished_at": row.get("finished_at"),
        "raw_status": row.get("status"),
    })

    by_kind: dict[str, list[str]] = {}
    for a in assets:
        by_kind.setdefault(str(a.get("kind") or "other"), []).append(
            str(a.get("url") or "")
        )

    # Prefer the per-asset rows (authoritative) and fall back to the plan
    # blob for runs persisted before assets were split out.
    frames = by_kind.get("frame") or list(plan_blob.get("frames") or [])
    screenshots = by_kind.get("screenshot") or list(
        plan_blob.get("screenshots") or []
    )
    videos = by_kind.get("video") or []
    video_url = videos[0] if videos else (plan_blob.get("video_url") or None)

    return {
        "campaign": summary,
        "plan": {
            "plan": plan_blob.get("plan") or None,
            "script": plan_blob.get("script") or "",
            "frames": frames,
            "screenshots": screenshots,
            "video_url": video_url,
            "scenes": list(plan_blob.get("scenes") or by_kind.get("stitched") or []),
            "multi_scene": bool(plan_blob.get("multi_scene")),
        },
        "assets": [
            {
                "id": a.get("id"),
                "kind": a.get("kind"),
                "url": a.get("url"),
                "duration_s": a.get("duration_s"),
                "metadata": a.get("metadata") or {},
                "created_at": int(float(a.get("created_at") or 0) * 1000),
            }
            for a in assets
        ],
    }
