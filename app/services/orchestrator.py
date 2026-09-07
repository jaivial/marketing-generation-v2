"""Marketing-campaign orchestrator (v2 - chunked, 9-frame cap, stitched).

Pipeline (single-responsibility, composed of injected collaborators):

  1. SourceReader            -> project context (local files or scraped website)
  2. ChatClient              -> prompt plan + per-frame visual prompts
  3. (optional) screenshot   -> capture web-app screenshots via agent-browser
  4. MediaClient             -> frames (text->image), hard-capped at 9 images
  5. ChatClient              -> a *chunked* script: one VO + shot list per clip
  6. WavespeedCLI            -> N video calls of <= 15s each, then ffmpeg stitch

Orchestrator v2 rules:

* The video model is hard-capped at ``MAX_CLIP_DURATION_S`` (15s) per call, so
  ``duration_s <= 15`` produces a single clip and anything longer is split
  into ``ceil(duration_s / 15)`` chunks (capped at ``MAX_CHUNKS`` = 6 to keep
  cost bounded).
* Every chunk gets its own slice of the generated frames, the same master
  prompt, and the screenshots of the source URL (when applicable).
* Once all chunks succeed they are concatenated into one MP4 with
  ``ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`` (via the existing
  ``wavespeed_client._stitch_with_ffmpeg`` helper). The ``video`` event
  carries the stitched URL plus every per-chunk URL under ``chunks``.
* At most ``MAX_FRAMES`` (9) reference images are generated per campaign.

SSE events emitted:  plan | frame | script | scene | screenshot | video | done | error
"""
from __future__ import annotations
import json
import logging
import math
import re
import shutil
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable

from app.core.config import settings
from app.core.protocols import ChatClient, MediaClient, SourceReader
from app.services import wavespeed_client as _ws
from app.services.credits import (
    InsufficientCreditsError,
    estimate_campaign_cost,
    price_for_user,
    refund_reservation,
    require_credits,
)
from app.services.wavespeed_client import SceneClip, ScenePlan, WavespeedCLI


log = logging.getLogger("marketing.orchestrator")

# ---------------------------------------------------------------------------
# Orchestrator v2 hard limits
# ---------------------------------------------------------------------------
#: The video model (``minimax/h3/reference-to-video``) is hard-capped at 15s
#: per call, so anything longer must be produced as several clips that are
#: stitched together afterwards.
MAX_CLIP_DURATION_S = 15
#: Never fire more than this many wavespeed video calls per campaign (cost).
MAX_CHUNKS = 6
#: Hard cap on generated reference frames per campaign.
MAX_FRAMES = 9


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
    # Billing context. When ``workspace_id`` is None the run is not charged
    # (used by the offline smoke tests and by ad-hoc CLI runs).
    workspace_id: str | None = None
    campaign_id: str | None = None


