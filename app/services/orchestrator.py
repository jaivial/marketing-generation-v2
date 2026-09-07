"""Marketing-campaign orchestrator.

Pipeline (single-responsibility, composed of injected collaborators):

  1. SourceReader            \u2192 project context (local files or scraped website)
  2. ChatClient              \u2192 prompt plan + per-scene visual prompts + script
  3. (optional) screenshot   \u2192 capture web-app screenshots via agent-browser
  4. MediaClient             \u2192 frames (text\u2192image)
  5. WavespeedCLI            \u2192 decide single-scene vs multi-scene (max 3) and
                              generate the final video clip(s).

SSE events emitted:  plan | frame | script | scene | screenshot | video | done | error
"""
from __future__ import annotations
import json
import math
import re
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable

from app.core.config import settings
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services.wavespeed_client import SceneClip, ScenePlan, WavespeedCLI


SYSTEM = (
    "You are a senior marketing director. Produce concise, conversion-oriented "
    "copy. When asked for JSON, reply with ONLY valid JSON \u2014 no prose."
)


@dataclass(frozen=True)
class CampaignRequest:
    source_kind: str          # "files" | "url"
    target: str               # path or URL
    duration_s: int = 30      # 15 | 30 | 45
    style: str = "cinematic"
    username: str | None = None
    password: str | None = None
    # When True the orchestrator is allowed to capture screenshots of the
    # source URL via agent-browser and feed them to the video model. Default
    # is True because the AI decides for each campaign.
    allow_screenshots: bool = True


