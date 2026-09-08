"""Workspace RAG retrieval helpers.

The orchestrator calls :func:`workspace_rag_context` right before asking
the LLM to plan a campaign. It performs an FTS5 lookup against the
workspace knowledge base (populated by the onboarding wizard and, later,
by generated campaign artifacts) and renders the top hits as a markdown
blob that can be dropped straight into a system prompt.

The rendering deliberately stays dumb — no re-ranking, no embeddings —
because the FTS5 ``rank`` column already orders by BM25 relevance and the
snippets are short enough that the LLM can read all of them.
"""
from __future__ import annotations

import re

from app.services import storage


#: Separator between snippets in the rendered markdown context.
SNIPPET_SEPARATOR = "\n\n---\n\n"

#: FTS5 ``snippet()`` wraps matched terms in ``<b>``/``</b>``. Those tags
#: are noise inside an LLM prompt, so we strip them out.
_HIGHLIGHT_RE = re.compile(r"</?b>")


def _clean(text: str | None) -> str:
    """Strip FTS5 highlight markup and normalise whitespace."""
    if not text:
        return ""
    return " ".join(_HIGHLIGHT_RE.sub("", str(text)).split())


def render_snippet(row: dict) -> str:
    """Render one ``workspace_kb`` row as a markdown section."""
    title = _clean(row.get("title")) or _clean(row.get("kind")) or "context"
    body = _clean(row.get("snip")) or _clean(row.get("body"))
    kind = _clean(row.get("kind"))
    heading = f"### {title}"
    if kind and kind != title:
        heading += f" ({kind})"
    return f"{heading}\n{body}".rstrip()


def workspace_rag_context(workspace_id: str, query: str, *, limit: int = 6) -> str:
    """Return a markdown-formatted string of the top RAG snippets.

    Args:
        workspace_id: the workspace whose knowledge base to search.
        query: free-form text (usually the campaign brief / target).
        limit: maximum number of snippets to include.

    Returns:
        The snippets joined by ``\\n\\n---\\n\\n``, ready to be inlined in
        a system prompt. An empty string when nothing matches — callers
        should treat that as "no prior context" rather than an error.
    """
    if not workspace_id or not query or limit < 1:
        return ""

    try:
        rows = storage.search_workspace_kb(workspace_id, query, limit)
    except Exception:
        # A broken/absent RAG index must never take a campaign down.
        return ""

    sections = [s for s in (render_snippet(r) for r in rows or []) if s]
    if not sections:
        return ""
    return SNIPPET_SEPARATOR.join(sections)
