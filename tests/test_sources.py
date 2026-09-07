"""Tests for source readers (LocalFiles + AgentBrowserScrape)."""
import asyncio
import sys
from unittest import mock
import pytest

from app.services.sources import AgentBrowserScrapeSource, LocalFilesSource


def test_local_files_source_reads_project(tmp_path):
    (tmp_path / "a.py").write_text("print('hello')")
    (tmp_path / "b.md").write_text("# title")
    (tmp_path / "c.bin").write_text("\x00\x01")  # not a text extension

    src = LocalFilesSource(max_bytes=1000)
    out = asyncio.run(src.read(str(tmp_path)))
    assert "print('hello')" in out
    assert "# title" in out
    assert "\x00\x01" not in out


def test_local_files_source_handles_missing_path():
    src = LocalFilesSource()
    with pytest.raises(FileNotFoundError):
        asyncio.run(src.read("/this/path/does/not/exist"))


def test_agent_browser_extracts_text_from_json():
    """Verify the _extract_text helper handles agent-browser --json output."""
    src = AgentBrowserScrapeSource()
    json_bytes = b'{"url": "https://x.com", "title": "Hello", "text": "This is the body."}'
    assert src._extract_text(json_bytes) == "This is the body."


def test_agent_browser_strips_html_from_plain_text():
    src = AgentBrowserScrapeSource()
    plain = b"<html><body><h1>Title</h1><p>Body &amp; text</p></body></html>"
    out = src._extract_text(plain)
    assert "Title" in out
    assert "Body" in out
    assert "<" not in out  # tags stripped (entities are fine — they were already in the text)


def test_agent_browser_handles_empty_output():
    src = AgentBrowserScrapeSource()
    assert src._extract_text(b"") == ""
    assert src._extract_text(b"   \n  ") == ""


def test_agent_browser_source_calls_cli():
    """Verify AgentBrowserScrapeSource calls the right agent-browser subcommand."""
    src = AgentBrowserScrapeSource(bin_path="/usr/bin/agent-browser", username="u", password="p")

    fake_proc = mock.AsyncMock()
    fake_proc.communicate = mock.AsyncMock(return_value=(b'{"text": "scraped content"}', b""))
    fake_proc.returncode = 0

    async def fake_exec(*args, **kwargs):
        return fake_proc

    with mock.patch("asyncio.create_subprocess_exec", side_effect=fake_exec):
        out = asyncio.run(src.read("https://example.com"))

    assert out == "scraped content"
