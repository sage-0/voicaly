"""Normalize the LyricsTranslator output into a stable schema.

Canonical schema (one row per non-empty source line)::

    {"japanese": str, "mora_count": int, "english": str}

Accepts either the raw dict-list emitted by ``LyricsTranslator.translate``
or a free-form string that may contain JSON, code fences, or junk preamble.
Never raises; on hard failure returns an empty list.
"""

from __future__ import annotations

import json
import re
from typing import Any

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.MULTILINE)
_JSON_BLOCK_RE = re.compile(r"(\[.*\]|\{.*\})", re.DOTALL)
_PREAMBLE_RE = re.compile(
    r"^\s*(here is|here are|sure|certainly|translation|output)\b.*?:\s*",
    re.IGNORECASE,
)

_JA_KEYS = ("japanese", "ja", "jp", "original_japanese", "source")
_EN_KEYS = ("english", "en", "english_translation", "translation", "target")
_MORA_KEYS = ("mora_count", "target_syllables", "syllables", "mora")


def _pick(d: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return None


def _strip_preamble(text: str) -> str:
    text = text.strip()
    fence = _CODE_FENCE_RE.search(text)
    if fence:
        text = fence.group(1).strip()
    text = _PREAMBLE_RE.sub("", text).strip()
    return text


def _try_json(text: str):
    try:
        return json.loads(text)
    except Exception:
        pass
    block = _JSON_BLOCK_RE.search(text)
    if block:
        try:
            return json.loads(block.group(1))
        except Exception:
            return None
    return None


def _normalize_row(row: Any, mora_counter=None) -> dict | None:
    if not isinstance(row, dict):
        return None
    ja = _pick(row, _JA_KEYS) or ""
    en = _pick(row, _EN_KEYS) or ""
    mora = _pick(row, _MORA_KEYS)

    if isinstance(en, str):
        en = re.sub(r"\s+", " ", en.replace("\r", " ").replace("\n", " ")).strip()
        en = en.strip("`'\" ")
    if isinstance(ja, str):
        ja = ja.strip()

    if not ja and not en:
        return None

    if not isinstance(mora, int):
        if mora_counter is not None and ja:
            try:
                mora = int(mora_counter(ja))
            except Exception:
                mora = 0
        else:
            try:
                mora = int(mora) if mora is not None else 0
            except Exception:
                mora = 0

    return {"japanese": ja, "mora_count": int(mora), "english": en}


def parse_translation(raw, mora_counter=None) -> list[dict]:
    """Coerce translator output into the canonical schema.

    ``mora_counter`` is an optional callable ``str -> int`` (e.g.
    ``LyricsTranslator.count_mora``) used to fill missing mora counts.
    """
    rows: list[Any] = []

    if isinstance(raw, list):
        rows = raw
    elif isinstance(raw, dict):
        rows = [raw]
    elif isinstance(raw, str):
        text = _strip_preamble(raw)
        parsed = _try_json(text)
        if isinstance(parsed, list):
            rows = parsed
        elif isinstance(parsed, dict):
            rows = [parsed]
        else:
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                rows.append({"english": line})

    out: list[dict] = []
    for row in rows:
        norm = _normalize_row(row, mora_counter=mora_counter)
        if norm is not None:
            out.append(norm)
    return out
