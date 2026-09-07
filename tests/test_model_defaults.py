"""Task 6 - the underlying Wavespeed models were swapped.

Frame images  : wavespeed-ai/z-image/turbo            (text -> image)
Guided frames : wavespeed-ai/z-image-turbo/image-to-image
Video         : minimax/h3/reference-to-video         (max 15s per call)

Everything here is offline: we only assert on config defaults and on the
model string handed to the (mocked) ``wavespeed`` CLI.
"""
import asyncio
import importlib
from unittest import mock

from app.core.config import Settings, settings
from app.services.wavespeed_client import WavespeedCLI


# ---------------------------------------------------------------------------
# config defaults
# ---------------------------------------------------------------------------
def test_frame_image_model_default():
    assert settings.wavespeed_image_model == "wavespeed-ai/z-image/turbo"


def test_reference_guided_image_model_default():
    assert settings.wavespeed_i2i_model == "wavespeed-ai/z-image-turbo/image-to-image"


def test_video_model_default():
    assert settings.wavespeed_video_model == "minimax/h3/reference-to-video"


def test_video_max_duration_is_15s():
    """The new video model caps at 15s per call (was 30s)."""
    assert settings.wavespeed_video_max_duration_s == 15


def test_video_page_points_at_the_new_model():
    assert settings.wavespeed_video_page == (
        "https://wavespeed.ai/models/minimax/h3/reference-to-video"
    )


def test_old_model_names_are_gone():
    stale = ("openai/gpt-image-2/text-to-image", "alibaba/wan-3.0/reference-to-video")
    assert settings.wavespeed_image_model not in stale
    assert settings.wavespeed_video_model not in stale


def test_max_scenes_default_unchanged():
    """Chunking behaviour belongs to task #7; the scene cap must not move."""
    assert settings.wavespeed_video_max_scenes == 3


# ---------------------------------------------------------------------------
# env overrides still win (Open/Closed: a model swap is a config change)
# ---------------------------------------------------------------------------
def test_models_are_env_overridable():
    env = {
        "WAVESPEED_IMAGE_MODEL": "custom/img",
        "WAVESPEED_I2I_MODEL": "custom/i2i",
        "WAVESPEED_VIDEO_MODEL": "custom/vid",
        "WAVESPEED_VIDEO_MAX_DURATION_S": "8",
    }
    with mock.patch.dict("os.environ", env):
        import app.core.config as config_mod

        reloaded = importlib.reload(config_mod)
        try:
            assert reloaded.settings.wavespeed_image_model == "custom/img"
            assert reloaded.settings.wavespeed_i2i_model == "custom/i2i"
            assert reloaded.settings.wavespeed_video_model == "custom/vid"
            assert reloaded.settings.wavespeed_video_max_duration_s == 8
        finally:
            importlib.reload(reloaded)  # restore module-level defaults


def test_settings_is_frozen_dataclass():
    s = Settings()
    try:
        s.wavespeed_video_model = "nope"  # type: ignore[misc]
    except Exception:
        return
    raise AssertionError("Settings should be immutable")


# ---------------------------------------------------------------------------
# the new models actually reach the CLI
# ---------------------------------------------------------------------------
def test_generate_image_uses_new_frame_model():
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    async def fake_run(model, inputs):
        captured["model"] = model
        captured["inputs"] = inputs
        return {"data": {"outputs": ["https://img/out.png"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        url = asyncio.run(cli.generate_image("a neon skyline"))

    assert url == "https://img/out.png"
    assert captured["model"] == "wavespeed-ai/z-image/turbo"
    assert captured["inputs"]["prompt"] == "a neon skyline"


def test_generate_video_uses_new_video_model():
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    async def fake_run(model, inputs):
        captured["model"] = model
        captured["inputs"] = inputs
        return {"data": {"outputs": ["https://vid/out.mp4"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        asyncio.run(cli.generate_video("ad", ["https://img/a.png"], 10))

    assert captured["model"] == "minimax/h3/reference-to-video"
    assert captured["inputs"]["reference_images"] == ["https://img/a.png"]


def test_generate_video_clamps_to_15s():
    """A 30s request must be clamped down to the new 15s ceiling."""
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    async def fake_run(model, inputs):
        captured.update(inputs)
        return {"data": {"outputs": ["https://vid/out.mp4"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        asyncio.run(cli.generate_video("p", [], 30))

    assert captured["duration"] == 15


def test_decide_scenes_splits_a_30s_brief_now_that_cap_is_15s():
    """30s used to fit in one call; with a 15s cap it must be split."""
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(duration_s=30)

    assert plan.multi_scene is True
    assert all(c.duration_s <= 15 for c in plan.clips)
    assert len(plan.clips) <= settings.wavespeed_video_max_scenes
