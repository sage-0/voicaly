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

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("utaime.presets")

# Allowlist of ACE-Step model config_path values. AceStepHandler resolves this
# against the project_root (a directory mounted from a private path), so an
# unfiltered string would let a remote caller traverse the filesystem (e.g.
# ace_config="../../etc/passwd"). Restrict to the three configs we actually
# ship in /app/models/ace-step-v1.5/.
ALLOWED_ACE_CONFIGS: frozenset[str] = frozenset({
    "acestep-v15-turbo",
    "acestep-v15-xl-turbo",
    "acestep-v15-sft",
})

# Allowlist for src_kind. "full" feeds the original uploaded mix; "vocals"
# feeds the Demucs-separated vocal stem. Anything else would silently fall
# through to "full" in the orchestrator, so we reject it up front.
ALLOWED_SRC_KINDS: frozenset[str] = frozenset({"full", "vocals"})

# ---------------------------------------------------------------------------
# Pydantic schema  (must stay in sync with the frontend TypeScript types)
# ---------------------------------------------------------------------------


class PresetCandidate(BaseModel):
    mode: str = "lego"
    seed: int = Field(ge=0, le=2**31 - 1)
    strength: float = Field(ge=0.0, le=1.0)
    vocal_db: int = Field(ge=-24, le=0)

    @field_validator("mode")
    @classmethod
    def _validate_mode(cls, v: str) -> str:
        if v not in ("lego", "cover"):
            raise ValueError(f"mode must be 'lego' or 'cover', got {v!r}")
        return v


# Caption library — the orchestrator picks one of these strings based on
# Preset.caption_style. Adding a key here also requires the orchestrator to
# accept it.
CAPTION_STYLES: dict[str, str] = {
    "baseline": (
        "Female English vocals following the melody of the source audio exactly, "
        "expressive J-pop performance, every English line sung at the same "
        "pitch and timing as the original Japanese vocal"
    ),
    "articulation": (
        "Crystal-clear female English vocals with sharp consonants, crisp "
        "articulation, every vowel pronounced distinctly, and well-pronounced "
        "English words, following the melody and rhythm of the source audio "
        "exactly, expressive J-pop performance, every English line sung at the "
        "same pitch and timing as the original Japanese vocal"
    ),
}


