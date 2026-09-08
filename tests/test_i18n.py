"""Tests for the i18n bundles and the /api/i18n endpoints.

Everything here is offline: the bundles are plain JSON files on disk and the
endpoints are pure in-memory lookups, so no external service is touched.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.translations import I18N_DIR, SUPPORTED_LANGUAGES

client = TestClient(app)

EXPECTED_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "nl", "sv", "pl", "ja"]

# Anything that looks like an unfinished translation.
_PLACEHOLDER_RE = re.compile(
    r"(TODO|FIXME|XXX|TRANSLATE_ME|<placeholder>|\bLorem ipsum\b)", re.IGNORECASE
)

# Interpolation tokens must survive translation, e.g. "{{name}}".
_INTERP_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def load(lang: str) -> dict:
    return json.loads((I18N_DIR / f"{lang}.json").read_text(encoding="utf-8"))


def strings_of(bundle: dict) -> dict:
    """Bundle minus the `_meta` bookkeeping entry."""
    return {k: v for k, v in bundle.items() if k != "_meta"}


# ─── Bundle content ─────────────────────────────────────────────────────────
def test_english_bundle_has_no_placeholders():
    """en.json must be fully written out — no TODO markers, no empty values."""
    en = load("en")
    strings = strings_of(en)
    assert strings, "en.json is empty"

    for key, value in strings.items():
        assert isinstance(value, str), f"{key} is not a string"
        assert value.strip(), f"{key} is empty"
        assert not _PLACEHOLDER_RE.search(value), f"{key} contains a placeholder: {value!r}"
        # A value that is just the key echoed back is an unfinished string.
        assert value != key, f"{key} was never given a real translation"


def test_all_languages_have_same_keys():
    """Every bundle must expose exactly the same key set as en.json."""
    en_keys = set(strings_of(load("en")))

    for lang in EXPECTED_LANGUAGES:
        bundle = load(lang)
        keys = set(strings_of(bundle))
        assert keys == en_keys, (
            f"{lang}.json key mismatch: "
            f"missing={sorted(en_keys - keys)[:5]} extra={sorted(keys - en_keys)[:5]}"
        )


def test_every_bundle_file_exists_and_has_meta():
    for lang in EXPECTED_LANGUAGES:
        path = I18N_DIR / f"{lang}.json"
        assert path.is_file(), f"missing bundle {path.name}"
        meta = load(lang).get("_meta")
        assert isinstance(meta, dict), f"{lang}.json has no _meta"
        assert meta.get("code") == lang
        assert meta.get("name"), f"{lang}.json _meta.name is empty"
        assert meta.get("rtl") is False


def test_non_english_bundles_are_actually_translated():
    """Guard against a bundle that just copies English.

    Some values legitimately stay identical across languages (brand names,
    URLs, placeholders like '$0'), so we assert on a ratio rather than
    demanding every single string differ.
    """
    en = strings_of(load("en"))
    for lang in EXPECTED_LANGUAGES:
        if lang == "en":
            continue
        other = strings_of(load(lang))
        differing = sum(1 for k, v in en.items() if other.get(k) != v)
        ratio = differing / len(en)
        assert ratio > 0.75, (
            f"{lang}.json only differs from English in {ratio:.0%} of keys "
            f"— it looks like an untranslated copy"
        )


def test_interpolation_placeholders_are_preserved():
    """`{{name}}`-style tokens must survive translation in every language."""
    en = strings_of(load("en"))
    for lang in EXPECTED_LANGUAGES:
        other = strings_of(load(lang))
        for key, en_value in en.items():
            expected = set(_INTERP_RE.findall(en_value))
            if not expected:
                continue
            got = set(_INTERP_RE.findall(other[key]))
            assert got == expected, (
                f"{lang}.json:{key} placeholder mismatch: expected {expected}, got {got}"
            )


def test_no_bundle_has_empty_values():
    for lang in EXPECTED_LANGUAGES:
        for key, value in strings_of(load(lang)).items():
            assert isinstance(value, str) and value.strip(), f"{lang}.json:{key} is empty"


# ─── API endpoints ──────────────────────────────────────────────────────────
def test_get_strings_returns_404_for_unknown_language():
    r = client.get("/api/i18n/strings", params={"lang": "xx"})
    assert r.status_code == 404
    assert "xx" in r.json()["detail"]


def test_get_languages_returns_10():
    r = client.get("/api/i18n/languages")
    assert r.status_code == 200
    langs = r.json()
    assert len(langs) == 10
    assert [l["code"] for l in langs] == EXPECTED_LANGUAGES
    for entry in langs:
        assert entry["name"], f"{entry['code']} has no display name"
    # Display names are the language's own endonym, not the English name.
    by_code = {l["code"]: l["name"] for l in langs}
    assert by_code["es"] == "Español"
    assert by_code["de"] == "Deutsch"
    assert by_code["ja"] == "日本語"


@pytest.mark.parametrize("lang", EXPECTED_LANGUAGES)
def test_get_strings_returns_bundle_for_each_language(lang):
    r = client.get("/api/i18n/strings", params={"lang": lang})
    assert r.status_code == 200
    body = r.json()
    assert body["_meta"]["code"] == lang
    assert body["nav.dashboard"]


def test_get_strings_defaults_to_english():
    r = client.get("/api/i18n/strings")
    assert r.status_code == 200
    assert r.json()["_meta"]["code"] == "en"


def test_supported_languages_constant_matches_expected():
    assert list(SUPPORTED_LANGUAGES) == EXPECTED_LANGUAGES


def test_i18n_routes_are_public():
    """The SPA fetches strings before login, so these must not be ACL-gated."""
    for path in ("/api/i18n/languages", "/api/i18n/strings?lang=en"):
        assert client.get(path).status_code == 200
