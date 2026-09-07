"""Source readers — Liskov-friendly: any SourceReader returns plain text context.
Two concrete strategies: LocalFiles and AgentBrowserScrape.

AgentBrowserScrape uses the local `agent-browser` CLI for fast, AI-agent-friendly
web scraping. Supports optional HTTP basic auth credentials for sites that
require login.
"""
from __future__ import annotations
import asyncio
import json
import pathlib
import re
import shutil
import subprocess
from app.core.config import settings
from app.core.protocols import SourceReader


class LocalFilesSource:
    """Reads text-ish files from a local directory up to a byte budget."""
    def __init__(self, max_bytes: int = 200_000) -> None:
        self._max = max_bytes

    async def read(self, target: str) -> str:
        root = pathlib.Path(target)
        if not root.exists():
            raise FileNotFoundError(target)
        chunks: list[str] = []
        used = 0
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in {
                ".md", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx",
                ".json", ".yaml", ".yml", ".html", ".css", ".go", ".rs",
            }:
                continue
            data = p.read_text(errors="ignore")
            if used + len(data) > self._max:
                data = data[: self._max - used]
            chunks.append(f"### {p.relative_to(root)}\n{data}")
            used += len(data)
            if used >= self._max:
                break
        return "\n\n".join(chunks) or "(empty project)"


class AgentBrowserScrapeSource:
    """Scrapes a URL using the local `agent-browser read` CLI.

    Optional `username` / `password` are sent to the browser via
    `agent-browser set credentials` so login-gated sites can be explored.
    """

    def __init__(
        self,
        bin_path: str | None = None,
        username: str | None = None,
        password: str | None = None,
        timeout_s: int = 60,
        max_chars: int = 200_000,
    ) -> None:
        self._bin = bin_path or shutil.which("agent-browser") or "agent-browser"
        self._username = username or None
        self._password = password or None
        self._timeout_s = timeout_s
        self._max_chars = max_chars

    async def read(self, target: str) -> str:
        # First, ensure the browser session is set up with credentials if provided.
        # This is a no-op if already configured for the same host.
        if self._username and self._password:
            await self._run_cli(
                "set", "credentials", self._username, self._password,
                timeout=15,
            )

        # Read the page as agent-readable markdown/text. agent-browser handles
        # JS rendering, anti-bot heuristics, llms.txt discovery, and HTML cleanup.
        proc = await asyncio.create_subprocess_exec(
            self._bin, "read", target, "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=self._timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError(f"agent-browser read timed out for {target}")
        if proc.returncode != 0:
            raise RuntimeError(
                f"agent-browser read failed for {target}: {err.decode(errors='ignore')[:500]}"
            )

        text = self._extract_text(out)
        return text[: self._max_chars]

    async def _run_cli(self, *args: str, timeout: int = 30) -> str:
        proc = await asyncio.create_subprocess_exec(
            self._bin, *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            return ""
        if proc.returncode != 0:
            # Non-fatal — the browser may already be configured.
            return ""
        return out.decode(errors="ignore")

    @staticmethod
    def _extract_text(raw: bytes) -> str:
        """Extract a clean text blob from agent-browser's --json output (or plain text)."""
        text = raw.decode(errors="ignore").strip()
        if not text:
            return ""
        # --json output: try to parse and pull out the text/markdown field.
        if text.startswith("{") and '"text"' in text or '"markdown"' in text or '"content"' in text:
            try:
                data = json.loads(text)
                for key in ("text", "markdown", "content", "body", "readableText"):
                    if key in data and isinstance(data[key], str) and data[key].strip():
                        return data[key]
            except json.JSONDecodeError:
                pass
        # Strip any HTML that may have leaked through, collapse whitespace.
        text = re.sub(r"<script.*?</script>", "", text, flags=re.S)
        text = re.sub(r"<style.*?</style>", "", text, flags=re.S)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text


def make_source_reader(
    kind: str,
    target: str,
    username: str | None = None,
    password: str | None = None,
) -> SourceReader:
    """Factory — keeps route handlers free of branching (OCP)."""
    if kind == "files":
        return LocalFilesSource()
    if kind == "url":
        return AgentBrowserScrapeSource(username=username, password=password)
    raise ValueError(f"unknown source kind: {kind}")
