"""Preset management for the Utaime pipeline.

Presets bundle a list of ACE-Step candidates together with post-FX settings
so the user can reproduce a specific generation configuration at will.

Storage layout
--------------
Built-in presets are hardcoded in BUILTIN_PRESETS and are always available,
immutable (cannot be overwritten or deleted), and returned first in list
responses.

User-created presets are persisted as a JSON array at USER_PRESETS_PATH
(``/app/cache/user_presets.json``).  The file is created automatically on
first save; a missing file is treated as an empty list.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel

logger = logging.getLogger("utaime.presets")

# ---------------------------------------------------------------------------
# Pydantic schema  (must stay in sync with the frontend TypeScript types)
# ---------------------------------------------------------------------------


class PresetCandidate(BaseModel):
    mode: str = "lego"
    seed: int
    strength: float
    vocal_db: int  # 0, -6, -12, etc.


class Preset(BaseModel):
    id: str
    name: str
    builtin: bool = False
    created_at: str = ""
    candidates: list[PresetCandidate]
    post_fx_enabled: bool
    post_fx_consonant_boost_db: float = 2.5
    post_fx_breath_level_db: float = -28.0


# ---------------------------------------------------------------------------
# Built-in presets (hardcoded; id and candidates are the authoritative values)
# ---------------------------------------------------------------------------

_BUILTIN_CANDIDATES: list[dict[str, Any]] = [
    {"mode": "lego", "seed": 42,   "strength": 0.45, "vocal_db": 0},
    {"mode": "lego", "seed": 42,   "strength": 0.45, "vocal_db": -6},
    {"mode": "lego", "seed": 42,   "strength": 0.45, "vocal_db": -12},
    {"mode": "lego", "seed": 42,   "strength": 0.50, "vocal_db": -6},
    {"mode": "lego", "seed": 42,   "strength": 0.50, "vocal_db": -12},
    {"mode": "lego", "seed": 42,   "strength": 0.40, "vocal_db": -6},
    {"mode": "lego", "seed": 777,  "strength": 0.45, "vocal_db": -6},
    {"mode": "lego", "seed": 2718, "strength": 0.45, "vocal_db": -6},
    {"mode": "lego", "seed": 99,   "strength": 0.45, "vocal_db": -12},
    {"mode": "lego", "seed": 1234, "strength": 0.45, "vocal_db": -6},
]

BUILTIN_PRESETS: list[dict[str, Any]] = [
    {
        "id": "builtin-final-v6db",
        "name": "FINAL_v6dB Original",
        "builtin": True,
        "created_at": "",
        "candidates": _BUILTIN_CANDIDATES,
        "post_fx_enabled": False,
        "post_fx_consonant_boost_db": 2.5,
        "post_fx_breath_level_db": -28.0,
    },
    {
        "id": "builtin-postfx-enhanced",
        "name": "Post-FX Enhanced (子音強調 + ブレス)",
        "builtin": True,
        "created_at": "",
        "candidates": _BUILTIN_CANDIDATES,
        "post_fx_enabled": True,
        "post_fx_consonant_boost_db": 2.5,
        "post_fx_breath_level_db": -28.0,
    },
]

# Set of built-in IDs for fast membership checks
_BUILTIN_IDS: frozenset[str] = frozenset(p["id"] for p in BUILTIN_PRESETS)

# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

USER_PRESETS_PATH = Path("/app/cache/user_presets.json")


def _load_user_presets() -> list[dict[str, Any]]:
    """Read persisted user presets from disk. Returns empty list on any error."""
    if not USER_PRESETS_PATH.exists():
        return []
    try:
        data = json.loads(USER_PRESETS_PATH.read_text("utf-8"))
        if isinstance(data, list):
            return data
        logger.warning("user_presets.json is not a list; resetting")
        return []
    except Exception as exc:
        logger.error("Failed to load user_presets.json: %s", exc)
        return []


def _save_user_presets(presets: list[dict[str, Any]]) -> None:
    """Persist user presets to disk atomically (write + rename)."""
    USER_PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = USER_PRESETS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(presets, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(USER_PRESETS_PATH)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def list_presets() -> list[dict[str, Any]]:
    """Return built-in presets first, then user-created presets."""
    return list(BUILTIN_PRESETS) + _load_user_presets()


def get_preset(preset_id: str) -> dict[str, Any] | None:
    """Look up a preset by id. Returns None if not found."""
    for p in list_presets():
        if p["id"] == preset_id:
            return p
    return None


def save_preset(preset_dict: dict[str, Any]) -> dict[str, Any]:
    """Persist a new user preset.

    - ``id`` is auto-generated (uuid4 hex[:12]) — any caller-supplied id is
      replaced.
    - ``created_at`` is set to the current UTC ISO datetime.
    - Built-in ids cannot be used; attempting to use one raises ValueError.
    - Returns the saved preset dict (with generated id and created_at).
    """
    new_id = uuid4().hex[:12]
    if new_id in _BUILTIN_IDS:
        # Astronomically unlikely but guard anyway
        new_id = uuid4().hex[:12]

    preset_dict = dict(preset_dict)
    preset_dict["id"] = new_id
    preset_dict["builtin"] = False
    preset_dict["created_at"] = datetime.now(timezone.utc).isoformat()

    # Validate via Pydantic before persisting
    validated = Preset(**preset_dict)
    record = validated.model_dump()

    user_presets = _load_user_presets()
    user_presets.append(record)
    _save_user_presets(user_presets)
    logger.info("Saved user preset id=%s name=%r", record["id"], record["name"])
    return record


def delete_preset(preset_id: str) -> None:
    """Delete a user preset by id.

    Raises:
        ValueError: if preset_id belongs to a built-in preset.
        KeyError:   if preset_id is not found among user presets.
    """
    if preset_id in _BUILTIN_IDS:
        raise ValueError(f"Built-in preset '{preset_id}' cannot be deleted")

    user_presets = _load_user_presets()
    new_list = [p for p in user_presets if p["id"] != preset_id]
    if len(new_list) == len(user_presets):
        raise KeyError(f"Preset '{preset_id}' not found")

    _save_user_presets(new_list)
    logger.info("Deleted user preset id=%s", preset_id)