class Preset(BaseModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")
    name: str = Field(min_length=1, max_length=200)
    builtin: bool = False
    created_at: str = Field(default="", max_length=64)
    candidates: list[PresetCandidate] = Field(min_length=1, max_length=64)
    post_fx_enabled: bool
    # Audible safety: boost above ~10 dB clips, breath above -10 dBFS is louder
    # than the vocal. Bound them so the UI sliders match what's safe to render.
    post_fx_consonant_boost_db: float = Field(default=2.5, ge=0.0, le=12.0)
    post_fx_breath_level_db: float = Field(default=-28.0, ge=-60.0, le=-10.0)

    # --- ACE-Step model + sampler fields (added 2026-05-29) -----------------
    # Defaults reproduce the historical FINAL_v6dB behaviour so older
    # user_presets.json files without these keys load and run unchanged.
    ace_config: str = "acestep-v15-turbo"
    # inference_steps capped at 200: at steps=50 we already see ~20s per song;
    # 999999 would be a trivial GPU-DoS for any anonymous caller.
    inference_steps: int = Field(default=16, ge=4, le=200)
    # shift is the noise-schedule warp factor; ACE-Step is only validated in
    # roughly [0.5, 4.0]. Below 0.5 the schedule degenerates; above 4 the
    # output is unusable noise.
    shift: float = Field(default=1.0, ge=0.5, le=4.0)
    # cfg_interval is a sub-interval of [0,1] denoting which fraction of the
    # diffusion trajectory CFG is applied over; values outside this range are
    # undefined in ACE-Step.
    cfg_interval_start: float = Field(default=0.0, ge=0.0, le=1.0)
    cfg_interval_end: float = Field(default=1.0, ge=0.0, le=1.0)
    # guidance_scale practical range. <1 disables CFG, >15 produces severe
    # robotic artefacts.
    guidance_scale: float = Field(default=7.0, ge=1.0, le=15.0)
    caption_style: str = "baseline"
    src_kind: str = "full"

    @field_validator("ace_config")
    @classmethod
    def _validate_ace_config(cls, v: str) -> str:
        if v not in ALLOWED_ACE_CONFIGS:
            raise ValueError(
                f"ace_config must be one of {sorted(ALLOWED_ACE_CONFIGS)}, got {v!r}"
            )
        return v

    @field_validator("caption_style")
    @classmethod
    def _validate_caption_style(cls, v: str) -> str:
        # Re-resolved at validation time from the (mutable) CAPTION_STYLES dict.
        if v not in CAPTION_STYLES:
            raise ValueError(
                f"caption_style must be one of {sorted(CAPTION_STYLES.keys())}, got {v!r}"
            )
        return v

    @field_validator("src_kind")
    @classmethod
    def _validate_src_kind(cls, v: str) -> str:
        if v not in ALLOWED_SRC_KINDS:
            raise ValueError(
                f"src_kind must be one of {sorted(ALLOWED_SRC_KINDS)}, got {v!r}"
            )
        return v

    @field_validator("cfg_interval_end")
    @classmethod
    def _validate_cfg_interval_end(cls, v: float, info) -> float:
        # info.data has the previously-validated fields. Ensure end >= start.
        start = info.data.get("cfg_interval_start", 0.0)
        if v < start:
            raise ValueError(
                f"cfg_interval_end ({v}) must be >= cfg_interval_start ({start})"
            )
        return v


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

# Single-candidate sweep used by the new built-ins: one seed, one strength.
# These presets rely on the right model + shift/cfg combo rather than a
# best-of-N search.
_SINGLE_CAND_42_035: list[dict[str, Any]] = [
    {"mode": "lego", "seed": 42, "strength": 0.35, "vocal_db": 0},
]
_SINGLE_CAND_42_060: list[dict[str, Any]] = [
    {"mode": "lego", "seed": 42, "strength": 0.60, "vocal_db": 0},
]

BUILTIN_PRESETS: list[dict[str, Any]] = [
    # -------------------------------------------------------------------
    # Legacy presets (kept for backward compatibility / reference)
    # -------------------------------------------------------------------
    {
        "id": "builtin-final-v6db",
        "name": "FINAL_v6dB Original (2B turbo, str=0.45)",
        "builtin": True,
        "created_at": "",
        "candidates": _BUILTIN_CANDIDATES,
        "post_fx_enabled": False,
        "post_fx_consonant_boost_db": 2.5,
        "post_fx_breath_level_db": -28.0,
        # legacy defaults (FINAL_v6dB):
        "ace_config": "acestep-v15-turbo",
        "inference_steps": 16,
        "shift": 1.0,
        "cfg_interval_start": 0.0,
        "cfg_interval_end": 1.0,
        "guidance_scale": 7.0,
        "caption_style": "baseline",
        "src_kind": "full",
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
        "ace_config": "acestep-v15-turbo",
        "inference_steps": 16,
        "shift": 1.0,
        "cfg_interval_start": 0.0,
        "cfg_interval_end": 1.0,
        "guidance_scale": 7.0,
        "caption_style": "baseline",
        "src_kind": "full",
    },

    # -------------------------------------------------------------------
    # New presets discovered in the 2026-05-21 → 2026-05-29 sweep series
    # -------------------------------------------------------------------
    {
        # SFT (non-turbo) base model + V7-style sampler. Highest pitch_r for
        # hananinatte in our sweeps (r=0.57 vs V7's 0.25). Best for clean
        # in-distribution J-pop tracks. Single candidate (no best-of-N) keeps
        # inference under a minute even at steps=50.
        "id": "builtin-sft-pop",
        "name": "SFT base 高品質 J-pop (steps=50, hananinatte-class)",
        "builtin": True,
        "created_at": "",
        "candidates": _SINGLE_CAND_42_035,
        "post_fx_enabled": True,
        "post_fx_consonant_boost_db": 5.0,
        "post_fx_breath_level_db": -24.0,
        "ace_config": "acestep-v15-sft",
        "inference_steps": 50,
        "shift": 2.0,
        "cfg_interval_start": 0.0,
        "cfg_interval_end": 0.8,
        "guidance_scale": 7.0,
        "caption_style": "articulation",
        "src_kind": "full",
    },
    {
        # XL turbo with shift=2.0 + cfg_interval=[0,0.8] + str=0.35.
        # Faster than SFT, cleaner English than the FINAL_v6dB baseline. Use
        # this when you want lower latency and the song is reasonably in
        # distribution.
        "id": "builtin-xl-clear",
        "name": "XL turbo クリア発音 (shift=2.0, steps=24)",
        "builtin": True,
        "created_at": "",
        "candidates": _SINGLE_CAND_42_035,
        "post_fx_enabled": True,
        "post_fx_consonant_boost_db": 2.5,
        "post_fx_breath_level_db": -28.0,
        "ace_config": "acestep-v15-xl-turbo",
        "inference_steps": 24,
        "shift": 2.0,
        "cfg_interval_start": 0.0,
        "cfg_interval_end": 0.8,
        "guidance_scale": 7.0,
        "caption_style": "articulation",
        "src_kind": "full",
    },
    {
        # vocals-only src + high strength. The original vocal track (Demucs
        # separated) is fed in directly, forcing the model to hug the
        # original melody. Higher Japanese-phoneme leak, lower voice quality
        # — only use for OOD songs where the standard presets drift in pitch.
        # On the Niki "lower" cover this was the only config that produced
        # an audibly correct melody.
        "id": "builtin-ood-vocals",
        "name": "OOD 楽曲用 (vocals-only src, str=0.60)",
        "builtin": True,
        "created_at": "",
        "candidates": _SINGLE_CAND_42_060,
        "post_fx_enabled": True,
        "post_fx_consonant_boost_db": 2.5,
        "post_fx_breath_level_db": -28.0,
        "ace_config": "acestep-v15-xl-turbo",
        "inference_steps": 24,
        "shift": 2.0,
        "cfg_interval_start": 0.0,
        "cfg_interval_end": 0.8,
        "guidance_scale": 7.0,
        "caption_style": "articulation",
        "src_kind": "vocals",
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
