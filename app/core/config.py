"""Single source of truth for settings (S - Single Responsibility)."""
import os
import shutil
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    minimax_api_key: str = os.getenv("MINIMAX_API_KEY", "")
    minimax_base_url: str = os.getenv("MINIMAX_BASE_URL", "https://agent.minimax.io/mavis/api/v1/llm/v1")
    minimax_model: str = os.getenv("MINIMAX_MODEL", "MiniMax-M3")
    wavespeed_api_key: str = os.getenv("WAVESPEED_API_KEY", "")
    # The reference-to-video model accepts up to 10 reference images and produces
    # a coherent 2-30s clip with optional audio. We default to it because it
    # supports all the reference-driven composition we want (subjects, brand
    # assets, app screenshots) in a single coherent clip.
    wavespeed_video_model: str = os.getenv(
        "WAVESPEED_VIDEO_MODEL", "alibaba/wan-3.0/reference-to-video"
    )
    wavespeed_video_model_page: str = os.getenv(
        "WAVESPEED_VIDEO_MODEL_PAGE",
        "https://wavespeed.ai/models/alibaba/wan-3.0/reference-to-video",
    )
    wavespeed_image_model: str = os.getenv("WAVESPEED_IMAGE_MODEL", "openai/gpt-image-2/text-to-image")
    # Per-model hard limit; reference-to-video caps at 30s per call. The
    # orchestrator uses this when it decides how many scene-clips to chain.
    wavespeed_video_max_duration_s: int = int(os.getenv("WAVESPEED_VIDEO_MAX_DURATION_S", "30"))
    # Cap on simultaneous scene calls (the issue's "max 3 different calls").
    wavespeed_video_max_scenes: int = int(os.getenv("WAVESPEED_VIDEO_MAX_SCENES", "3"))
    agent_browser_bin: str = os.getenv("AGENT_BROWSER_BIN", shutil.which("agent-browser") or "agent-browser")
    output_dir: str = os.getenv("OUTPUT_DIR", "output")


settings = Settings()
