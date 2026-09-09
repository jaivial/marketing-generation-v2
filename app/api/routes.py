"""HTTP + SSE endpoints. Thin layer: validate \u2192 delegate to orchestrator.

All non-public routes are gated by the ACL. Each endpoint declares
the minimum permission (or role) required via a dependency.
"""
from __future__ import annotations
import asyncio
import json
import pathlib
from dataclasses import replace as _replace

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, HTMLResponse
from sse_starlette.sse import EventSourceResponse

from app.core.acl import (
    Perm,
    Principal,
    Role,
    get_current_principal,
    require_permission,
)
from app.core.container import orchestrator
from app.models.schemas import CampaignRequest
from app.services import storage
from app.services import event_log
from app.services.campaign_view import (
    campaign_detail_payload,
    campaign_summary,
)
from app.services.orchestrator import CampaignRequest as Req
from app.api.billing import (
    router as billing_router,
    campaigns_router as billing_campaigns_router,
)


router = APIRouter()
STATIC = pathlib.Path(__file__).parent.parent.parent / "static"

# Billing lives in its own module but is mounted here so app/main.py (shipped
# in PR #3) doesn't need to change. Final paths: /api/billing/* and
# /api/campaigns/estimate.
router.include_router(billing_router)
router.include_router(billing_campaigns_router)


# \u2500\u2500\u2500 Public \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
@router.get("/health")
def health(_: Principal = Depends(get_current_principal)) -> dict:
    """Public health check \u2014 returns 200 for anyone.

    Probes the configured dependencies so a misconfigured deploy fails loud
    instead of returning 200-with-broken-pipeline. The body is informational;
    the status code is still 200 unless the process is genuinely unable to
    serve HTTP at all.
    """
    import os
    from app.core.db import get_db

    checks: dict[str, object] = {
        "minimax_api_key_set": bool(os.getenv("MINIMAX_API_KEY", "")),
        "wavespeed_api_key_set": bool(os.getenv("WAVESPEED_API_KEY", "")),
        "output_dir_writable": False,
        "database_reachable": False,
    }

    try:
        out_dir = pathlib.Path(os.getenv("OUTPUT_DIR", "/home/jaime/marketing-generation/output"))
        out_dir.mkdir(parents=True, exist_ok=True)
        probe = out_dir / ".health_probe"
        probe.write_text("ok")
        probe.unlink()
        checks["output_dir_writable"] = True
    except OSError:
        pass

    try:
        with get_db().connection() as conn:
            conn.execute("SELECT 1").fetchone()
        checks["database_reachable"] = True
    except Exception:
        pass

    ok = all(v is True for v in checks.values())
    return {
        "ok": ok,
        "service": "marketing-generation",
        "checks": checks,
    }


@router.get("/auth/whoami")
def whoami(principal: Principal = Depends(get_current_principal)) -> dict:
    """Returns the current principal so the frontend can render
    role-aware UI. The endpoint itself is public \u2014 the response is
    just the empty guest principal for anonymous callers."""
    return {
        "id": principal.id,
        "email": principal.email,
        "name": principal.name,
        "roles": int(principal.roles),
        "roles_names": [r.name for r in Role
                       if r in principal.roles and r != Role.NONE],
        "is_authenticated": principal.is_authenticated,
        "is_admin": principal.is_admin,
        "is_root": principal.is_root,
    }


# \u2500\u2500\u2500 Authenticated \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
def workspace_id_for(principal: Principal) -> str | None:
    """Resolve the workspace a principal reads and writes campaigns in.

    Every registered user gets a personal workspace at sign-up (see
    ``app/api/auth.py``), so the owner lookup is enough today. Demo-token
    principals (and guests) have no workspace at all -- callers must treat
    ``None`` as "nothing to show".
    """
    if not principal.is_authenticated:
        return None
    explicit = (principal.extra or {}).get("workspace_id")
    if explicit:
        return str(explicit)
    try:
        ws = storage.get_workspace_by_owner(principal.id)
    except Exception:  # noqa: BLE001 -- no DB configured (e.g. unit tests)
        return None
    return ws["id"] if ws else None


def _build_req(req: CampaignRequest,
               principal: Principal | None = None) -> Req:
    """Convert the API DTO into the orchestrator's domain request.

    The workspace serves double duty: it is what the orchestrator charges
    credits against *and* what it persists the run under. An explicit
    ``workspace_id`` on the DTO wins (that is what the billing wizard
    sends); otherwise we resolve it from the caller. When neither yields a
    workspace the run stays ephemeral and uncharged, exactly as before.
    """
    workspace_id = req.workspace_id or (
        workspace_id_for(principal) if principal else None
    )
    return Req(
        source_kind=req.source_kind,
        target=req.target,
        duration_s=req.duration_s,
        style=req.style,
        username=req.username,
        password=req.password,
        allow_screenshots=req.allow_screenshots,
        workspace_id=workspace_id,
        user_id=principal.id if (principal and workspace_id) else None,
    )


@router.post("/campaigns")
async def create_campaign(
    req: CampaignRequest,
    principal: Principal = Depends(require_permission(Perm.CREATE_CAMPAIGN)),
):
    """Stream the full pipeline as Server-Sent Events."""
    orch = orchestrator()
    domain_req = _build_req(req, principal)

    async def event_gen():
        async for ev in orch.run(domain_req):
            yield {"event": ev["event"], "data": json.dumps(ev["data"])}

    return EventSourceResponse(event_gen())


