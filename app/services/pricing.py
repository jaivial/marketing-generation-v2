"""Cost accounting for a campaign run.

The orchestrator has to answer two different questions:

1. *What did this run cost us?* -- the raw provider spend (Wavespeed image /
   video calls, agent-browser screenshots). That number is persisted on the
   campaign row as ``total_cost_usd`` so we can reconcile the monthly
   provider invoice against individual campaigns.

2. *What do we charge the user for it?* -- the retail price, i.e. the raw
   spend multiplied by our margin. That number is persisted as
   ``credits_spent`` and is what the credit ledger debits.

Keeping both in one tiny module means the markup lives in exactly one
place. Every constant is overridable from the environment so ops can react
to provider price changes without a code deploy.
"""
from __future__ import annotations
import os


def _f(name: str, default: float) -> float:
    """Read a float from the environment, falling back to ``default``."""
    try:
        return float(os.getenv(name, "") or default)
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Provider unit costs (USD)
# ---------------------------------------------------------------------------
def image_unit_cost() -> float:
    """Cost of a single text->image generation."""
    return _f("COST_PER_IMAGE_USD", 0.04)


def video_unit_cost_per_s() -> float:
    """Cost of one second of generated video."""
    return _f("COST_PER_VIDEO_SECOND_USD", 0.12)


def screenshot_unit_cost() -> float:
    """Cost of one agent-browser screenshot capture + CDN upload."""
    return _f("COST_PER_SCREENSHOT_USD", 0.002)


def chat_unit_cost() -> float:
    """Rough per-completion cost of the planning LLM calls."""
    return _f("COST_PER_CHAT_CALL_USD", 0.003)


def user_markup() -> float:
    """Multiplier applied to raw spend to get the retail price."""
    return _f("USER_PRICE_MARKUP", 3.0)


# ---------------------------------------------------------------------------
# Estimators
# ---------------------------------------------------------------------------
def cost_for_images(n: int) -> float:
    return max(0, int(n)) * image_unit_cost()


def cost_for_video(duration_s: float) -> float:
    """Cost of ``duration_s`` seconds of generated video.

    Multi-scene runs split the same total duration across up to three
    clips, so billing on total seconds is correct for both strategies.
    """
    return max(0.0, float(duration_s)) * video_unit_cost_per_s()


def cost_for_screenshots(n: int) -> float:
    return max(0, int(n)) * screenshot_unit_cost()


def cost_for_chat(n_calls: int) -> float:
    return max(0, int(n_calls)) * chat_unit_cost()


def price_for_user(cost_usd: float, markup: float | None = None) -> float:
    """Retail price (in credits) for a run that cost us ``cost_usd``.

    Rounded to 4 decimals so the ledger never accumulates float noise.
    """
    try:
        raw = float(cost_usd)
    except (TypeError, ValueError):
        return 0.0
    if raw <= 0:
        return 0.0
    m = user_markup() if markup is None else float(markup)
    return round(raw * m, 4)


class BudgetMeter:
    """Tiny mutable accumulator threaded through one campaign run.

    The orchestrator bumps it after every billable collaborator call; at the
    end ``consumed`` is the raw provider spend and ``retail`` is what the
    user is charged.
    """

    __slots__ = ("consumed",)

    def __init__(self) -> None:
        self.consumed: float = 0.0

    def add(self, amount: float) -> float:
        self.consumed = round(self.consumed + max(0.0, float(amount)), 6)
        return self.consumed

    def add_images(self, n: int) -> float:
        return self.add(cost_for_images(n))

    def add_video(self, duration_s: float) -> float:
        return self.add(cost_for_video(duration_s))

    def add_screenshots(self, n: int) -> float:
        return self.add(cost_for_screenshots(n))

    def add_chat(self, n_calls: int = 1) -> float:
        return self.add(cost_for_chat(n_calls))

    @property
    def retail(self) -> float:
        return price_for_user(self.consumed)
