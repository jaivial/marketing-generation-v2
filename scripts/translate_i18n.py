"""Regenerate the non-English i18n bundles with the MiniMax chat model.

This is a *maintenance* script, not part of the runtime or the test suite.
It reads ``app/i18n/en.json`` (the source of truth), asks MiniMax-M3 to
translate each batch of keys, and writes ``app/i18n/<lang>.json``.

Usage::

    MINIMAX_API_KEY=... PYTHONPATH=. python scripts/translate_i18n.py [lang ...]

The API key is read from the environment only — never hard-code or commit it.
Existing translations are reused, so re-running only fills in missing keys
(pass ``--force`` to retranslate everything).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List

import httpx

I18N_DIR = Path(__file__).resolve().parent.parent / "app" / "i18n"

LANGUAGES: Dict[str, str] = {
    "es": "Spanish (Español)",
    "fr": "French (Français)",
    "de": "German (Deutsch)",
    "pt": "Portuguese (Português)",
    "it": "Italian (Italiano)",
    "nl": "Dutch (Nederlands)",
    "sv": "Swedish (Svenska)",
    "pl": "Polish (Polski)",
    "ja": "Japanese (日本語)",
}

NATIVE_NAMES: Dict[str, str] = {
    "es": "Español", "fr": "Français", "de": "Deutsch", "pt": "Português",
    "it": "Italiano", "nl": "Nederlands", "sv": "Svenska", "pl": "Polski",
    "ja": "日本語",
}

BATCH_SIZE = 25
CONCURRENCY = 4

_THINK_RE = re.compile(r"<think>.*?</think>", flags=re.S)

SYSTEM = (
    "You are a professional software localiser. You translate UI strings for a "
    "marketing-video SaaS product. Rules:\n"
    "1. Reply with a single JSON object mapping each given key to its translation. "
    "Nothing else — no prose, no markdown fences.\n"
    "2. Preserve every {{placeholder}} exactly as written.\n"
    "3. Preserve leading/trailing punctuation, arrows (→ ←), middots (·), ellipses (…) "
    "and em dashes (—) that appear in the source.\n"
    "4. Do NOT translate brand or product names: MarketingForge, MiniMax, MiniMax-M3, "
    "MiniMax-H3, GPT-Image-2.0, wavespeed, agent-browser, Cloudflare R2, AWS S3, "
    "Meta Ads, TikTok, Stripe, SSO, CTA, API, 2FA, llms.txt, CMS, SaaS, VO, CSM.\n"
    "5. Keep translations concise — these are buttons, labels and headings in a UI.\n"
    "6. Units like '15s', '$49', '+24%' keep their numbers and symbols."
)


def strip_think(text: str) -> str:
    return _THINK_RE.sub("", text or "").strip()


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model response."""
    text = strip_think(text)
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"no JSON object in response: {text[:200]!r}")
    return json.loads(text[start:end + 1])


async def translate_batch(
    client: httpx.AsyncClient, base: str, key: str, model: str,
    lang_code: str, lang_name: str, batch: Dict[str, str],
) -> Dict[str, str]:
    user = (
        f"Translate these UI strings from English into {lang_name}.\n"
        f"Return a JSON object with exactly these {len(batch)} keys:\n\n"
        + json.dumps(batch, ensure_ascii=False, indent=1)
    )
    for attempt in range(4):
        try:
            r = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": SYSTEM},
                        {"role": "user", "content": user},
                    ],
                },
            )
            r.raise_for_status()
            out = extract_json(r.json()["choices"][0]["message"]["content"])
            # Keep only the keys we asked for, and only non-empty strings.
            return {
                k: v.strip() for k, v in out.items()
                if k in batch and isinstance(v, str) and v.strip()
            }
        except Exception as exc:  # noqa: BLE001 - best-effort with retries
            print(f"  [{lang_code}] batch retry {attempt + 1}: {type(exc).__name__}: {exc}")
            await asyncio.sleep(2 * (attempt + 1))
    return {}


async def translate_language(
    client: httpx.AsyncClient, base: str, key: str, model: str,
    lang_code: str, source: Dict[str, str], existing: Dict[str, str],
    sem: asyncio.Semaphore,
) -> Dict[str, str]:
    todo = {k: v for k, v in source.items() if k not in existing}
    if not todo:
        print(f"[{lang_code}] already complete ({len(existing)} keys)")
        return existing

    items = list(todo.items())
    batches = [dict(items[i:i + BATCH_SIZE]) for i in range(0, len(items), BATCH_SIZE)]
    print(f"[{lang_code}] translating {len(todo)} keys in {len(batches)} batches")

    async def run(b: Dict[str, str]) -> Dict[str, str]:
        async with sem:
            return await translate_batch(client, base, key, model, lang_code, LANGUAGES[lang_code], b)

    results = await asyncio.gather(*(run(b) for b in batches))

    merged = dict(existing)
    for res in results:
        merged.update(res)

    missing = [k for k in source if k not in merged]
    if missing:
        print(f"[{lang_code}] WARNING: {len(missing)} keys still missing: {missing[:5]}")
    return merged


def write_bundle(lang: str, source: Dict[str, str], translations: Dict[str, str]) -> int:
    """Write the bundle in the same key order as en.json."""
    bundle: Dict[str, object] = {
        "_meta": {"code": lang, "name": NATIVE_NAMES[lang], "rtl": False}
    }
    for k in source:
        # Fall back to English so the bundle is never structurally incomplete.
        bundle[k] = translations.get(k, source[k])
    path = I18N_DIR / f"{lang}.json"
    path.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sum(1 for k in source if k in translations)


async def main() -> int:
    api_key = os.getenv("MINIMAX_API_KEY", "")
    if not api_key:
        print("MINIMAX_API_KEY is not set", file=sys.stderr)
        return 1
    base = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
    model = os.getenv("MINIMAX_MODEL", "MiniMax-M3")

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    force = "--force" in sys.argv
    targets = args or list(LANGUAGES)

    en = json.loads((I18N_DIR / "en.json").read_text(encoding="utf-8"))
    source = {k: v for k, v in en.items() if k != "_meta"}
    print(f"source: {len(source)} keys -> {targets}")

    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(timeout=180.0) as client:
        for lang in targets:
            existing: Dict[str, str] = {}
            path = I18N_DIR / f"{lang}.json"
            if path.is_file() and not force:
                prev = json.loads(path.read_text(encoding="utf-8"))
                # Reuse only real translations (i.e. values that differ from English).
                existing = {
                    k: v for k, v in prev.items()
                    if k != "_meta" and k in source and isinstance(v, str) and v != source[k]
                }
            done = await translate_language(client, base, api_key, model, lang, source, existing, sem)
            n = write_bundle(lang, source, done)
            print(f"[{lang}] wrote {path.name}: {n}/{len(source)} translated")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