@router.post("/campaigns/sync")
async def create_campaign_sync(
    req: CampaignRequest,
    principal: Principal = Depends(require_permission(Perm.CREATE_CAMPAIGN)),
):
    """Optional: collect the stream into one JSON response (for non-SSE clients)."""
    orch = orchestrator()
    domain_req = _build_req(req, principal)
    events: list[dict] = []
    async for ev in orch.run(domain_req):
        events.append(ev)
        if ev["event"] == "error":
            raise HTTPException(status_code=500, detail=ev["data"])
    return {"events": events}


#: Background generation tasks, kept referenced so the loop never GCs them.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


async def _run_in_background(orch, domain_req, campaign_id: str) -> None:
    """Drive the pipeline off the request thread.

    Coordination id: pipeline.background.run. Every event is appended to the
    store *before* it is handed to a subscriber queue, so a client that
    reconnects replays exactly what a live client saw.

    The framework stamps the terminal status (``done`` / ``failed``) itself so
    a custom orchestrator or a test fake that yields a ``done`` event still
    results in a correctly-closed campaign row.
    """
    try:
        async for ev in orch.run(domain_req):
            event_log.publish(campaign_id, ev["event"], ev["data"])
            if ev["event"] == "done":
                storage.set_campaign_status(campaign_id, "done")
            elif ev["event"] == "error":
                storage.set_campaign_status(
                    campaign_id, "failed",
                    plan_json={"error": ev["data"].get("message", "error")},
                )
    except Exception as e:  # noqa: BLE001 -- the run must always terminate
        event_log.publish(campaign_id, "error", {
            "code": getattr(e, "code", "pipeline_error"),
            "message": str(e),
            "campaign_id": campaign_id,
        })
        try:
            storage.set_campaign_status(
                campaign_id, "failed", plan_json={"error": str(e)},
            )
        except Exception:
            pass


@router.post("/campaigns/start", status_code=status.HTTP_202_ACCEPTED)
async def start_campaign(
    req: CampaignRequest,
    principal: Principal = Depends(require_permission(Perm.CREATE_CAMPAIGN)),
) -> dict:
    """Create the row and start generating in the background.

    Coordination id: pipeline.campaign.start. Returns 202 with the id straight
    away; the client follows GET /api/campaigns/{id}/events (SSE) instead of
    holding an HTTP request open for the whole run.
    """
    workspace_id = req.workspace_id or workspace_id_for(principal)
    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no workspace to run this campaign in",
        )
    row = storage.create_campaign(
        workspace_id=workspace_id,
        user_id=principal.id,
        source_kind=req.source_kind,
        target=req.target,
        duration_s=req.duration_s,
        style=req.style,
    )
    storage.set_campaign_status(row["id"], "running")
    # The orchestrator adopts the row we just created instead of making its own.
    domain_req = _replace(_build_req(req, principal), campaign_id=row["id"])
    task = asyncio.create_task(
        _run_in_background(orchestrator(), domain_req, row["id"])
    )
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return {"id": row["id"], "status": "running"}


@router.get("/campaigns/{campaign_id}/events")
async def campaign_events(
    campaign_id: str,
    principal: Principal = Depends(require_permission(Perm.VIEW_CAMPAIGNS_OWN)),
):
    """SSE feed: full replay of the persisted events, then live tail.

    Coordination id: pipeline.campaign.events. Scoped exactly like the detail
    endpoint; the stream closes itself once the run hits done | error.
    """
    row = storage.get_campaign(campaign_id)
    if row is None:
        raise HTTPException(status_code=404, detail="campaign not found")
    if row.get("workspace_id") != workspace_id_for(principal):
        if not principal.can(Perm.VIEW_CAMPAIGNS_ALL):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="campaign belongs to another workspace",
            )

    async def event_gen():
        async for item in event_log.stream(campaign_id):
            yield {
                "event": item["event"],
                "data": json.dumps(item["data"]),
                "id": str(item["seq"]),   # obs: pipeline.event.seq
            }

    return EventSourceResponse(event_gen())


@router.get("/campaigns/history")
def history(
    principal: Principal = Depends(require_permission(Perm.VIEW_CAMPAIGNS_OWN)),
):
    """Real campaign history for the caller's workspace.

    Rows are read from the SQLite store and reshaped into the flat objects
    the existing ``Campaigns.tsx`` / ``Library.tsx`` tables already expect
    (``id, name, duration_s, status, created_at, color``). A caller with no
    workspace -- e.g. a demo-token principal -- simply gets an empty list
    rather than someone else's data.
    """
    workspace_id = workspace_id_for(principal)
    if not workspace_id:
        return {"campaigns": []}
    rows = storage.list_campaigns_for_workspace(workspace_id)
    return {"campaigns": [campaign_summary(r) for r in rows]}


@router.get("/campaigns/{campaign_id}")
def campaign_detail(
    campaign_id: str,
    principal: Principal = Depends(require_permission(Perm.VIEW_CAMPAIGNS_OWN)),
):
    """Full campaign record: ``{campaign, plan, assets}``.

    Scoped to the caller's workspace: a campaign that belongs to somebody
    else is a 403 (it exists, you just can't see it), an id nobody owns is a
    404. Admins with ``VIEW_CAMPAIGNS_ALL`` bypass the ownership check.
    """
    row = storage.get_campaign(campaign_id)
    if row is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    workspace_id = workspace_id_for(principal)
    if row.get("workspace_id") != workspace_id:
        if not principal.can(Perm.VIEW_CAMPAIGNS_ALL):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="campaign belongs to another workspace",
            )

    assets = storage.list_campaign_assets(campaign_id)
    return campaign_detail_payload(row, assets)
