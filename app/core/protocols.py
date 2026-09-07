"""Dependency-Inversion: thin protocols so services depend on abstractions, not tools."""
from __future__ import annotations
from typing import AsyncIterator, Protocol


class ChatClient(Protocol):
    async def stream(self, system: str, user: str) -> AsyncIterator[str]: ...
    async def complete(self, system: str, user: str) -> str: ...


class MediaClient(Protocol):
    async def generate_image(self, prompt: str) -> str: ...  # returns URL
    async def generate_video(self, prompt: str, frames: list[str], duration_s: int) -> str: ...


class SourceReader(Protocol):
    """Reads a project source: either local files or scraped website."""
    async def read(self, target: str) -> str: ...
