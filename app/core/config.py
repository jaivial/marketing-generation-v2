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
    # The reference-to-video model accepts up to 10 reference images and
    # produces a coherent clip (max 15s per call) with optional audio. We
    # default to it because it supports all the reference-driven composition
    # we want (subjects, brand assets, app screenshots) in a single coherent
    # clip.
    wavespeed_video_model: str = os.getenv(
        "WAVESPEED_VIDEO_MODEL", "minimax/h3/reference-to-video"
    )
    # Documentation link for the video model. ``wavespeed_video_page`` is the
    # canonical name; ``wavespeed_video_model_page`` is kept as a
    # backwards-compatible alias for existing call sites.
    wavespeed_video_page: str = os.getenv(
        "WAVESPEED_VIDEO_PAGE",
        "https://wavespeed.ai/models/minimax/h3/reference-to-video",
    )
    wavespeed_video_model_page: str = os.getenv(
        "WAVESPEED_VIDEO_MODEL_PAGE",
        "https://wavespeed.ai/models/minimax/h3/reference-to-video",
    )
    # Frame images (text -> image).
    wavespeed_image_model: str = os.getenv("WAVESPEED_IMAGE_MODEL", "wavespeed-ai/z-image/turbo")
    # Reference-image guided frames (image -> image).
    wavespeed_i2i_model: str = os.getenv(
        "WAVESPEED_I2I_MODEL", "wavespeed-ai/z-image-turbo/image-to-image"
    )
    # Per-model hard limit; the reference-to-video model caps at 15s per call.
    # The orchestrator uses this when it decides how many scene-clips to chain.
    wavespeed_video_max_duration_s: int = int(os.getenv("WAVESPEED_VIDEO_MAX_DURATION_S", "15"))
    # Cap on simultaneous scene calls (the issue's "max 3 different calls").
    wavespeed_video_max_scenes: int = int(os.getenv("WAVESPEED_VIDEO_MAX_SCENES", "3"))
    agent_browser_bin: str = os.getenv("AGENT_BROWSER_BIN", shutil.which("agent-browser") or "agent-browser")
    output_dir: str = os.getenv("OUTPUT_DIR", "output")


settings = Settings()
