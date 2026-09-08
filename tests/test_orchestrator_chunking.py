"""Orchestrator v2: 15s chunking, 9-frame cap and ffmpeg stitching.

Everything external (MiniMax chat, wavespeed CLI, agent-browser, ffmpeg) is
mocked so the suite stays fully offline.
"""
import asyncio
import json
import shutil
from unittest import mock

import pytest

from app.services import orchestrator as orch_mod
from app.services import wavespeed_client as ws_mod
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services.orchestrator import (
    MAX_CHUNKS,
    MAX_CLIP_DURATION_S,
    MAX_FRAMES,
    CampaignRequest,
    Orchestrator,
)
from app.services.wavespeed_client import WavespeedCLI


# ---------------------------------------------------------------------------
# fakes
# ---------------------------------------------------------------------------
class FakeChat(ChatClient):
    """Deterministic LLM. ``n_frame_prompts`` lets tests over-produce frames."""

    def __init__(self, n_frame_prompts: int = 12, n_segments: int = 6) -> None:
        self.n_frame_prompts = n_frame_prompts
        self.n_segments = n_segments
        self.frame_requests: list[str] = []

    async def complete(self, system, user):
        u = user.lower()
        if "segments" in u:
            return json.dumps({"segments": [
                {"index": i, "title": f"Beat {i}", "duration_s": 15,
                 "vo": f"line {i}", "shots": [f"shot {i}"]}
                for i in range(self.n_segments)
            ]})
        if "visual prompts" in u:
            self.frame_requests.append(user)
            return json.dumps({"frames": [
                {"t": i * 2, "prompt": f"frame {i}"}
                for i in range(self.n_frame_prompts)
            ]})
        if "decide the video generation strategy" in u:
            return json.dumps({
                "multi_scene": False,
                "include_screenshots": False,
                "rationale": "test",
                "scenes": [{"title": "Ad", "prompt": ""}],
            })
        if "json with keys" in u:
            return json.dumps({
                "hook": "Hi", "tagline": "Fast", "cta": "Try",
                "audience": "devs", "tone": "witty",
            })
        return "script"

    async def stream(self, system, user):
        yield await self.complete(system, user)


class FakeMedia(MediaClient):
    async def generate_image(self, prompt):
        return f"https://img/{prompt.replace(' ', '_')}.png"

    async def generate_video(self, prompt, frames, duration_s):
        return "https://vid/unused.mp4"


class RecordingWavespeed(WavespeedCLI):
    def __init__(self) -> None:
        super().__init__(bin_path="/bin/true")
        self.video_calls: list[dict] = []

    async def capture_screenshot(self, *a, **kw):  # type: ignore[override]
        return "https://shot/fake.png"

    async def generate_video(self, prompt, frames, duration_s, **kw):  # type: ignore[override]
        self.video_calls.append(
            {"prompt": prompt, "frames": list(frames), "duration_s": duration_s}
        )
        return f"https://vid/chunk_{len(self.video_calls) - 1}.mp4"


def factory(kind, target, username=None, password=None):
    class R(SourceReader):
        async def read(self, t):
            return "ctx"
    return R()


def run_campaign(duration_s: int, *, chat=None, ws=None, stitch=None):
    """Run the orchestrator offline and return (events, wavespeed, stitch_mock)."""
    chat = chat or FakeChat()
    ws = ws or RecordingWavespeed()
    stitch = stitch or mock.AsyncMock(return_value="/tmp/final.mp4")
    orch = Orchestrator(chat, FakeMedia(), factory, wavespeed=ws)
    events: list[dict] = []

    async def go():
        async for ev in orch.run(CampaignRequest(
            source_kind="url", target="https://example.com", duration_s=duration_s,
        )):
            events.append(ev)

    with mock.patch.object(ws_mod, "_stitch_with_ffmpeg", new=stitch):
        asyncio.run(go())
    assert "error" not in [e["event"] for e in events], events
    return events, ws, stitch


def _video(events):
    return [e for e in events if e["event"] == "video"][0]["data"]


# ---------------------------------------------------------------------------
# chunk maths
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("duration,expected", [
    (2, 1), (10, 1), (15, 1), (16, 2), (30, 2), (45, 3), (60, 4), (90, 6),
    (300, MAX_CHUNKS),
])
def test_chunk_plan_counts(duration, expected):
    n_chunks, per_chunk_s = Orchestrator._chunk_plan(duration)
    assert n_chunks == expected
    assert 2 <= per_chunk_s <= MAX_CLIP_DURATION_S


# ---------------------------------------------------------------------------
# the four required tests
# ---------------------------------------------------------------------------
def test_short_ad_uses_single_clip():
    events, ws, stitch = run_campaign(10)
    data = _video(events)
    assert len(ws.video_calls) == 1
    assert len(data["chunks"]) == 1
    assert data["url"] == "https://vid/chunk_0.mp4"
    assert data["stitched"] is False
    assert ws.video_calls[0]["duration_s"] == 10
    # Nothing to concatenate for a single clip.
    stitch.assert_not_awaited()


