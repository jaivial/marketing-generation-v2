"""Tests for the `` block stripping in the MiniMax client."""
from app.services.minimax_client import _strip_think


def test_strip_simple_think_block():
    raw = "<think>reasoning</think>\n\nFinal answer."
    assert _strip_think(raw) == "Final answer."


def test_strip_think_block_with_internal_newlines():
    raw = "<think>\nWe need answer task. Need write VO script.\nLet me think...\n</think>\n\nHere is the script."
    assert _strip_think(raw) == "Here is the script."


def test_strip_no_think_block():
    raw = "Just a plain answer with no thinking."
    assert _strip_think(raw) == "Just a plain answer with no thinking."


def test_strip_empty_string():
    assert _strip_think("") == ""
    assert _strip_think(None) is None


def test_strip_only_think_block_returns_empty():
    raw = "<think>just reasoning, no answer</think>"
    assert _strip_think(raw) == ""
