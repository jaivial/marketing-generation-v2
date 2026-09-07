"""Regression test: localStorage corruption must not break the UI.

These are pure-JS / pure-Python sanity tests that exercise the loadJson
rules we documented in src/lib/store.ts. They don't import the actual TS
file (the project doesn't have a JS test runner wired up), but they encode
the expected behavior in plain Python so we can keep them around as a
specification.
"""
from typing import Any, Union


def loadjson(raw: Union[str, None], fallback: Any) -> Any:
    """A Python re-implementation of the loadJson function in src/lib/store.ts.

    Rules (mirroring the TS implementation):
      - raw is None / unparseable     -> fallback
      - fallback is array:
          * parsed is array          -> parsed
          * anything else            -> fallback
      - fallback is plain object:
          * parsed is plain object   -> {**fallback, **parsed}
          * anything else            -> fallback
      - fallback is primitive:
          * types match               -> parsed
          * else                      -> fallback
    """
    if raw is None:
        return fallback
    try:
        import json
        parsed = json.loads(raw)
    except Exception:
        return fallback
    if parsed is None:
        return fallback

    fallback_is_array = isinstance(fallback, list)
    parsed_is_array = isinstance(parsed, list)
    parsed_is_object = isinstance(parsed, dict)

    if fallback_is_array:
        return parsed if parsed_is_array else fallback

    if not fallback_is_array and isinstance(fallback, dict) and fallback is not None:
        if parsed_is_object:
            merged = dict(fallback)
            merged.update(parsed)
            return merged
        return fallback

    if type(parsed) is type(fallback):
        return parsed
    return fallback


# -- Test cases ----------------------------------------------------------

FALLBACK_HISTORY = [
    {"id": "c-001", "name": "Acme CMS launch", "status": "done"},
    {"id": "c-002", "name": "Q4 teaser",        "status": "draft"},
]

FALLBACK_USER = {"name": "Jaime", "email": "jaime@menustudioai.com"}


def test_empty_returns_fallback():
    assert loadjson(None, FALLBACK_HISTORY) is FALLBACK_HISTORY


def test_broken_json_returns_fallback():
    assert loadjson("{ broken", FALLBACK_HISTORY) is FALLBACK_HISTORY


def test_null_returns_fallback():
    assert loadjson("null", FALLBACK_HISTORY) is FALLBACK_HISTORY


def test_array_value_replaces_array_fallback():
    val = [{"id": "x", "name": "new"}]
    assert loadjson(json_dumps(val), FALLBACK_HISTORY) == val


def test_object_replaces_array_fallback_instead_of_spreading():
    """The original bug: `{...fallback_array, ...stored_object}` turned
    DEFAULT_HISTORY into a plain object with numeric keys, breaking
    .filter()/.map()/.find() on every page that read history.
    """
    stored = {"0": {"id": "x", "name": "x"}}
    result = loadjson(json_dumps(stored), FALLBACK_HISTORY)
    # Must be the original array fallback (NOT a merged object)
    assert result is FALLBACK_HISTORY
    assert isinstance(result, list)


def test_string_replaces_array_fallback_instead_of_spreading():
    stored = "not an array"
    result = loadjson(json_dumps(stored), FALLBACK_HISTORY)
    assert result is FALLBACK_HISTORY
    assert isinstance(result, list)


def test_number_replaces_array_fallback():
    stored = 42
    result = loadjson(json_dumps(stored), FALLBACK_HISTORY)
    assert result is FALLBACK_HISTORY


def test_object_fallback_merges_with_object_storage():
    stored = {"avatar": "from-rose-500 to-amber-500"}
    result = loadjson(json_dumps(stored), FALLBACK_USER)
    assert result == {**FALLBACK_USER, **stored}


def test_array_storage_does_not_merge_into_object_fallback():
    """If the user has stored an array but the fallback is an object, we
    should fall back to the object default (not silently keep the array).
    """
    stored = [1, 2, 3]
    result = loadjson(json_dumps(stored), FALLBACK_USER)
    assert result is FALLBACK_USER


def test_empty_array_storage_overrides_empty_array_fallback():
    val = []
    assert loadjson(json_dumps(val), FALLBACK_HISTORY) == []


def test_primitive_type_match():
    assert loadjson('"hello"', "default") == "hello"
    assert loadjson("42", 0) == 42
    assert loadjson("true", False) is True


def test_primitive_type_mismatch():
    assert loadjson('"hello"', 0) == 0
    assert loadjson("42", "0") == "0"
    assert loadjson("true", 0) == 0


def json_dumps(v):
    import json
    return json.dumps(v)


def test_synthetic_repro_of_user_bug():
    """The exact scenario the user hit: previous broken build wrote the
    history as a plain object via index keys. We must NOT load it as
    history — we must return the fallback so the UI works.
    """
    broken_previous = {"0": {"id": "c-001", "name": "Acme"}}
    result = loadjson(json_dumps(broken_previous), FALLBACK_HISTORY)
    # Library page must be able to .filter() this without crashing
    assert isinstance(result, list)
    assert result is FALLBACK_HISTORY
    # Sanity: actually filter it like the page does
    done = [c for c in result if c["status"] == "done"]
    assert len(done) == 1
    assert done[0]["name"] == "Acme CMS launch"
