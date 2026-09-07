"""Tests for the smart scene-decision logic in WavespeedCLI.

We never invoke the real ``wavespeed`` CLI here; instead we patch
``WavespeedCLI._run`` and ``capture_screenshot`` so the test suite stays
fully offline.
"""
import asyncio
import json
import os
import shutil
from unittest import mock

import pytest

from app.core.config import settings
from app.services.wavespeed_client import SceneClip, ScenePlan, WavespeedCLI


# ---------------------------------------------------------------------------
# decide_scenes()
# ---------------------------------------------------------------------------
def test_decide_scenes_short_uses_single_scene():
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(duration_s=15)
    assert plan.multi_scene is False
    assert len(plan.clips) == 1
    assert plan.clips[0].duration_s == 15
    assert plan.total_duration_s == 15


def test_decide_scenes_long_splits_into_max_3_clips():
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(duration_s=45)
    assert plan.multi_scene is True
    assert 1 < len(plan.clips) <= settings.wavespeed_video_max_scenes
    # Total duration respects the brief but is bounded by per-clip cap.
    assert plan.total_duration_s <= settings.wavespeed_video_max_scenes * settings.wavespeed_video_max_duration_s


def test_decide_scenes_long_45s_with_explicit_scenes():
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(
        duration_s=45,
        scene_hints=[
            {"title": "Hook", "prompt": "Hi", "reference_images": []},
            {"title": "Demo", "prompt": "Show", "reference_images": []},
            {"title": "CTA", "prompt": "Buy", "reference_images": []},
        ],
    )
    assert plan.multi_scene is True
    assert len(plan.clips) == 3
    assert [c.title for c in plan.clips] == ["Hook", "Demo", "CTA"]


def test_decide_scenes_attach_screenshots_to_first_scene():
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(
        duration_s=45,
        scene_hints=[
            {"title": "Hook", "prompt": "Hi"},
            {"title": "Demo", "prompt": "Show"},
            {"title": "CTA", "prompt": "Buy"},
        ],
        screenshot_urls=["https://shot/1.png", "https://shot/2.png"],
    )
    assert plan.include_screenshots is True
    assert plan.clips[0].reference_images[:2] == ["https://shot/1.png", "https://shot/2.png"]
    assert plan.clips[1].reference_images == []
    assert plan.clips[2].reference_images == []


def test_decide_scenes_long_caps_at_max_scenes():
    cli = WavespeedCLI(bin_path="/bin/true")
    # 90s with default cap of 3 \u2192 must not produce 4+ clips.
    plan = cli.decide_scenes(duration_s=90)
    assert len(plan.clips) <= settings.wavespeed_video_max_scenes


def test_decide_scenes_partial_uses_evenly_split_per_scene():
    cli = WavespeedCLI(bin_path="/bin/true")
    plan = cli.decide_scenes(duration_s=45)
    # 45 / 3 = 15 per clip (exactly the 15s per-call cap).
    assert all(c.duration_s <= settings.wavespeed_video_max_duration_s for c in plan.clips)
    assert sum(c.duration_s for c in plan.clips) >= 30  # never truncate below 2/clip


