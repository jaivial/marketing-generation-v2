"""Billing endpoints: plan table, balance, top-up, checkout, cost estimate.

Everything on the wire is denominated in **credits** — never USD. The one
exception is ``price_usd`` on the plan table, which is the sticker price of
a subscription. The frontend converts credits to dollars itself using
``credits.CREDIT_USD``, so the conversion lives in exactly one constant.

Authorisation
=============
* ``GET  /billing/plans``    — public (guests browse the pricing page).
* ``GET  /billing/balance``  — workspace owner, or admin/root.
* ``POST /billing/checkout`` — workspace owner, or admin/root.
* ``POST /billing/topup``    — **root only**; we never let a user mint credits.
* ``GET  /campaigns/estimate`` — any authenticated caller (no workspace needed).

Note this module registers two routers: the ``/billing`` one and a small
``/campaigns`` one for the estimate endpoint, which lives under the campaign
namespace because that's where the wizard calls it from. Both are mounted by
``app/api/routes.py`` so ``app/main.py`` stays untouched.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.acl import Perm, Principal, require_permission, require_root
from app.services import credits, plans as plan_store, storage


router = APIRouter(prefix="/billing", tags=["billing"])
campaigns_router = APIRouter(prefix="/campaigns", tags=["billing"])


# ─── Schemas ────────────────────────────────────────────────────────────────
class PlanOut(BaseModel):
    name: str
    tagline: str
    monthly_credits: int
    price_usd: float
    #: Marginal credits per second of video — the UI divides the allowance by
    #: this to show a rough max duration per campaign.
    cost_per_sec: float


class BalanceOut(BaseModel):
    workspace_id: str
    balance_credits: float


class WorkspaceOut(BaseModel):
    workspace_id: str
    plan_name: str | None
    balance_credits: float


class TopupIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=64)
    credits: float = Field(gt=0, le=1_000_000, description="Credits to add")


class TopupOut(BaseModel):
    workspace_id: str
    added_credits: float
    balance_credits: float


class CheckoutIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=64)
    plan_name: str = Field(min_length=1, max_length=64)


class CheckoutOut(BaseModel):
    ok: bool
    workspace_id: str
    plan_name: str
    monthly_credits: int
    since: float


class EstimateOut(BaseModel):
    duration_s: int
    n_frames: int
    credits: float
    #: Convenience mirror so the caller doesn't have to know CREDIT_USD.
    usd: float
    credit_usd: float


# ─── Helpers ────────────────────────────────────────────────────────────────
def _own_workspace_id(principal: Principal) -> str:
    """The caller's own workspace id, or 404 if they don't have one yet."""
    ws = storage.get_workspace_by_owner(principal.id)
    if ws is None:
        raise HTTPException(404, "no workspace for this user")
    return ws["id"]


def _require_workspace_access(workspace_id: str, principal: Principal) -> dict:
    """Load a workspace and 403 unless the principal owns it (or is staff).

    Admins and root can act on any workspace — that's what makes the
    root-only top-up endpoint usable for support work.
    """
    ws = storage.get_workspace(workspace_id)
    if ws is None:
        raise HTTPException(404, "workspace not found")
    if principal.is_admin or principal.is_root:
        return ws
    if ws.get("owner_id") != principal.id:
        raise HTTPException(403, "not your workspace")
    return ws


# ─── Plan table (public) ────────────────────────────────────────────────────
@router.get("/plans", response_model=list[PlanOut])
def get_plans() -> list[dict]:
    """The public price table rendered by the pricing page."""
    return credits.list_plans()


# ─── Balance ────────────────────────────────────────────────────────────────
@router.get("/balance", response_model=BalanceOut)
def get_balance(
    workspace_id: str | None = Query(default=None, max_length=64),
    principal: Principal = Depends(require_permission(Perm.VIEW_DASHBOARD)),
) -> BalanceOut:
    """Current credit balance for a workspace, summed from the ledger.

    ``workspace_id`` is optional: the wizard just wants "my balance", so if
    it's omitted we resolve the caller's own workspace.
    """
    ws_id = workspace_id or _own_workspace_id(principal)
    _require_workspace_access(ws_id, principal)
    return BalanceOut(
        workspace_id=ws_id,
        balance_credits=storage.get_credit_balance(ws_id),
    )


@router.get("/workspace", response_model=WorkspaceOut)
def get_my_workspace(
    principal: Principal = Depends(require_permission(Perm.VIEW_DASHBOARD)),
) -> WorkspaceOut:
    """Bootstrap endpoint for the UI: which workspace am I, and on what plan?

    Saves the frontend from having to thread a workspace id through every
    billing call before it even knows what its workspace is.
    """
    ws_id = _own_workspace_id(principal)
    row = plan_store.get_workspace_plan(ws_id)
    return WorkspaceOut(
        workspace_id=ws_id,
        plan_name=row["plan_name"] if row else None,
        balance_credits=storage.get_credit_balance(ws_id),
    )


# ─── Top-up (root only) ─────────────────────────────────────────────────────
@router.post("/topup", response_model=TopupOut)
def topup(payload: TopupIn, _: Principal = Depends(require_root())) -> TopupOut:
    """Grant credits to a workspace. Root only — this mints value.

    Delegates to ``storage.apply_credit_delta`` so the ledger stays the
    single source of truth for the balance.
    """
    if storage.get_workspace(payload.workspace_id) is None:
        raise HTTPException(404, "workspace not found")
    balance = storage.apply_credit_delta(
        payload.workspace_id, delta=float(payload.credits), reason="topup",
    )
    return TopupOut(
        workspace_id=payload.workspace_id,
        added_credits=float(payload.credits),
        balance_credits=balance,
    )


# ─── Checkout (stub) ────────────────────────────────────────────────────────
@router.post("/checkout", response_model=CheckoutOut)
def checkout(
    payload: CheckoutIn,
    principal: Principal = Depends(require_permission(Perm.VIEW_DASHBOARD)),
) -> CheckoutOut:
    """Record the plan a workspace picked.

    Deliberately does **not** charge anything: this is the UI-scope stub
    described in the task. Swapping in a real payment provider later means
    replacing the body, not the contract.
    """
    _require_workspace_access(payload.workspace_id, principal)
    plan = credits.get_plan(payload.plan_name)
    if plan is None:
        raise HTTPException(404, f"unknown plan: {payload.plan_name}")
    row = plan_store.set_workspace_plan(payload.workspace_id, plan.name)
    return CheckoutOut(
        ok=True,
        workspace_id=payload.workspace_id,
        plan_name=plan.name,
        monthly_credits=plan.monthly_credits,
        since=row["since"],
    )


# ─── Cost estimate ──────────────────────────────────────────────────────────
@campaigns_router.get("/estimate", response_model=EstimateOut)
def estimate(
    duration_s: int = Query(ge=1, le=600),
    _: Principal = Depends(require_permission(Perm.VIEW_DASHBOARD)),
) -> EstimateOut:
    """What the wizard shows next to the Generate button: "~X credits"."""
    est = credits.estimate_campaign_cost(duration_s)
    price = credits.price_for_user(est)
    return EstimateOut(
        duration_s=est.duration_s,
        n_frames=est.n_frames,
        credits=price,
        usd=credits.credits_to_usd(price),
        credit_usd=credits.CREDIT_USD,
    )
