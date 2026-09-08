"""Onboarding wizard + workspace RAG ingest endpoints.

The onboarding flow captures the *project context* a marketing campaign
needs before the LLM is ever asked to plan anything: the brand, who the
audience is, the tone of voice, the products, the USPs and the
competitors.

Every section the user submits is appended to ``onboarding_notes`` and
mirrored (by the storage layer) into the FTS5 ``workspace_kb`` virtual
table, which is the RAG index the client SDK queries per new campaign.

Three routes:

- ``POST /api/onboarding/{workspace_id}/sections`` — ingest a batch of
  ``{section, content}`` items.
- ``GET  /api/onboarding/{workspace_id}/sections`` — list every note for
  the workspace, oldest first.
- ``GET  /api/onboarding/{workspace_id}/rag?q=...&limit=8`` — a thin
  wrapper over ``storage.search_workspace_kb`` so the frontend (and the
  orchestrator) can preview what the RAG index will return.

Authorization
=============
All three routes require an authenticated principal *that owns the
workspace*. Ownership is resolved with
``storage.get_workspace_by_owner(principal.id)`` — a principal whose
personal workspace is not the one named in the path gets a 403. Root
keeps its usual override so support staff can inspect a tenant.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.acl import Principal, get_current_principal
from app.services import storage


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ─── Schemas ────────────────────────────────────────────────────────────────
class SectionIn(BaseModel):
    """A single onboarding answer.

    ``section`` lands in the FTS5 ``title`` column, so the canonical
    wizard names (``brand``, ``audience``, ``tone``, ``products``,
    ``usps``, ``competitors``) double as searchable keywords.
    """
    section: str = Field(min_length=1, max_length=64)
    content: str = Field(min_length=1)


class SectionOut(BaseModel):
    id: int
    workspace_id: str
    section: str
    content: str
    created_at: float


class IngestOut(BaseModel):
    workspace_id: str
    ingested: int
    note_ids: list[int]


class RagHit(BaseModel):
    kind: str
    source_id: str | None = None
    title: str | None = None
    snippet: str | None = None
    rank: float | None = None


class RagOut(BaseModel):
    workspace_id: str
    query: str
    count: int
    results: list[RagHit]


# ─── Ownership guard ────────────────────────────────────────────────────────
def _require_workspace_owner(workspace_id: str, principal: Principal) -> dict:
    """Return the workspace if ``principal`` may touch it, else raise.

    401 when the caller is an anonymous guest, 403 when the caller is
    authenticated but the workspace isn't theirs.
    """
    if not principal.is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
        )

    owned = storage.get_workspace_by_owner(principal.id)
    if owned is not None and owned["id"] == workspace_id:
        return owned

    # Root is allowed to inspect any workspace (support / debugging).
    if principal.is_root:
        ws = storage.get_workspace(workspace_id)
        if ws is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "workspace not found")
        return ws

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"principal {principal.id} does not own workspace {workspace_id}",
    )


def workspace_dep(
    workspace_id: str,
    principal: Principal = Depends(get_current_principal),
) -> dict:
    """FastAPI dependency: resolve + authorize the path's workspace."""
    return _require_workspace_owner(workspace_id, principal)


# ─── Routes ─────────────────────────────────────────────────────────────────
@router.post("/{workspace_id}/sections", response_model=IngestOut,
             status_code=status.HTTP_201_CREATED)
def ingest_sections(
    workspace_id: str,
    payload: list[SectionIn],
    _ws: dict = Depends(workspace_dep),
) -> IngestOut:
    """Append each section to ``onboarding_notes`` (+ the FTS5 mirror)."""
    if not payload:
        raise HTTPException(422, "at least one section is required")

    note_ids: list[int] = []
    for item in payload:
        note_ids.append(
            storage.add_onboarding_note(
                workspace_id=workspace_id,
                section=item.section.strip(),
                content=item.content.strip(),
            )
        )
    return IngestOut(
        workspace_id=workspace_id,
        ingested=len(note_ids),
        note_ids=note_ids,
    )


@router.get("/{workspace_id}/sections", response_model=list[SectionOut])
def list_sections(
    workspace_id: str,
    _ws: dict = Depends(workspace_dep),
) -> list[SectionOut]:
    """Every note for the workspace, ordered by ``created_at``."""
    rows = storage.list_onboarding_notes(workspace_id)
    return [
        SectionOut(
            id=int(r["id"]),
            workspace_id=r["workspace_id"],
            section=r["section"],
            content=r["content"],
            created_at=float(r["created_at"]),
        )
        for r in rows
    ]


@router.get("/{workspace_id}/rag", response_model=RagOut)
def rag_search(
    workspace_id: str,
    q: str = Query("", description="free-form FTS5 query"),
    limit: int = Query(8, ge=1, le=50),
    _ws: dict = Depends(workspace_dep),
) -> RagOut:
    """Wrap ``storage.search_workspace_kb`` and return the rows as JSON."""
    rows = storage.search_workspace_kb(workspace_id, q, limit)
    results = [
        RagHit(
            kind=r.get("kind") or "onboarding",
            source_id=r.get("source_id"),
            title=r.get("title"),
            snippet=r.get("snip"),
            rank=r.get("rank"),
        )
        for r in rows
    ]
    return RagOut(workspace_id=workspace_id, query=q,
                  count=len(results), results=results)
