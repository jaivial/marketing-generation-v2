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
def _build_req(req: CampaignRequest) -> Req:
    """Convert the API DTO into the orchestrator's domain request."""
    return Req(
        source_kind=req.source_kind,
        target=req.target,
        duration_s=req.duration_s,
        style=req.style,
        username=req.username,
        password=req.password,
        allow_screenshots=req.allow_screenshots,
        workspace_id=req.workspace_id,
    )


@router.post("/campaigns")
async def create_campaign(
    req: CampaignRequest,
    principal: Principal = Depends(require_permission(Perm.CREATE_CAMPAIGN)),
):
    """Stream the full pipeline as Server-Sent Events."""
    orch = orchestrator()
    domain_req = _build_req(req)

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
    domain_req = _build_req(req)
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
    """Demo history. A real backend would filter by principal.id /
    tenant_id so users only see their own data; admins see all."""
    return {"campaigns": [
        {"id": "c-001", "name": "Acme CMS launch", "duration_s": 30, "status": "done", "created_at": "2h ago", "color": "from-rose-500 to-amber-500"},
        {"id": "c-002", "name": "Q4 product teaser", "duration_s": 15, "status": "generating", "created_at": "12m ago", "color": "from-indigo-500 to-fuchsia-500"},
        {"id": "c-003", "name": "Black friday promo", "duration_s": 45, "status": "draft", "created_at": "1d ago", "color": "from-cyan-500 to-blue-500"},
        {"id": "c-004", "name": "Holiday story", "duration_s": 30, "status": "failed", "created_at": "3d ago", "color": "from-violet-500 to-pink-500"},
        {"id": "c-005", "name": "SaaS launch v2", "duration_s": 30, "status": "done", "created_at": "5d ago", "color": "from-amber-500 to-orange-500"},
        {"id": "c-006", "name": "Etsy store promo", "duration_s": 15, "status": "done", "created_at": "1w ago", "color": "from-emerald-500 to-lime-500"},
    ]}
