"""Wavespeed CLI wrapper \u2014 minimal interface to video & image models.

Targets the reference-to-video model
(https://wavespeed.ai/models/alibaba/wan-3.0/reference-to-video). That model
accepts up to 10 reference images and produces a coherent 2\u201330s clip with
optional audio, which is exactly what a marketing ad needs.

Two generation modes are exposed so the orchestrator (or any higher-level
client SDK) can pick whichever fits the brief:

* :meth:`WavespeedCLI.generate_video` \u2014 **single-scene** mode. One call to
  the CLI with every reference image (subjects, brand assets, screenshots)
  passed in together. Cheap, coherent, but capped at 30s.
* :meth:`WavespeedCLI.generate_video_scenes` \u2014 **multi-scene** mode. Splits
  the requested total duration across up to ``settings.wavespeed_video_max_scenes``
  separate clips (3 by default), one per logical scene, and **stitches them
  together** with ffmpeg if available. This is how we cover 30-90s ads while
  respecting the model's hard 30s-per-call ceiling.

Either mode can include web-app screenshots captured by the local
``agent-browser`` CLI \u2014 :meth:`capture_screenshot` uploads the local file
to Wavespeed's CDN and returns the hosted URL the model accepts.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import shlex
import shutil
import tempfile
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.core.config import settings
from app.core.protocols import MediaClient


log = logging.getLogger("marketing.wavespeed")


# ---------------------------------------------------------------------------
# Smart scene plan (decides single-vs-multi)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SceneClip:
    """One logical scene in the final ad."""
    index: int
    title: str
    prompt: str
    duration_s: int
    reference_images: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ScenePlan:
    """Result of :meth:`WavespeedCLI.decide_scenes`.

    ``multi_scene`` is True iff the brief should be split into multiple clips
    (e.g. \u226530s total duration or the AI explicitly chose scenes). The
    ``clips`` list always contains at least one entry; ``total_duration_s`` is
    the sum of every clip duration.
    """
    multi_scene: bool
    clips: list[SceneClip]
    include_screenshots: bool
    total_duration_s: int
    rationale: str = ""


class WavespeedCLI:
    """Thin wrapper around the local ``wavespeed`` CLI.

    Open/Closed: each model is a single Settings constant; new models only
    require a config change \u2014 no edits to call sites.
    """

    def __init__(self, bin_path: str | None = None) -> None:
        self._bin = bin_path or shutil.which("wavespeed") or "wavespeed"

    # ---- low-level CLI invocation -------------------------------------------------
    async def _run(self, model: str, inputs: dict[str, Any]) -> dict[str, Any]:
        """Invoke ``wavespeed run <model> --json`` with ``inputs`` as k=v pairs.

        We use the canonical ``-i key=value`` form so values containing
        whitespace (e.g. the prompt) survive shell parsing intact. Arrays
        are serialised to JSON so the CLI's ``coerce()`` helper parses
        them into a real list.
        """
        args = [self._bin, "run", model, "--json"]
        for k, v in inputs.items():
            if v is None:
                continue
            if isinstance(v, (list, tuple)):
                # The CLI parses anything starting with '[' or '{' as JSON.
                args += ["-i", f"{k}={json.dumps(list(v))}"]
            elif isinstance(v, bool):
                args += ["-i", f"{k}={'true' if v else 'false'}"]
            else:
                args += ["-i", f"{k}={v}"]
        log.debug("wavespeed CLI: %s", " ".join(shlex.quote(a) for a in args))
        proc = await asyncio.create_subprocess_exec(
            *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"wavespeed failed (rc={proc.returncode}): {err.decode(errors='ignore')[:1000]}"
            )
        text = out.decode(errors="ignore").strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"url": text}

    # ---- reference helpers --------------------------------------------------------
    async def capture_screenshot(
        self, url: str, *, username: str | None = None, password: str | None = None,
        viewport: str = "1440x900", full_page: bool = True,
        remote: bool = True, timeout_s: int = 60,
    ) -> str:
        """Capture a screenshot of a web page via the local ``agent-browser``
        CLI and (optionally) upload it to Wavespeed's CDN.

        Returns the URL the model can fetch. ``remote=False`` skips the upload
        step and returns a ``file://`` URL, which the model rejects \u2014 only
        used in tests.
        """
        bin_path = shutil.which("agent-browser") or settings.agent_browser_bin

        # agent-browser handles login-gated pages with `set credentials`.
        if username and password:
            await _run_cli(bin_path, "set", "credentials", username, password, timeout=15)

        tmpdir = tempfile.mkdtemp(prefix="mkt-shot-")
        out_path = os.path.join(tmpdir, "shot.png")
        cmd = [
            bin_path, "screenshot", url,
            "--viewport", viewport,
            "--output", out_path,
        ]
        if full_page:
            cmd.append("--full-page")
        rc, _stdout, stderr = await _run_cli_raw(cmd, timeout=timeout_s)
        if rc != 0 or not os.path.exists(out_path):
            raise RuntimeError(
                f"agent-browser screenshot failed for {url}: {stderr.decode(errors='ignore')[:500]}"
            )

        if not remote:
            return f"file://{out_path}"

        # Upload to Wavespeed so the model can fetch the file via HTTP/HTTPS.
        proc = await asyncio.create_subprocess_exec(
            self._bin, "upload", out_path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        out, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"wavespeed upload failed: {err.decode(errors='ignore')[:500]}"
            )
        hosted = out.decode(errors="ignore").strip().splitlines()[-1].strip()
        return hosted

    # ---- smart scene decision -----------------------------------------------------
    def decide_scenes(
        self,
        *,
        duration_s: int,
        scene_hints: list[dict[str, Any]] | None = None,
        screenshot_urls: list[str] | None = None,
    ) -> ScenePlan:
        """Decide between single-scene and multi-scene generation.

        Rules (applied in order):

        1. If the brief explicitly lists N scenes (``scene_hints``), use them
           \u2014 one clip per scene, each capped at ``max_duration_s``.
        2. Otherwise, if ``duration_s <= max_duration_s``, do a single-scene
           clip and use *every* reference image together.
        3. Otherwise (e.g. 45s brief with no explicit scenes), split the total
           duration evenly across up to ``max_scenes`` clips.

        Screenshots are appended to the *first* scene so they appear early in
        the ad (highest impact position).
        """
        max_dur = settings.wavespeed_video_max_duration_s
        max_scenes = max(1, settings.wavespeed_video_max_scenes)
        screenshots = list(screenshot_urls or [])

        # 1) Explicit scene hints from the planner.
        if scene_hints:
            hints = scene_hints[:max_scenes]
            per = max(2, min(max_dur, max(2, duration_s // len(hints))))
            clips: list[SceneClip] = []
            for i, h in enumerate(hints):
                refs = list(h.get("reference_images") or [])
                if i == 0 and screenshots:
                    refs = screenshots + refs
                clips.append(SceneClip(
                    index=i,
                    title=str(h.get("title") or f"Scene {i + 1}"),
                    prompt=str(h.get("prompt") or ""),
                    duration_s=per,
                    reference_images=refs,
                ))
            return ScenePlan(
                multi_scene=len(clips) > 1,
                clips=clips,
                include_screenshots=bool(screenshots),
                total_duration_s=sum(c.duration_s for c in clips),
                rationale="explicit scene_hints supplied by planner",
            )

        # 2) Single-scene path.
        if duration_s <= max_dur:
            return ScenePlan(
                multi_scene=False,
                clips=[SceneClip(
                    index=0,
                    title="Ad",
                    prompt="",  # filled in by the caller
                    duration_s=max(2, duration_s),
                    reference_images=screenshots,
                )],
                include_screenshots=bool(screenshots),
                total_duration_s=max(2, duration_s),
                rationale=f"duration_s={duration_s} <= max_duration_s={max_dur}",
            )

        # 3) Multi-scene path: split evenly into N clips where
        #    N = min(max_scenes, ceil(duration_s / max_dur)).
        n = min(max_scenes, max(2, -(-duration_s // max_dur)))  # ceil div
        per = max(2, min(max_dur, duration_s // n))
        clips = []
        for i in range(n):
            refs = screenshots if i == 0 else []
            clips.append(SceneClip(
                index=i,
                title=f"Scene {i + 1}/{n}",
                prompt="",
                duration_s=per,
                reference_images=refs,
            ))
        return ScenePlan(
            multi_scene=True,
            clips=clips,
            include_screenshots=bool(screenshots),
            total_duration_s=sum(c.duration_s for c in clips),
            rationale=(
                f"duration_s={duration_s} > max_duration_s={max_dur}; "
                f"split into {n} clips of {per}s each"
            ),
        )

    # ---- public MediaClient surface -----------------------------------------------
    async def generate_image(self, prompt: str) -> str:
        result = await self._run(settings.wavespeed_image_model, {"prompt": prompt})
        return _extract_url(result)

    async def generate_video(
        self,
        prompt: str,
        frames: list[str],
        duration_s: int,
        *,
        resolution: str = "720p",
        aspect_ratio: str = "16:9",
        enable_audio: bool = True,
        enable_prompt_expansion: bool = False,
    ) -> str:
        """Single-scene video generation. All reference images go in one call.

        ``frames`` is accepted as a backwards-compatible alias for
        ``reference_images`` \u2014 the new reference-to-video model is
        reference-driven rather than first/last-frame-driven.
        """
        inputs: dict[str, Any] = {
            "prompt": prompt,
            "duration": max(2, min(int(duration_s), settings.wavespeed_video_max_duration_s)),
            "resolution": resolution,
            "aspect_ratio": aspect_ratio,
            "enable_audio": enable_audio,
            "enable_prompt_expansion": enable_prompt_expansion,
        }
        if frames:
            inputs["reference_images"] = list(frames)
        result = await self._run(settings.wavespeed_video_model, inputs)
        return _extract_url(result)

    # ---- multi-scene entrypoint ---------------------------------------------------
    async def generate_video_scenes(
        self,
        plan: ScenePlan,
        *,
        master_prompt: str = "",
        resolution: str = "720p",
        aspect_ratio: str = "16:9",
        enable_audio: bool = True,
        enable_prompt_expansion: bool = False,
    ) -> list[str]:
        """Run every clip in ``plan`` sequentially and stitch the result.

        Each clip is a separate wavespeed call (bounded by ``max_scenes``).
        If ffmpeg is available locally, the clips are concatenated into a
        single MP4 and *that* URL is returned as the only element of the
        list; otherwise we return one URL per clip (the orchestrator decides
        how to expose them).
        """
        urls: list[str] = []
        for clip in plan.clips:
            prompt = clip.prompt or master_prompt
            inputs: dict[str, Any] = {
                "prompt": prompt,
                "duration": clip.duration_s,
                "resolution": resolution,
                "aspect_ratio": aspect_ratio,
                "enable_audio": enable_audio,
                "enable_prompt_expansion": enable_prompt_expansion,
            }
            if clip.reference_images:
                inputs["reference_images"] = list(clip.reference_images)
            result = await self._run(settings.wavespeed_video_model, inputs)
            urls.append(_extract_url(result))

        if len(urls) <= 1 or not shutil.which("ffmpeg"):
            return urls

        # Stitch with ffmpeg into a single MP4 and return just the local path.
        stitched = await _stitch_with_ffmpeg(urls)
        return [stitched]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _extract_url(result: dict[str, Any]) -> str:
    """Pull a usable URL out of the various shapes the CLI / API returns."""
    if not result:
        raise RuntimeError("wavespeed returned empty result")
    # New shape: {"data": {"outputs": ["https://..."]}}
    if isinstance(result.get("data"), dict):
        outs = result["data"].get("outputs")
        if outs:
            return outs[0] if isinstance(outs, list) else str(outs)
    if "outputs" in result and result["outputs"]:
        outs = result["outputs"]
        return outs[0] if isinstance(outs, list) else str(outs)
    for k in ("url", "output_url", "video_url"):
        if result.get(k):
            return str(result[k])
    if "output" in result and result["output"]:
        out = result["output"]
        return out[0] if isinstance(out, list) else str(out)
    raise RuntimeError(f"could not extract URL from wavespeed result: {result}")


async def _run_cli(bin_path: str, *args: str, timeout: int = 30) -> str:
    proc = await asyncio.create_subprocess_exec(
        bin_path, *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, _err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return ""
    if proc.returncode != 0:
        return ""
    return out.decode(errors="ignore")


async def _run_cli_raw(cmd: list[str], *, timeout: int) -> tuple[int, bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        return -1, b"", b"timeout"
    return proc.returncode or 0, out, err


async def _stitch_with_ffmpeg(urls: Iterable[str]) -> str:
    """Concatenate the per-scene MP4 URLs into a single MP4 file."""
    tmpdir = tempfile.mkdtemp(prefix="mkt-stitch-")
    local_inputs: list[str] = []
    # Download each clip to a local path.
    for i, url in enumerate(urls):
        path = os.path.join(tmpdir, f"clip_{i:02d}.mp4")
        proc = await asyncio.create_subprocess_exec(
            shutil.which("curl") or "curl", "-fsSL", "-o", path, url,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        local_inputs.append(path)

    out_path = os.path.join(tmpdir, "final.mp4")
    # Build a concat list for ffmpeg.
    list_path = os.path.join(tmpdir, "list.txt")
    with open(list_path, "w") as fh:
        for p in local_inputs:
            fh.write(f"file '{p}'\n")

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_path,
        "-c", "copy", out_path,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    await proc.communicate()
    return out_path


def make_wavespeed_client() -> MediaClient:
    return WavespeedCLI()


def make_wavespeed_video_client() -> "WavespeedCLI":
    return WavespeedCLI()
