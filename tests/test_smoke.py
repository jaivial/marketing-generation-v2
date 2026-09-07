"""Offline smoke test \u2014 no network needed. Mocks every external dependency."""
import asyncio, json
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services.orchestrator import Orchestrator, CampaignRequest
from app.services.wavespeed_client import WavespeedCLI


class FakeChat(ChatClient):
    async def complete(self, system, user):
        u = user.lower()
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
        return "https://vid/out.mp4"

    async def generate_video_scenes(self, plan, master_prompt="", **kwargs):  # type: ignore[override]
        self.scene_calls.append({"plan": plan, "master_prompt": master_prompt, **kwargs})
        return [f"https://vid/clip_{c.index}.mp4" for c in plan.clips]


def factory(kind, target, username=None, password=None):
    class R(SourceReader):
        async def read(self, t): return "ctx"
    return R()


def test_pipeline():
    orch = Orchestrator(FakeChat(), FakeMedia(), factory, wavespeed=FakeWavespeed())
    events = []
    async def go():
        async for ev in orch.run(CampaignRequest(source_kind="url", target="x", duration_s=30)):
            events.append(ev)
    asyncio.run(go())
    kinds = [e["event"] for e in events]
    assert "error" not in kinds, kinds
    assert kinds == ["plan", "scene", "frame", "frame", "script", "video", "done"], kinds


def test_pipeline_with_credentials():
    """Make sure credentials are accepted and don't break the pipeline."""
    orch = Orchestrator(FakeChat(), FakeMedia(), factory, wavespeed=FakeWavespeed())
    events = []
    async def go():
        async for ev in orch.run(CampaignRequest(
            source_kind="url", target="https://private.example.com",
            duration_s=15, username="alice", password="secret123",
        )):
            events.append(ev)
    asyncio.run(go())
    kinds = [e["event"] for e in events]
    assert "error" not in kinds, kinds
    assert kinds[-1] == "done"
