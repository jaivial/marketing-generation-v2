"""Credit pricing, cost estimation, reservation and the public plan table.

This module answers three questions:

1. *What will this campaign cost us?*  :func:`estimate_campaign_cost` walks
   the raw vendor cost table (image model + video model + LLM calls) and
   returns a breakdown in **USD**.
2. *What do we charge the user for it?*  :func:`price_for_user` applies the
   platform margin and returns **credits**, the only unit that crosses the
   wire.
3. *Can this workspace pay?*  :func:`require_credits` reserves the price up
   front, before the orchestrator touches an expensive provider, and
   :func:`refund_reservation` hands back whatever the run didn't burn.

Merge note (PR #8 <- main)
--------------------------
Two independent pricing surfaces landed in parallel and are both kept here
because both are load-bearing:

* the **billing//UI surface** (``/api/billing/*``, ``/api/campaigns/estimate``)
  estimates from a *duration* and prices in credits where ``1 credit = 1
  cent`` (:data:`CREDIT_USD`, margin :data:`DEFAULT_MARGIN`);
* the **orchestrator ledger** estimates from the concrete *shape* of a run
  (frames / clips / LLM calls) and reserves against the workspace balance
  using the :data:`COSTS` table and :data:`PROFIT_MARGIN`.

The two entry points are therefore overloaded rather than merged: they use
different units and cannot be collapsed without changing behaviour that
tests (and the ledger) depend on. Dispatch is by argument shape/type:

    estimate_campaign_cost(30)                    -> CostEstimate  (billing)
    estimate_campaign_cost(n_frames=..., ...)     -> float USD     (ledger)
    price_for_user(CostEstimate)                  -> credits @ 1c  (billing)
    price_for_user(0.92)                          -> credits @ $1  (ledger)

Everything that touches the database goes through
:mod:`app.services.storage`, so tests can point storage at a temp SQLite file.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict
from typing import Any

from app.services import storage


# ---------------------------------------------------------------------------
# The one and only credit <-> dollar conversion (billing surface)
# ---------------------------------------------------------------------------
#: One credit is worth one US cent. The frontend imports the same constant
#: (mirrored in ``frontend/src/lib/credits.ts``) so both sides agree.
CREDIT_USD = 0.01


# ---------------------------------------------------------------------------
# Raw vendor cost table (USD) -- duration-based, used by the billing surface
# ---------------------------------------------------------------------------
# These are our *cost*, not the user's price. Keep them in one place so a
# vendor price change is a one-line diff.
VIDEO_COST_PER_SEC_USD = 0.05        # reference-to-video, per generated second
IMAGE_COST_PER_FRAME_USD = 0.02      # text-to-image, per keyframe
CHAT_COST_PER_CAMPAIGN_USD = 0.01    # plan + script LLM round-trips

#: Keyframe cadence: one frame every N seconds (mirrors ``nFrames()`` in the UI).
SECONDS_PER_FRAME = 2
#: Even a 1s clip gets a first/last frame.
MIN_FRAMES = 2

#: Platform margin applied on top of raw cost when pricing for the user.
DEFAULT_MARGIN = 1.6


# ---------------------------------------------------------------------------
# Per-unit cost table (USD) -- shape-based, used by the orchestrator ledger
# ---------------------------------------------------------------------------
# Per-model base cost in USD (the cost the provider charges us).
COSTS = {
    "minimax_chat":      0.002,   # per LLM call (flat estimate)
    "image":             0.03,    # per image
    "video_15s":         0.50,    # per 15-second clip (the model cap)
    "screenshot":        0.0,     # free (we already pay for the scrape)
}

# Sell at base_cost x 1.5 -- the profit margin on reserved runs.
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
# Estimation
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CostEstimate:
    """Raw (pre-margin) cost breakdown for a single campaign, in USD."""

    duration_s: int
    n_frames: int
    video_usd: float
    image_usd: float
    chat_usd: float
    total_usd: float

    def as_dict(self) -> dict:
        return asdict(self)


def n_frames_for(duration_s: int) -> int:
    """How many keyframes a clip of ``duration_s`` needs."""
    return max(MIN_FRAMES, math.ceil(max(0, int(duration_s)) / SECONDS_PER_FRAME))


def _estimate_by_duration(duration_s: int, n_frames: int | None = None) -> CostEstimate:
    """Billing-surface estimate: derive the cost from the clip duration."""
    duration_s = max(0, int(duration_s))
    frames = int(n_frames) if n_frames is not None else n_frames_for(duration_s)
    frames = max(0, frames)

    video = duration_s * VIDEO_COST_PER_SEC_USD
    image = frames * IMAGE_COST_PER_FRAME_USD
    chat = CHAT_COST_PER_CAMPAIGN_USD
    return CostEstimate(
        duration_s=duration_s,
        n_frames=frames,
        video_usd=round(video, 6),
        image_usd=round(image, 6),
        chat_usd=round(chat, 6),
        total_usd=round(video + image + chat, 6),
    )


def _estimate_by_shape(n_frames: int, n_video_clips: int, n_llm_calls: int) -> float:
    """Ledger estimate: base cost in USD for a campaign with the given shape."""
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


def estimate_campaign_cost(duration_s: int | None = None, *,
                           n_frames: int | None = None,
                           n_video_clips: int | None = None,
                           n_llm_calls: int | None = None):
    """Estimate the raw vendor cost of a campaign.

    Two calling conventions (see the merge note in the module docstring):

    * ``estimate_campaign_cost(duration_s, n_frames=None)`` -> :class:`CostEstimate`
      for the billing surface, which only knows how long the video is.
    * ``estimate_campaign_cost(n_frames=..., n_video_clips=..., n_llm_calls=...)``
      -> ``float`` USD for the orchestrator, which knows the exact shape of
      the run it is about to pay for.
    """
    if duration_s is not None:
        return _estimate_by_duration(duration_s, n_frames)
    if n_video_clips is not None or n_llm_calls is not None:
        return _estimate_by_shape(n_frames or 0, n_video_clips or 0, n_llm_calls or 0)
    raise TypeError(
        "estimate_campaign_cost() needs either duration_s or the "
        "n_frames/n_video_clips/n_llm_calls triple"
    )


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------
def price_for_user(estimate: CostEstimate | float, *,
                   margin: float | None = None) -> float:
    """Convert a raw cost into the credits we charge the user.

    A :class:`CostEstimate` comes from the billing surface, where one credit
    is one cent (:data:`CREDIT_USD`) and the margin is :data:`DEFAULT_MARGIN`.
    A bare USD float comes from the orchestrator ledger, which prices at
    :data:`PROFIT_MARGIN` and rounds up to whole cents. The units differ, so
    the two paths stay separate -- see the module docstring.
    """
    if isinstance(estimate, CostEstimate):
        return round(estimate.total_usd * float(
            DEFAULT_MARGIN if margin is None else margin) / CREDIT_USD, 2)

    base = max(0.0, float(estimate))
    cents = base * float(PROFIT_MARGIN if margin is None else margin) * 100.0
    # Round first to kill float noise (0.1*3 = 0.30000000000000004), then ceil.
    return math.ceil(round(cents, 6)) / 100.0


def credits_to_usd(credits: float) -> float:
    """Dollar value of ``credits`` (the UI does the same multiplication)."""
    return round(float(credits) * CREDIT_USD, 4)


def cost_per_sec_credits(*, margin: float = DEFAULT_MARGIN) -> float:
    """Marginal price of one extra second of video, in credits.

    The pricing page divides a plan's monthly allowance by this number to
    show a rough "max duration per campaign" figure.
    """
    per_sec_usd = VIDEO_COST_PER_SEC_USD + IMAGE_COST_PER_FRAME_USD / SECONDS_PER_FRAME
    return round(per_sec_usd * float(margin) / CREDIT_USD, 4)


# ---------------------------------------------------------------------------
# Reservation / refund
# ---------------------------------------------------------------------------
def _ledger(store: Any | None = None) -> Any:
    """The storage backend to bill against.

    Defaults to :mod:`app.services.storage`. Callers that already work
    against an injected store (the orchestrator, which takes a ``storage=``
    argument so tests can hand it a fake) pass theirs through so the ledger
    and the campaign rows can never end up in two different places.

    A store that does not implement the credit ledger at all (e.g. a test
    double that only records campaigns) is treated as "no billing backend",
    which is what :func:`ledger_available` reports on.
    """
    return store if store is not None else storage


def ledger_available(store: Any | None = None) -> bool:
    """True when ``store`` can actually keep a credit ledger.

    Billing is opt-in on the storage backend: the real module implements it,
    a minimal fake used by unit tests typically does not. Callers use this to
    skip charging rather than to crash on a missing attribute.
    """
    ledger = _ledger(store)
    return all(
        callable(getattr(ledger, name, None))
        for name in ("get_credit_balance", "apply_credit_delta")
    )


def require_credits(workspace_id: str, base_cost_usd: float, *,
                    campaign_id: str | None = None,
                    store: Any | None = None) -> float:
    """Pre-flight check + reservation.

    Raises :class:`InsufficientCreditsError` when the workspace cannot cover
    ``price_for_user(base_cost_usd)``. Otherwise the price is deducted from
    the ledger and the *new* balance is returned.
    """
    ledger = _ledger(store)
    price = price_for_user(base_cost_usd)
    balance = ledger.get_credit_balance(workspace_id)
    if balance < price:
        raise InsufficientCreditsError(workspace_id, price, balance)
    reason = f"reserve:{campaign_id}" if campaign_id else "reserve"
    return ledger.apply_credit_delta(workspace_id, delta=-price, reason=reason)


def refund_reservation(workspace_id: str, amount: float, *,
                       campaign_id: str | None = None,
                       store: Any | None = None) -> float:
    """Give ``amount`` credits back after a failed / partial generation.

    ``amount`` is expressed in *credits* (i.e. the same unit
    :func:`require_credits` deducts). Returns the new balance. A
    non-positive amount is a no-op so callers don't have to guard.
    """
    ledger = _ledger(store)
    amount = round(float(amount), 2)
    if amount <= 0:
        return ledger.get_credit_balance(workspace_id)
    reason = f"refund:{campaign_id}" if campaign_id else "refund"
    return ledger.apply_credit_delta(workspace_id, delta=amount, reason=reason)


# ---------------------------------------------------------------------------
# Public plan table
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Plan:
    """A subscription tier as shown on the pricing page."""

    name: str
    tagline: str
    monthly_credits: int
    price_usd: float

    def as_dict(self) -> dict:
        d = asdict(self)
        d["cost_per_sec"] = cost_per_sec_credits()
        return d


PLANS: tuple[Plan, ...] = (
    Plan(name="Starter", tagline="For tinkering and first drafts",
         monthly_credits=2_000, price_usd=19.0),
    Plan(name="Pro", tagline="For creators and marketers",
         monthly_credits=10_000, price_usd=79.0),
    Plan(name="Studio", tagline="For agencies and teams",
         monthly_credits=40_000, price_usd=299.0),
)


def list_plans() -> list[dict]:
    """Serialise the plan table for the ``/api/billing/plans`` endpoint."""
    return [p.as_dict() for p in PLANS]


def get_plan(name: str) -> Plan | None:
    """Case-insensitive plan lookup."""
    want = (name or "").strip().lower()
    for p in PLANS:
        if p.name.lower() == want:
            return p
    return None
