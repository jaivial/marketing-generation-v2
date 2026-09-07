"""Internationalisation API — serves translation bundles to the SPA.

The source of truth is a set of flat JSON files under ``app/i18n/<lang>.json``.
Each file is a single JSON object whose keys are dotted string identifiers
(e.g. ``landing.hero.title``) and whose values are the translated strings.
A reserved ``_meta`` object carries the language code, its display name and
an ``rtl`` flag.

Bundles are read from disk exactly once (at import time) and cached in a
module-level dict, so serving a bundle is a pure in-memory lookup. This keeps
the endpoint cheap enough to be hit on every SPA navigation.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query, status

# ─── Paths ──────────────────────────────────────────────────────────────────
I18N_DIR = Path(__file__).resolve().parent.parent / "i18n"

# The canonical, ordered list of languages the product ships with. The order
# is the order the language switcher renders them in.
SUPPORTED_LANGUAGES: tuple[str, ...] = (
    "en", "es", "fr", "de", "pt", "it", "nl", "sv", "pl", "ja",
)

# Fallback display names, used only if a bundle is missing its `_meta.name`.
_FALLBACK_NAMES: Dict[str, str] = {
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "pt": "Português",
    "it": "Italiano",
    "nl": "Nederlands",
    "sv": "Svenska",
    "pl": "Polski",
    "ja": "日本語",
}

DEFAULT_LANGUAGE = "en"


# ─── Bundle loading / caching ───────────────────────────────────────────────
def _load_bundle(lang: str) -> Dict[str, Any] | None:
    """Read and parse ``app/i18n/<lang>.json``. Returns None if absent/invalid."""
    path = I18N_DIR / f"{lang}.json"
    if not path.is_file():
        return None
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def load_all_bundles() -> Dict[str, Dict[str, Any]]:
    """Load every supported language bundle from disk.

    Missing or malformed files are skipped rather than fatal — a partially
    translated deploy should still serve the languages it does have.
    """
    bundles: Dict[str, Dict[str, Any]] = {}
    for lang in SUPPORTED_LANGUAGES:
        bundle = _load_bundle(lang)
        if bundle is not None:
            bundles[lang] = bundle
    return bundles


# Loaded once at import (i.e. application startup) and cached for the process
# lifetime. `reload_bundles()` exists so tests can rebuild the cache after
# writing fixture files.
_BUNDLES: Dict[str, Dict[str, Any]] = load_all_bundles()


def reload_bundles() -> Dict[str, Dict[str, Any]]:
    """Re-read every bundle from disk and swap the cache. Returns the cache."""
    global _BUNDLES
    _BUNDLES = load_all_bundles()
    return _BUNDLES


def get_bundle(lang: str) -> Dict[str, Any] | None:
    """Return the cached bundle for `lang`, or None if it isn't available."""
    return _BUNDLES.get(lang)


def available_languages() -> List[Dict[str, Any]]:
    """Return ``[{code, name, rtl}, ...]`` for every supported language."""
    out: List[Dict[str, Any]] = []
    for code in SUPPORTED_LANGUAGES:
        meta = (_BUNDLES.get(code) or {}).get("_meta") or {}
        out.append({
            "code": code,
            "name": meta.get("name") or _FALLBACK_NAMES.get(code, code),
            "rtl": bool(meta.get("rtl", False)),
        })
    return out


# ─── Router ─────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/i18n", tags=["i18n"])


@router.get("/strings")
async def get_strings(lang: str = Query(DEFAULT_LANGUAGE, description="Language code")) -> Dict[str, Any]:
    """Return the full translation bundle for `lang`.

    Unknown / unsupported languages produce a 404 so the client can fall back
    to English rather than silently rendering raw keys.
    """
    code = (lang or "").strip().lower()
    bundle = get_bundle(code)
    if bundle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unsupported language: {lang!r}",
        )
    return bundle


@router.get("/languages")
async def get_languages() -> List[Dict[str, Any]]:
    """Return the list of supported languages with their display names."""
    return available_languages()
