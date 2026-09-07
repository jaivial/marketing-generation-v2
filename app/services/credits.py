"""Credit pricing, cost estimation and the public plan table.

Everything the billing surface needs to answer two questions:

1. *What will this campaign cost us?*  ``estimate_campaign_cost()`` walks
   the raw vendor cost table (image model + video model + LLM calls) and
   returns a breakdown in **USD**.
2. *What do we charge the user for it?*  ``price_for_user()`` applies the
   platform margin and converts to **credits**, which is the only unit
   that ever crosses the wire.

The UI multiplies credits by :data:`CREDIT_USD` when it wants to show a
dollar figure, so there is exactly one place where the credit -> dollar
conversion is defined.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, asdict


# ---------------------------------------------------------------------------
# The one and only credit <-> dollar conversion
# ---------------------------------------------------------------------------
#: One credit is worth one US cent. The frontend imports the same constant
#: (mirrored in ``frontend/src/lib/credits.ts``) so both sides agree.
CREDIT_USD = 0.01


# ---------------------------------------------------------------------------
# Raw vendor cost table (USD)
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


def estimate_campaign_cost(duration_s: int, *,
                           n_frames: int | None = None) -> CostEstimate:
    """Estimate the raw vendor cost of generating a ``duration_s`` campaign.

    ``n_frames`` can be supplied when the orchestrator already knows the
    real keyframe count; otherwise it is derived from the duration.
    """
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


# ---------------------------------------------------------------------------
# Pricing
# ---------------------------------------------------------------------------
def price_for_user(estimate: CostEstimate | float, *,
                   margin: float = DEFAULT_MARGIN) -> float:
    """Convert a raw USD cost (or a :class:`CostEstimate`) into credits.

    Accepts either the dataclass or a bare USD float so callers that
    already summed things up don't have to build an estimate.
    """
    total_usd = estimate.total_usd if isinstance(estimate, CostEstimate) else float(estimate)
    return round(total_usd * float(margin) / CREDIT_USD, 2)


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