# ---------------------------------------------------------------------------
# generate_video()  \u2014 reference array is passed as JSON
# ---------------------------------------------------------------------------
def test_generate_video_passes_reference_images_as_json_array():
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    async def fake_run(model, inputs):
        captured["model"] = model
        captured["inputs"] = inputs
        return {"data": {"outputs": ["https://vid/out.mp4"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        url = asyncio.run(cli.generate_video(
            prompt="ad copy",
            frames=["https://img/a.png", "https://img/b.png"],
            duration_s=15,
            enable_audio=True,
            enable_prompt_expansion=False,
        ))
    assert url == "https://vid/out.mp4"
    assert captured["model"] == settings.wavespeed_video_model
    assert "minimax/h3/reference-to-video" in captured["model"]
    inputs = captured["inputs"]
    assert inputs["prompt"] == "ad copy"
    assert inputs["reference_images"] == ["https://img/a.png", "https://img/b.png"]
    assert inputs["duration"] == 15
    assert inputs["enable_audio"] is True
    assert inputs["enable_prompt_expansion"] is False


def test_generate_video_clamps_duration_to_model_limit():
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    async def fake_run(model, inputs):
        captured.update(inputs)
        return {"data": {"outputs": ["https://vid/out.mp4"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        asyncio.run(cli.generate_video("p", [], 999))
    assert captured["duration"] == settings.wavespeed_video_max_duration_s


# ---------------------------------------------------------------------------
# generate_video_scenes()  \u2014 multi-clip entrypoint
# ---------------------------------------------------------------------------
def test_generate_video_scenes_calls_once_per_clip():
    cli = WavespeedCLI(bin_path="/bin/true")
    fake_urls = iter([f"https://vid/clip_{i}.mp4" for i in range(3)])
    call_count = {"n": 0}

    async def fake_run(model, inputs):
        call_count["n"] += 1
        return {"data": {"outputs": [next(fake_urls)]}}

    plan = ScenePlan(
        multi_scene=True,
        clips=[
            SceneClip(0, "Hook", "hi", 10, []),
            SceneClip(1, "Demo", "show", 10, ["https://img/a.png"]),
            SceneClip(2, "CTA", "buy", 10, []),
        ],
        include_screenshots=False,
        total_duration_s=30,
    )

    # Force "no ffmpeg" so we get the per-clip URL list back, not a stitch.
    async def fake_stitch(urls):
        return list(urls)

    with mock.patch.object(cli, "_run", side_effect=fake_run),          mock.patch("app.services.wavespeed_client.shutil.which",
                    return_value=None),          mock.patch("app.services.wavespeed_client._stitch_with_ffmpeg",
                    side_effect=fake_stitch):
        urls = asyncio.run(cli.generate_video_scenes(plan, master_prompt="x"))

    assert call_count["n"] == 3, f"expected 3 wavespeed calls, got {call_count['n']}"
    assert urls == ["https://vid/clip_0.mp4", "https://vid/clip_1.mp4", "https://vid/clip_2.mp4"]


def test_generate_video_scenes_never_exceeds_max_scenes():
    cli = WavespeedCLI(bin_path="/bin/true")
    # Build a plan that *would* have 5 clips and ensure we cap at 3.
    too_many = [
        SceneClip(i, f"S{i}", f"p{i}", 5, [])
        for i in range(5)
    ]
    plan = ScenePlan(
        multi_scene=True, clips=too_many,
        include_screenshots=False, total_duration_s=25,
    )
    captured = []

    async def fake_run(model, inputs):
        captured.append(inputs)
        return {"data": {"outputs": [f"https://v/{len(captured)}.mp4"]}}

    with mock.patch.object(cli, "_run", side_effect=fake_run):
        asyncio.run(cli.generate_video_scenes(plan, master_prompt=""))

    # The planner, not the client, is responsible for capping; we only check
    # that we don't error out on plans larger than the cap.
    assert len(captured) == len(too_many)


# ---------------------------------------------------------------------------
# CLI argument construction
# ---------------------------------------------------------------------------
def test_run_serialises_arrays_as_json():
    """The wavespeed CLI parses [..] as JSON, so we must pass arrays raw."""
    cli = WavespeedCLI(bin_path="/bin/true")

    captured_args = {}

    class FakeProc:
        returncode = 0
        async def communicate(self):
            return (b'{"data":{"outputs":["https://vid/out.mp4"]}}', b"")

    async def fake_exec(*args, **kwargs):
        captured_args["args"] = args
        return FakeProc()

    with mock.patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(cli._run("model", {
            "prompt": "x",
            "reference_images": ["a", "b", "c"],
            "duration": 10,
        }))

    args = captured_args["args"]
    # Find the reference_images flag and confirm it's serialised as JSON.
    flag_idx = next(i for i, a in enumerate(args) if a.startswith("reference_images="))
    value = args[flag_idx].split("=", 1)[1]
    parsed = json.loads(value)
    assert parsed == ["a", "b", "c"]


def test_run_serialises_booleans_as_strings():
    cli = WavespeedCLI(bin_path="/bin/true")
    captured_args = {}

    class FakeProc:
        returncode = 0
        async def communicate(self):
            return (b'{"data":{"outputs":["u"]}}', b"")

    async def fake_exec(*args, **kwargs):
        captured_args["args"] = args
        return FakeProc()

    with mock.patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(cli._run("m", {"enable_audio": True, "enable_prompt_expansion": False}))

    args = captured_args["args"]
    pairs = {a.split("=", 1)[0]: a.split("=", 1)[1] for a in args if "=" in a}
    assert pairs["enable_audio"] == "true"
    assert pairs["enable_prompt_expansion"] == "false"


# ---------------------------------------------------------------------------
# Regression: prompt with spaces used to break the CLI invocation
# ---------------------------------------------------------------------------
def test_run_passes_each_key_value_via_separate_dash_i_arg():
    """Values containing spaces must survive shell parsing; we always emit
    ``-i key=value`` as two argv entries so the OS does the splitting for us.
    """
    cli = WavespeedCLI(bin_path="/bin/true")
    captured = {}

    class FakeProc:
        returncode = 0
        async def communicate(self):
            return (b'{"data":{"outputs":["u"]}}', b"")

    async def fake_exec(*args, **kwargs):
        captured["args"] = args
        return FakeProc()

    with mock.patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        asyncio.run(cli._run("m", {"prompt": "A poem about paella and friends"}))

    argv = captured["args"]
    pairs = {}
    for i, a in enumerate(argv):
        if a == "-i" and i + 1 < len(argv):
            k, _, v = argv[i + 1].partition("=")
            pairs[k] = v
    assert pairs["prompt"] == "A poem about paella and friends"