class Orchestrator:
    """Single-purpose class: orchestrate a campaign. Depends on abstractions only."""

    def __init__(
        self,
        chat: ChatClient,
        media: MediaClient,
        reader_factory: Callable[..., SourceReader],
        wavespeed: WavespeedCLI | None = None,
    ) -> None:
        self._chat = chat
        self._media = media
        self._reader_factory = reader_factory
        # The wavespeed client exposes the smart single-vs-multi decision and
        # the screenshot helper. We accept an override for tests.
        self._wavespeed = wavespeed or (
            media if isinstance(media, WavespeedCLI) else WavespeedCLI()
        )

    # ---------- step helpers --------------------------------------------------
    async def _ctx(self, req: CampaignRequest) -> str:
        reader = self._reader_factory(
            req.source_kind,
            req.target,
            username=req.username,
            password=req.password,
        )
        return await reader.read(req.target)

    @staticmethod
    def _n_frames(duration_s: int) -> int:
        # max 1 frame per 2 seconds \u2014 minimum 2 so the video has a beginning/end.
        return max(2, math.ceil(duration_s / 2))

    @staticmethod
    def _extract_json(text: str) -> dict:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if not m:
            raise ValueError("model did not return JSON")
        return json.loads(m.group(0))

    # ---------- main pipeline --------------------------------------------------
    async def run(self, req: CampaignRequest) -> AsyncIterator[dict]:
        try:
            ctx = await self._ctx(req)
            n_frames = self._n_frames(req.duration_s)

            # 1. Campaign plan
            plan_raw = await self._chat.complete(
                SYSTEM,
                (
                    f"Project context:\n{ctx[:6000]}\n\n"
                    f"Return JSON with keys: hook (str<=12w), tagline (str<=8w), "
                    f"cta (str<=5w), audience (str), tone (str). "
                    f"Style: {req.style}. Duration: {req.duration_s}s."
                ),
            )
            plan = self._extract_json(plan_raw)
            yield {"event": "plan", "data": plan}

            # 2. AI decide scenes & screenshots. The model is told the hard
            #    limits (max 3 scenes, 30s/clip) and asked to either split
            #    into multiple logical scenes OR keep it as a single coherent
            #    ad. It also decides whether to embed screenshots of the web
            #    app (when the source is a URL).
            scene_decision = await self._plan_scenes(req, ctx, plan)
            include_screenshots = bool(
                scene_decision.get("include_screenshots")
                and req.allow_screenshots
                and req.source_kind == "url"
            )
            use_multi_scene = bool(scene_decision.get("multi_scene"))
            scene_hints = scene_decision.get("scenes") or []
            yield {
                "event": "scene",
                "data": {
                    "multi_scene": use_multi_scene,
                    "include_screenshots": include_screenshots,
                    "scenes": [
                        {"title": s.get("title"), "prompt": s.get("prompt")}
                        for s in scene_hints
                    ],
                    "rationale": scene_decision.get("rationale", ""),
                },
            }

            # 3. Capture screenshots (if any). Each screenshot is uploaded to
            #    Wavespeed's CDN so the model can fetch it as a reference.
            screenshot_urls: list[str] = []
            if include_screenshots:
                try:
                    urls_to_capture = scene_decision.get("screenshot_pages") or [req.target]
                    for page_url in urls_to_capture[:5]:
                        url = await self._wavespeed.capture_screenshot(
                            page_url,
                            username=req.username,
                            password=req.password,
                        )
                        screenshot_urls.append(url)
                        yield {"event": "screenshot", "data": {"url": url, "page": page_url}}
                except Exception as e:  # noqa: BLE001 \u2014 fall back to no screenshots
                    log_msg = f"screenshot capture failed: {e}"
                    yield {"event": "screenshot", "data": {"error": log_msg}}

            # 4. Frame visual prompts (one per frame)
            frames_raw = await self._chat.complete(
                SYSTEM,
                (
                    f"Generate {n_frames} sequential visual prompts for a "
                    f"{req.duration_s}s {req.style} marketing video.\n"
                    f"Campaign: {json.dumps(plan)}.\n"
                    f"Return JSON: {{\"frames\":[{{\"t\":<sec>,\"prompt\":<str>}}...]}}"
                ),
            )
            frames_plan = self._extract_json(frames_raw).get("frames", [])[:n_frames]

            # 5. Render each frame (text\u2192image)
            frame_urls: list[str] = []
            for i, fp in enumerate(frames_plan):
                url = await self._media.generate_image(fp["prompt"])
                frame_urls.append(url)
                yield {"event": "frame", "data": {"i": i, "t": fp.get("t"), "url": url}}

            # 6. Final high-quality video prompt/script
            script = await self._chat.complete(
                SYSTEM,
                (
                    f"Write a 3-sentence VO script + shot list for a {req.duration_s}s "
                    f"video. Plan: {json.dumps(plan)}. Frames: {json.dumps(frames_plan)}."
                ),
            )
            yield {"event": "script", "data": {"script": script}}

            # 7. Decide the actual generation strategy and dispatch the video.
            master_prompt = (
                f"{plan.get('hook','')}. {plan.get('tagline','')}. "
                f"{script[:400]} Style: {req.style}."
            )

            if use_multi_scene and scene_hints:
                plan_obj = self._wavespeed.decide_scenes(
                    duration_s=req.duration_s,
                    scene_hints=[
                        {
                            "title": s.get("title") or f"Scene {i + 1}",
                            "prompt": s.get("prompt") or master_prompt,
                            # Spread the frame references across scenes so each
                            # scene gets its own visual cues.
                            "reference_images": self._refs_for_scene(
                                frame_urls, i, len(scene_hints),
                            ) + (screenshot_urls if i == 0 else []),
                        }
                        for i, s in enumerate(scene_hints)
                    ],
                    screenshot_urls=[],  # already merged above
                )
                clip_urls = await self._wavespeed.generate_video_scenes(
                    plan_obj, master_prompt=master_prompt,
                )
                video_url = clip_urls[0] if clip_urls else ""
                yield {
                    "event": "video",
                    "data": {
                        "url": video_url,
                        "scenes": clip_urls,
                        "multi_scene": True,
                        "rationale": plan_obj.rationale,
                    },
                }
            else:
                # Single-scene: include every frame plus any screenshots as
                # references to the reference-to-video model.
                refs = list(frame_urls) + screenshot_urls
                video_url = await self._wavespeed.generate_video(
                    master_prompt, refs, req.duration_s,
                )
                yield {
                    "event": "video",
                    "data": {
                        "url": video_url,
                        "multi_scene": False,
                        "include_screenshots": bool(screenshot_urls),
                    },
                }

            yield {
                "event": "done",
                "data": {
                    "frames": len(frame_urls),
                    "duration_s": req.duration_s,
                    "screenshots": len(screenshot_urls),
                    "multi_scene": use_multi_scene and bool(scene_hints),
                },
            }
        except Exception as e:  # noqa: BLE001 \u2014 surface to client
            yield {"event": "error", "data": {"message": str(e)}}

    # ---------- planning -------------------------------------------------------
    async def _plan_scenes(
        self, req: CampaignRequest, ctx: str, plan: dict,
    ) -> dict[str, Any]:
        """Ask the LLM whether to split the ad into multiple scenes and
        whether to include screenshots of the source URL."""
        max_scenes = settings.wavespeed_video_max_scenes
        max_dur = settings.wavespeed_video_max_duration_s
        user = (
            f"Project context:\n{ctx[:4000]}\n\n"
            f"Campaign plan: {json.dumps(plan)}.\n"
            f"Requested total duration: {req.duration_s}s.\n"
            f"Style: {req.style}.\n"
            f"Source kind: {req.source_kind}.\n\n"
            f"Decide the video generation strategy. The video model is "
            f"`alibaba/wan-3.0/reference-to-video` \u2014 it produces a coherent "
            f"clip of at most {max_dur}s. There are two valid strategies:\n"
            f"  A. SINGLE SCENE: one wavespeed call with all reference images "
            f"(subjects, brand assets, optional web app screenshots). Use this "
            f"when the ad tells one continuous story.\n"
            f"  B. MULTI-SCENE: up to {max_scenes} separate wavespeed calls, "
            f"each one logical scene of the ad. Use this when the ad has "
            f"distinct beats (hook \u2192 product \u2192 testimonial \u2192 CTA), or when "
            f"the requested total duration ({req.duration_s}s) exceeds "
            f"{max_dur}s. Each scene gets its own prompt and reference images.\n\n"
            f"ALSO decide: should the ad include screenshots of the source web "
            f"app? Only relevant when source_kind=url. Set include_screenshots "
            f"to true if showing the product's UI helps sell it (e.g. SaaS, "
            f"app, dashboard).\n\n"
            f"Return JSON with:\n"
            f"{{\n"
            f"  \"multi_scene\": <bool>,\n"
            f"  \"include_screenshots\": <bool>,\n"
            f"  \"rationale\": \"<one-sentence reason>\",\n"
            f"  \"scenes\": [\n"
            f"    {{\"title\": \"Hook\", \"prompt\": \"<scene-specific prompt>\"}},\n"
            f"    {{\"title\": \"Product\", \"prompt\": \"...\"}}\n"
            f"  ],\n"
            f"  \"screenshot_pages\": [\"<url>\"]  // optional list, max 3\n"
            f"}}\n"
            f"If multi_scene is false, return one scene with title='Ad'."
        )
        try:
            out = await self._chat.complete(SYSTEM, user)
            data = self._extract_json(out)
            if not isinstance(data.get("scenes"), list) or not data["scenes"]:
                data["scenes"] = [{"title": "Ad", "prompt": ""}]
            data["scenes"] = data["scenes"][:max_scenes]
            return data
        except Exception:
            # Fail open: single-scene, no screenshots.
            return {
                "multi_scene": False,
                "include_screenshots": False,
                "rationale": "scene planner fallback",
                "scenes": [{"title": "Ad", "prompt": ""}],
                "screenshot_pages": [],
            }

    @staticmethod
    def _refs_for_scene(frames: list[str], idx: int, total: int) -> list[str]:
        """Distribute the frame URLs across scenes so each scene has visual
        references that match its slice of the ad."""
        if not frames or total <= 0:
            return []
        n = len(frames)
        # even slice by integer index
        size = max(1, math.ceil(n / total))
        start = idx * size
        end = min(n, start + size)
        if idx == total - 1:
            # ensure the final scene always reaches the last frame
            start = min(start, max(0, n - size))
            end = n
        return frames[start:end]
