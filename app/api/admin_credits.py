"""Root-only credit administration.

A single endpoint for now: ``POST /api/admin/credits/topup`` which adds
credits to a workspace ledger. Reading a workspace balance is handy for
support, so we expose a GET too.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.acl import Principal, require_root
from app.services import storage


router = APIRouter(prefix="/credits", tags=["admin:credits"])


class TopUpIn(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=64)
    amount_usd: float = Field(gt=0, le=100_000)


class BalanceOut(BaseModel):
    workspace_id: str
    balance: float


@router.post("/topup", response_model=BalanceOut)
def topup(payload: TopUpIn, _: Principal = Depends(require_root())) -> BalanceOut:
    """Grant credits to a workspace (root only)."""
    if storage.get_workspace(payload.workspace_id) is None:
        raise HTTPException(404, "workspace not found")
    balance = storage.apply_credit_delta(
        payload.workspace_id, delta=float(payload.amount_usd), reason="topup",
    )
    return BalanceOut(workspace_id=payload.workspace_id, balance=balance)


@router.get("/{workspace_id}", response_model=BalanceOut)
def get_balance(workspace_id: str, _: Principal = Depends(require_root())) -> BalanceOut:
    if storage.get_workspace(workspace_id) is None:
        raise HTTPException(404, "workspace not found")
    return BalanceOut(
        workspace_id=workspace_id,
        balance=storage.get_credit_balance(workspace_id),
    )
