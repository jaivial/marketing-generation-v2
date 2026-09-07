"""Pydantic models \u2014 keep DTOs tiny and reusable."""
from pydantic import BaseModel, Field


class CampaignRequest(BaseModel):
    source_kind: str = Field(pattern="^(files|url)$")
    target: str = Field(min_length=1, max_length=2048)
    duration_s: int = Field(default=30, ge=15, le=45)
    style: str = Field(default="cinematic", max_length=64)
    # Optional HTTP basic auth for sites that require login. Never persisted
    # in history; only used during the scrape step.
    username: str | None = Field(default=None, max_length=256)
    password: str | None = Field(default=None, max_length=256)
    # Allow the orchestrator to capture web-app screenshots via agent-browser
    # and feed them to the video model. Default True (the AI decides).
    allow_screenshots: bool = Field(default=True)
    # Workspace whose credit balance pays for the run. When omitted the run
    # is not charged (kept optional for backward compatibility).
    workspace_id: str | None = Field(default=None, max_length=64)
