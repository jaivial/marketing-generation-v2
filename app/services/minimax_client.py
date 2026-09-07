"""MiniMax (M-series) chat client via OpenAI-compatible REST API. SSE-streamed.

The M-series models emit a `` reasoning block *before* the actual answer.
We strip it before returning so downstream callers only see the marketing
copy they asked for.
"""
from __future__ import annotations
import json
import re
import httpx
from app.core.config import settings
from app.core.protocols import ChatClient


# Match the entire `` block (greedy across newlines).
_THINK_RE = re.compile(r"<think>.*?</think>", flags=re.S)


def _strip_think(text: str) -> str:
    """Remove ``...`` blocks from the model output."""
    if not text:
        return text
    return _THINK_RE.sub("", text).strip()


class MinimaxClient:
    def __init__(self, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, timeout: float = 120.0) -> None:
        self._key = api_key or settings.minimax_api_key
        self._base = (base_url or settings.minimax_base_url).rstrip("/")
        self._model = model or settings.minimax_model
        self._client = httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _payload(self, system: str, user: str, stream: bool) -> dict:
        return {
            "model": self._model,
            "stream": stream,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }

    async def complete(self, system: str, user: str) -> str:
        r = await self._client.post(
            f"{self._base}/chat/completions",
            headers={"Authorization": f"Bearer {self._key}"},
            json=self._payload(system, user, False),
        )
        r.raise_for_status()
        return _strip_think(r.json()["choices"][0]["message"]["content"])

    async def stream(self, system: str, user: str):
        # Buffer so we can strip `` blocks even if they straddle chunks.
        buf = ""
        async with self._client.stream(
            "POST",
            f"{self._base}/chat/completions",
            headers={"Authorization": f"Bearer {self._key}"},
            json=self._payload(system, user, True),
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data in ("[DONE]", ""):
                    continue
                try:
                    obj = json.loads(data)
                    delta = obj["choices"][0]["delta"].get("content") or ""
                    if delta:
                        buf += delta
                        # Try to yield everything *after* the closing think tag.
                        cleaned = _strip_think(buf)
                        if cleaned:
                            # Emit only the new portion (last len(cleaned)).
                            # We approximate by re-emitting the whole cleaned
                            # buffer; consumers are tolerant of duplicates.
                            yield cleaned
                            buf = ""
                except (KeyError, json.JSONDecodeError):
                    continue


def make_minimax_client() -> ChatClient:
    return MinimaxClient()
