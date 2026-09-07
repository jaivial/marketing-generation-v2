"""HTTP + SSE endpoints. Thin layer: validate \u2192 delegate to orchestrator.

All non-public routes are gated by the ACL. Each endpoint declares
the minimum permission (or role) required via a dependency.
"""
from __future__ import annotations
import json
import pathlib
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
from app.services.campaign_view import (
    campaign_detail_payload,
    campaign_summary,
)
from app.services.orchestrator import CampaignRequest as Req


router = APIRouter()
STATIC = pathlib.Path(__file__).parent.parent.parent / "static"


# \u2500\u2500\u2500 Public \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
@router.get("/health")
def health(_: Principal = Depends(get_current_principal)) -> dict:
    """Public health check \u2014 returns 200 for anyone."""
    return {"ok": True}


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

    When we can resolve a workspace for the caller we pass it down so the
    orchestrator persists the run; otherwise the run stays ephemeral and the
    pipeline behaves exactly as it did before.
    """
    workspace_id = workspace_id_for(principal) if principal else None
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
