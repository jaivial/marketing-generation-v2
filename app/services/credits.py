"""Credit accounting: cost estimation, pre-flight reservation and refunds.

Every campaign generation costs us real money (MiniMax for the chat calls,
GPT-Image for the frames and wavespeed for the video clips). The workspace
pays *up front*: before the orchestrator touches an expensive provider we
reserve ``price_for_user(base_cost)`` credits from the workspace ledger. If
the pipeline blows up half-way through we hand the unused portion back.

The module is deliberately tiny and pure-ish: everything that touches the
database goes through :mod:`app.services.storage`, so tests can point the
storage layer at a temporary SQLite file.
"""
from __future__ import annotations

import math

from app.services import storage


# ---------------------------------------------------------------------------
# Price table
# ---------------------------------------------------------------------------
# Per-model base cost in USD (the cost the provider charges us).
COSTS = {
    "minimax_chat":      0.002,   # per LLM call (flat estimate)
    "image":             0.03,    # per image
    "video_15s":         0.50,    # per 15-second clip (the model cap)
    "screenshot":        0.0,     # free (we already pay for the scrape)
}

# Sell at base_cost × 1.5 — the profit margin.
PROFIT_MARGIN = 1.5


class InsufficientCreditsError(Exception):
    """Raised when a workspace cannot pay for the requested campaign."""

    def __init__(self, workspace_id: str, required: float, balance: float) -> None:
        self.workspace_id = workspace_id
        self.required = required
        self.balance = balance
        super().__init__(
            f"insufficient credits for workspace {workspace_id}: "
            f"required={required:.2f}, balance={balance:.2f}"
        )


# ---------------------------------------------------------------------------
# Estimation / pricing
# ---------------------------------------------------------------------------
def estimate_campaign_cost(*, n_frames: int, n_video_clips: int,
                           n_llm_calls: int) -> float:
    """Base cost in USD for a campaign with the given shape."""
    n_frames = max(0, int(n_frames))
    n_video_clips = max(0, int(n_video_clips))
    n_llm_calls = max(0, int(n_llm_calls))
    total = (
        n_frames * COSTS["image"]
        + n_video_clips * COSTS["video_15s"]
        + n_llm_calls * COSTS["minimax_chat"]
    )
    # Screenshots are free, but keep them in the formula so the table stays
    # the single source of truth if that ever changes.
    return round(total + COSTS["screenshot"], 6)


def price_for_user(base_cost_usd: float) -> float:
    """Credits cost shown to the user (rounded up to 2 decimals)."""
    base = max(0.0, float(base_cost_usd))
    cents = base * PROFIT_MARGIN * 100.0
    # Round first to kill float noise (0.1*3 = 0.30000000000000004), then ceil.
    return math.ceil(round(cents, 6)) / 100.0


# ---------------------------------------------------------------------------
# Reservation / refund
# ---------------------------------------------------------------------------
def require_credits(workspace_id: str, base_cost_usd: float, *,
                    campaign_id: str | None = None) -> float:
    """Pre-flight check + reservation.

    Raises :class:`InsufficientCreditsError` when the workspace cannot cover
    ``price_for_user(base_cost_usd)``. Otherwise the price is deducted from
    the ledger and the *new* balance is returned.
    """
    price = price_for_user(base_cost_usd)
    balance = storage.get_credit_balance(workspace_id)
    if balance < price:
        raise InsufficientCreditsError(workspace_id, price, balance)
    reason = f"reserve:{campaign_id}" if campaign_id else "reserve"
    return storage.apply_credit_delta(workspace_id, delta=-price, reason=reason)


def refund_reservation(workspace_id: str, amount: float, *,
                       campaign_id: str | None = None) -> float:
    """Give ``amount`` credits back after a failed / partial generation.

    ``amount`` is expressed in *credits* (i.e. the same unit
    :func:`require_credits` deducts). Returns the new balance. A
    non-positive amount is a no-op so callers don't have to guard.
    """
    amount = round(float(amount), 2)
    if amount <= 0:
        return storage.get_credit_balance(workspace_id)
    reason = f"refund:{campaign_id}" if campaign_id else "refund"
    return storage.apply_credit_delta(workspace_id, delta=amount, reason=reason)