class Orchestrator:
    """Single-purpose class: orchestrate a campaign. Depends on abstractions only."""

    # The pipeline makes exactly four LLM round-trips: campaign plan, scene
    # decision, frame prompts and the chunked VO script. Used for the estimate.
    N_LLM_CALLS = 4

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
        # Hard cap at 9 frames regardless of duration.
        return max(2, min(MAX_FRAMES, math.ceil(duration_s / 2)))

    @classmethod
    def _n_video_clips(cls, duration_s: int) -> int:
        """Number of wavespeed video calls a duration needs (one per clip).

        Billing view of :meth:`_chunk_plan`: both must agree or the up-front
        reservation would not match what the pipeline actually spends.
        """
        return cls._chunk_plan(duration_s)[0]

    @staticmethod
    def _chunk_plan(duration_s: int) -> tuple[int, int]:
        """Return ``(n_chunks, per_chunk_s)`` for a requested total duration.

        The video model tops out at :data:`MAX_CLIP_DURATION_S` seconds per
        call, so longer ads are split into ``ceil(duration_s / 15)`` clips
        (never more than :data:`MAX_CHUNKS`). ``per_chunk_s`` is clamped to
        ``[2, MAX_CLIP_DURATION_S]`` so every clip is a legal request.
        """
        total = max(1, int(duration_s))
        n_chunks = min(MAX_CHUNKS, max(1, math.ceil(total / MAX_CLIP_DURATION_S)))
        per_chunk_s = max(2, math.ceil(total / n_chunks))
        per_chunk_s = max(2, min(MAX_CLIP_DURATION_S, per_chunk_s))
        return n_chunks, per_chunk_s

    @staticmethod
    def _frames_for_chunk(frames: list[str], idx: int, n_chunks: int) -> list[str]:
        """Even slice of the frame list belonging to chunk ``idx``.

        ``frames[i * N // n : (i + 1) * N // n]`` -- when there are fewer
        frames than chunks the slice can be empty, in which case we fall back
        to the single nearest frame so every clip still gets a reference.
        """
        if not frames or n_chunks <= 0:
            return []
        n_total = len(frames)
        start = idx * n_total // n_chunks
        end = (idx + 1) * n_total // n_chunks
        chunk = frames[start:end]
        if not chunk:
            chunk = [frames[min(n_total - 1, start)]]
        return chunk

    @staticmethod
    def _extract_json(text: str) -> dict:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if not m:
            raise ValueError("model did not return JSON")
        return json.loads(m.group(0))

    # ---------- main pipeline --------------------------------------------------
    async def run(self, req: CampaignRequest) -> AsyncIterator[dict]:
        # ---- budget: reserve credits before touching any paid provider ----
        n_frames = self._n_frames(req.duration_s)
        n_video_clips = self._n_video_clips(req.duration_s)
        budget_usd = estimate_campaign_cost(
            n_frames=n_frames,
            n_video_clips=n_video_clips,
            n_llm_calls=self.N_LLM_CALLS,
        )
        reserved_credits = 0.0
        # Consumption counters, read by the settle/refund paths below.
        frames_done = 0
        clips_done = 0
        llm_calls_done = 0

        if req.workspace_id:
            try:
                balance = require_credits(
                    req.workspace_id, budget_usd, campaign_id=req.campaign_id,
                )
            except InsufficientCreditsError as exc:
                yield {
                    "event": "error",
                    "data": {
                        "message": str(exc),
                        "code": "insufficient_credits",
                        "required_credits": price_for_user(budget_usd),
                        "balance": exc.balance,
                    },
                }
                return
            reserved_credits = price_for_user(budget_usd)
            yield {
                "event": "budget",
                "data": {
                    "base_cost_usd": budget_usd,
                    "reserved_credits": reserved_credits,
                    "balance": balance,
                    "n_frames": n_frames,
                    "n_video_clips": n_video_clips,
                },
            }

        try:
            ctx = await self._ctx(req)

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
            llm_calls_done += 1
            plan = self._extract_json(plan_raw)
            yield {"event": "plan", "data": plan}

            # 2. AI decide scenes & screenshots. The model is told the hard
            #    limits (max 3 scenes, per-call duration cap) and asked to either split
            #    into multiple logical scenes OR keep it as a single coherent
            #    ad. It also decides whether to embed screenshots of the web
            #    app (when the source is a URL).
            scene_decision = await self._plan_scenes(req, ctx, plan)
            llm_calls_done += 1
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
            llm_calls_done += 1
            frames_plan = self._extract_json(frames_raw).get("frames", [])[:n_frames]

            # 5. Render each frame (text\u2192image)
            frame_urls: list[str] = []
            for i, fp in enumerate(frames_plan):
                url = await self._media.generate_image(fp["prompt"])
                frames_done += 1
                frame_urls.append(url)
                yield {"event": "frame", "data": {"i": i, "t": fp.get("t"), "url": url}}

            # 6. Chunked VO script + shot list. The video model is capped at
            #    MAX_CLIP_DURATION_S per call, so we ask the LLM for one
            #    segment per clip whose durations sum to req.duration_s.
            n_chunks, per_chunk_s = self._chunk_plan(req.duration_s)
            segments = await self._chunked_script(
                req, plan, frames_plan, n_chunks, per_chunk_s,
            )
            llm_calls_done += 1
            script = self._script_text(segments)
            yield {
                "event": "script",
                "data": {
                    "script": script,
                    "segments": segments,
                    "n_chunks": n_chunks,
                    "per_chunk_s": per_chunk_s,
                },
            }

            # 7. Generate one clip per chunk and stitch them together.
            master_prompt = (
                f"{plan.get('hook','')}. {plan.get('tagline','')}. "
                f"{script[:400]} Style: {req.style}."
            )

            chunk_urls: list[str] = []
            for i in range(n_chunks):
                seg = segments[i] if i < len(segments) else {}
                hint = scene_hints[i] if i < len(scene_hints) else {}
                # Each clip gets its own slice of frames + the same master
                # prompt + the screenshots of the source URL (when applicable).
                refs = self._frames_for_chunk(frame_urls, i, n_chunks) + screenshot_urls
                prompt = self._chunk_prompt(
                    master_prompt, seg, hint, i, n_chunks, per_chunk_s,
                )
                chunk_urls.append(
                    await self._wavespeed.generate_video(prompt, refs, per_chunk_s)
                )
                clips_done += 1

            video_url, stitched = await self._stitch(chunk_urls)
            yield {
                "event": "video",
                "data": {
                    "url": video_url,
                    "chunks": chunk_urls,
                    "n_chunks": n_chunks,
                    "per_chunk_s": per_chunk_s,
                    "stitched": stitched,
                    # Backwards-compatible aliases for existing clients.
                    "scenes": chunk_urls,
                    "multi_scene": len(chunk_urls) > 1,
                    "include_screenshots": bool(screenshot_urls),
                },
            }

            # ---- settle the bill: charge only what we actually consumed ----
            consumed_usd = estimate_campaign_cost(
                n_frames=frames_done,
                n_video_clips=clips_done,
                n_llm_calls=llm_calls_done,
            )
            consumed_credits = price_for_user(consumed_usd)
            if reserved_credits > 0:
                # Never charge more than we reserved up front.
                consumed_credits = min(consumed_credits, reserved_credits)
            if req.workspace_id and reserved_credits > consumed_credits:
                refund_reservation(
                    req.workspace_id,
                    reserved_credits - consumed_credits,
                    campaign_id=req.campaign_id,
                )
            if req.campaign_id:
                self._mark_campaign_cost(
                    req.campaign_id, consumed_usd, consumed_credits,
                )

            yield {
                "event": "done",
                "data": {
                    "frames": len(frame_urls),
                    "duration_s": req.duration_s,
                    "screenshots": len(screenshot_urls),
                    "chunks": len(chunk_urls),
                    "per_chunk_s": per_chunk_s,
                    "stitched": stitched,
                    "multi_scene": len(chunk_urls) > 1,
                    "cost_usd": consumed_usd,
                    "credits_spent": consumed_credits,
                },
            }
        except Exception as e:  # noqa: BLE001 - surface to client
            # Refund the *unused* portion of the reservation: the full budget
            # minus whatever the pipeline already burned before it blew up.
            refunded = 0.0
            if req.workspace_id and reserved_credits > 0:
                # On a failed run the user only pays for media that actually
                # materialised (frames rendered / clips produced). We absorb
                # the handful of cheap LLM calls ourselves, so a campaign that
                # dies before the first image is fully refunded.
                consumed_usd = estimate_campaign_cost(
                    n_frames=frames_done,
                    n_video_clips=clips_done,
                    n_llm_calls=0,
                )
                unused = reserved_credits - price_for_user(consumed_usd)
                if unused > 0:
                    refund_reservation(
                        req.workspace_id, unused, campaign_id=req.campaign_id,
                    )
                    refunded = round(unused, 2)
            yield {
                "event": "error",
                "data": {"message": str(e), "refunded_credits": refunded},
            }

    # ---------- billing helpers ------------------------------------------------
    @staticmethod
    def _mark_campaign_cost(campaign_id: str, cost_usd: float,
                            credits_spent: float) -> None:
        """Persist the final cost on the campaign row (best-effort)."""
        try:
            from app.services import storage

            storage.set_campaign_status(
                campaign_id, "done",
                total_cost_usd=cost_usd, credits_spent=credits_spent,
            )
        except Exception:  # noqa: BLE001 - billing bookkeeping must never
            # break a successful generation.
            pass

    # ---------- chunked script + stitching ------------------------------------
    async def _chunked_script(
        self,
        req: CampaignRequest,
        plan: dict,
        frames_plan: list[dict],
        n_chunks: int,
        per_chunk_s: int,
    ) -> list[dict[str, Any]]:
        """Ask the LLM for ``n_chunks`` script segments, one per video clip.

        Each segment carries its own voice-over and shot list plus a duration;
        the durations are expected to sum to ``req.duration_s``. Falls back to
        an evenly-split single-VO plan when the model misbehaves so the
        pipeline never dies on a bad JSON reply.
        """
        user = (
            f"Write the shooting script for a {req.duration_s}s {req.style} "
            f"marketing video.\n"
            f"Plan: {json.dumps(plan)}.\n"
            f"Frames: {json.dumps(frames_plan)}.\n\n"
            f"The video model can only render {MAX_CLIP_DURATION_S}s per call, "
            f"so the ad is produced as exactly {n_chunks} segment(s) of about "
            f"{per_chunk_s}s each that will be stitched together in order. "
            f"The segment durations must sum to {req.duration_s}s and no "
            f"single segment may exceed {MAX_CLIP_DURATION_S}s.\n\n"
            f"Return JSON:\n"
            f'{{"segments":[{{"index":0,"title":"<str>","duration_s":'
            f'{per_chunk_s},"vo":"<voice-over for this segment>",'
            f'"shots":["<shot 1>","<shot 2>"]}}]}}\n'
            f"Give exactly {n_chunks} segment(s), in playback order, so that "
            f"the voice-overs read as one continuous script."
        )
        try:
            raw = await self._chat.complete(SYSTEM, user)
        except Exception as e:  # noqa: BLE001
            log.warning("chunked script generation failed: %s", e)
            raw = ""
        segments: list[dict[str, Any]] = []
        try:
            data = self._extract_json(raw)
            raw_segments = data.get("segments") or data.get("chunks") or []
            if isinstance(raw_segments, list):
                for i, seg in enumerate(raw_segments[:n_chunks]):
                    if not isinstance(seg, dict):
                        seg = {"vo": str(seg)}
                    shots = seg.get("shots") or seg.get("shot_list") or []
                    if isinstance(shots, str):
                        shots = [shots]
                    segments.append({
                        "index": i,
                        "title": str(seg.get("title") or f"Segment {i + 1}"),
                        "duration_s": per_chunk_s,
                        "vo": str(seg.get("vo") or seg.get("script") or ""),
                        "shots": [str(s) for s in shots],
                    })
        except Exception:  # noqa: BLE001 — fall through to the fallback below
            segments = []

        # Pad (or build from scratch) so there is always one segment per chunk.
        fallback_vo = (raw or "").strip()
        while len(segments) < n_chunks:
            i = len(segments)
            segments.append({
                "index": i,
                "title": f"Segment {i + 1}",
                "duration_s": per_chunk_s,
                "vo": fallback_vo[:400] if i == 0 else "",
                "shots": [],
            })
        return segments[:n_chunks]

    @staticmethod
    def _script_text(segments: list[dict[str, Any]]) -> str:
        """Flatten the chunked segments back into one human-readable script."""
        parts: list[str] = []
        for seg in segments:
            head = f"[{seg.get('title')} ~{seg.get('duration_s')}s]"
            vo = str(seg.get("vo") or "").strip()
            shots = seg.get("shots") or []
            block = head
            if vo:
                block += f" {vo}"
            if shots:
                block += " Shots: " + "; ".join(str(s) for s in shots)
            parts.append(block.strip())
        return "\n".join(p for p in parts if p)

    @staticmethod
    def _chunk_prompt(
        master_prompt: str,
        segment: dict[str, Any],
        scene_hint: dict[str, Any],
        idx: int,
        n_chunks: int,
        per_chunk_s: int,
    ) -> str:
        """Build the per-clip prompt: master prompt + this segment's beat."""
        bits = [master_prompt]
        if n_chunks > 1:
            bits.append(f"Segment {idx + 1} of {n_chunks} ({per_chunk_s}s).")
        title = str(segment.get("title") or scene_hint.get("title") or "").strip()
        if title:
            bits.append(f"Beat: {title}.")
        vo = str(segment.get("vo") or "").strip()
        if vo:
            bits.append(f"Voice-over: {vo}")
        shots = segment.get("shots") or []
        if shots:
            bits.append("Shots: " + "; ".join(str(s) for s in shots))
        hint_prompt = str(scene_hint.get("prompt") or "").strip()
        if hint_prompt:
            bits.append(hint_prompt)
        return " ".join(b for b in bits if b).strip()

    async def _stitch(self, chunk_urls: list[str]) -> tuple[str, bool]:
        """Concatenate the per-chunk clips into one MP4 with ffmpeg.

        Returns ``(url, stitched)``. When there is a single clip - or ffmpeg
        is unavailable - the first clip URL is returned untouched so the
        pipeline degrades gracefully instead of failing.
        """
        if not chunk_urls:
            return "", False
        if len(chunk_urls) == 1:
            return chunk_urls[0], False
        if not shutil.which("ffmpeg"):
            log.warning("ffmpeg not found - returning first clip unstitched")
            return chunk_urls[0], False
        try:
            stitched = await _ws._stitch_with_ffmpeg(chunk_urls)
        except Exception as e:  # noqa: BLE001
            log.warning("ffmpeg stitching failed: %s", e)
            return chunk_urls[0], False
        return (stitched or chunk_urls[0]), bool(stitched)

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
