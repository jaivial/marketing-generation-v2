"""Offline smoke test — no network needed. Mocks every external dependency."""
import asyncio, json
from unittest import mock

from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services.orchestrator import Orchestrator, CampaignRequest
from app.services.wavespeed_client import WavespeedCLI


class FakeChat(ChatClient):
    async def complete(self, system, user):
        u = user.lower()
        if "segments" in u:
            # Orchestrator v2 asks for a chunked VO script: one segment per
            # 15s clip, each with its own voice-over + shot list.
            return json.dumps({"segments": [
                {"index": 0, "title": "Hook", "duration_s": 15,
                 "vo": "Meet the tool.", "shots": ["wide shot"]},
                {"index": 1, "title": "CTA", "duration_s": 15,
                 "vo": "Try it today.", "shots": ["logo card"]},
            ]})
        if "frames" in u or "visual prompts" in u:
            return json.dumps({"frames": [{"t": 0, "prompt": "open"}, {"t": 30, "prompt": "close"}]})
        if "decide the video generation strategy" in u or "multi_scene" in u:
            return json.dumps({
                "multi_scene": False,
                "include_screenshots": False,
                "rationale": "fallback",
                "scenes": [{"title": "Ad", "prompt": ""}],
            })
        if "JSON with keys" in user:
            return json.dumps({"hook": "Hi", "tagline": "Fast", "cta": "Try", "audience": "devs", "tone": "witty"})
        return "A short script."
    async def stream(self, system, user):
        for w in (await self.complete(system, user)).split():
            yield w


class FakeMedia(MediaClient):
    async def generate_image(self, prompt): return f"https://img/{prompt}.png"
    async def generate_video(self, prompt, frames, duration_s): return "https://vid/out.mp4"


class FakeWavespeed(WavespeedCLI):
    """Mock that records calls but never invokes the real CLI."""
    def __init__(self):
        super().__init__(bin_path="/bin/true")
        self.video_calls: list[dict] = []
        self.scene_calls: list[dict] = []

    async def capture_screenshot(self, *args, **kwargs):  # type: ignore[override]
        return "https://shot/fake.png"

    async def generate_video(self, prompt, frames, duration_s, **kwargs):  # type: ignore[override]
        self.video_calls.append({
            "prompt": prompt, "frames": frames, "duration_s": duration_s, **kwargs,
        })
        return f"https://vid/out_{len(self.video_calls)}.mp4"

    async def generate_video_scenes(self, plan, master_prompt="", **kwargs):  # type: ignore[override]
        self.scene_calls.append({"plan": plan, "master_prompt": master_prompt, **kwargs})
        return [f"https://vid/clip_{c.index}.mp4" for c in plan.clips]


def factory(kind, target, username=None, password=None):
    class R(SourceReader):
        async def read(self, t): return "ctx"
    return R()


def _run(orch, req):
    """Drive the orchestrator with ffmpeg stitching stubbed out."""
    events: list[dict] = []

    async def go():
        async for ev in orch.run(req):
            events.append(ev)

    with mock.patch("app.services.wavespeed_client._stitch_with_ffmpeg",
                    new=mock.AsyncMock(return_value="https://vid/stitched.mp4")):
        asyncio.run(go())
    return events


def test_pipeline():
    orch = Orchestrator(FakeChat(), FakeMedia(), factory, wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(source_kind="url", target="x", duration_s=30))
    kinds = [e["event"] for e in events]
    assert "error" not in kinds, kinds
    assert kinds == ["plan", "scene", "frame", "frame", "script", "video", "done"], kinds


def test_pipeline_with_credentials():
    """Make sure credentials are accepted and don't break the pipeline."""
    orch = Orchestrator(FakeChat(), FakeMedia(), factory, wavespeed=FakeWavespeed())
    events = _run(orch, CampaignRequest(
        source_kind="url", target="https://private.example.com",
        duration_s=15, username="alice", password="secret123",
    ))
    kinds = [e["event"] for e in events]
    assert "error" not in kinds, kinds
    assert kinds[-1] == "done"


def test_video_event_exposes_chunks():
    """A 30s ad is produced as two 15s clips and reported in `chunks`."""
    ws = FakeWavespeed()
    orch = Orchestrator(FakeChat(), FakeMedia(), factory, wavespeed=ws)
    events = _run(orch, CampaignRequest(source_kind="url", target="x", duration_s=30))
    video = [e for e in events if e["event"] == "video"][0]
    assert len(ws.video_calls) == 2
    assert len(video["data"]["chunks"]) == 2
    assert all(c["duration_s"] == 15 for c in ws.video_calls)