def test_45s_ad_splits_into_3_clips():
    events, ws, _stitch = run_campaign(45)
    data = _video(events)
    assert len(ws.video_calls) == 3
    assert len(data["chunks"]) == 3
    assert data["n_chunks"] == 3
    assert all(c["duration_s"] == 15 for c in ws.video_calls)
    assert sum(c["duration_s"] for c in ws.video_calls) == 45
    # Each clip receives its own (non-empty) slice of frames.
    assert all(c["frames"] for c in ws.video_calls)
    assert ws.video_calls[0]["frames"] != ws.video_calls[-1]["frames"]


def test_caps_at_9_frames():
    assert Orchestrator._n_frames(60) == MAX_FRAMES == 9
    assert Orchestrator._n_frames(600) == 9
    assert Orchestrator._n_frames(2) == 2
    # ...and the pipeline truncates an over-eager LLM to 9 frame prompts.
    chat = FakeChat(n_frame_prompts=30)
    events, _ws, _stitch = run_campaign(60, chat=chat)
    frames = [e for e in events if e["event"] == "frame"]
    assert len(frames) == 9
    done = [e for e in events if e["event"] == "done"][0]["data"]
    assert done["frames"] == 9


def test_stitches_when_ffmpeg_present(monkeypatch):
    real_which = shutil.which
    monkeypatch.setattr(
        orch_mod.shutil, "which",
        lambda name, *a, **kw: "/usr/bin/ffmpeg" if name == "ffmpeg" else real_which(name),
    )
    stitch = mock.AsyncMock(return_value="/tmp/stitched.mp4")
    events, ws, stitch = run_campaign(45, stitch=stitch)
    data = _video(events)
    stitch.assert_awaited_once()
    assert list(stitch.await_args.args[0]) == data["chunks"]
    assert data["url"] == "/tmp/stitched.mp4"
    assert data["stitched"] is True


def test_falls_back_to_first_clip_without_ffmpeg(monkeypatch):
    monkeypatch.setattr(orch_mod.shutil, "which", lambda name, *a, **kw: None)
    events, ws, stitch = run_campaign(45)
    data = _video(events)
    stitch.assert_not_awaited()
    assert data["stitched"] is False
    assert data["url"] == data["chunks"][0]
    assert len(data["chunks"]) == 3


def test_chunk_prompt_carries_master_prompt_and_segment():
    events, ws, _s = run_campaign(45)
    prompts = [c["prompt"] for c in ws.video_calls]
    # The same master prompt (hook + tagline) is present in every chunk...
    assert all("Hi. Fast." in p for p in prompts)
    # ...plus the segment-specific voice-over.
    assert "line 0" in prompts[0]
    assert "line 2" in prompts[2]
    assert "Segment 1 of 3" in prompts[0]


def test_screenshots_attached_to_every_chunk():
    chat = FakeChat()

    async def complete(system, user):
        u = user.lower()
        if "decide the video generation strategy" in u:
            return json.dumps({
                "multi_scene": False,
                "include_screenshots": True,
                "rationale": "saas ui",
                "scenes": [{"title": "Ad", "prompt": ""}],
                "screenshot_pages": ["https://example.com"],
            })
        return await FakeChat.complete(chat, system, user)

    chat.complete = complete  # type: ignore[method-assign]
    events, ws, _s = run_campaign(30, chat=chat)
    assert [e["event"] for e in events].count("screenshot") == 1
    assert all("https://shot/fake.png" in c["frames"] for c in ws.video_calls)


def test_frames_for_chunk_slices_evenly():
    frames = [f"f{i}" for i in range(9)]
    slices = [Orchestrator._frames_for_chunk(frames, i, 3) for i in range(3)]
    assert slices == [["f0", "f1", "f2"], ["f3", "f4", "f5"], ["f6", "f7", "f8"]]
    # No frames at all -> no references.
    assert Orchestrator._frames_for_chunk([], 0, 3) == []
    # Fewer frames than chunks -> every chunk still gets one reference.
    tiny = Orchestrator._frames_for_chunk(["a", "b"], 2, 4)
    assert len(tiny) == 1


def test_script_event_reports_segments():
    events, _ws, _s = run_campaign(45)
    script = [e for e in events if e["event"] == "script"][0]["data"]
    assert script["n_chunks"] == 3
    assert script["per_chunk_s"] == 15
    assert len(script["segments"]) == 3
    assert "line 0" in script["script"]


def test_bad_llm_script_json_falls_back_to_padded_segments():
    class BadChat(FakeChat):
        async def complete(self, system, user):
            if "segments" in user.lower():
                return "not json at all"
            return await super().complete(system, user)

    events, ws, _s = run_campaign(45, chat=BadChat())
    assert len(ws.video_calls) == 3
    script = [e for e in events if e["event"] == "script"][0]["data"]
    assert len(script["segments"]) == 3
