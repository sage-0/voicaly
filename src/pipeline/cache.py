"""Hash-based persistent cache for pipeline intermediates.

Layout::

    cache/<audio_hash>/
        vocals.wav  instrumental.wav  f0.npy  times.npy
        speaker_ckpt/G_xxx.pth
    cache/<audio_hash>/<lyrics_hash>/
        translation.json  tts_lines/*.wav  english_vocals.wav  final.wav
"""

from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CACHE_ROOT = Path("cache")


def _sha1(data: bytes, length: int = 16) -> str:
    return hashlib.sha1(data).hexdigest()[:length]


def audio_hash(audio_path: Path) -> str:
    return _sha1(Path(audio_path).read_bytes(), 16)


def lyrics_hash(lyrics_text: str) -> str:
    return _sha1(lyrics_text.encode("utf-8"), 8)


@dataclass
class CachePaths:
    audio_dir: Path
    lyrics_dir: Path

    @property
    def vocals(self) -> Path:
        return self.audio_dir / "vocals.wav"

    @property
    def instrumental(self) -> Path:
        return self.audio_dir / "instrumental.wav"

    @property
    def f0(self) -> Path:
        return self.audio_dir / "f0.npy"

    @property
    def times(self) -> Path:
        return self.audio_dir / "times.npy"

    @property
    def speaker_ckpt_dir(self) -> Path:
        return self.audio_dir / "speaker_ckpt"

    @property
    def translation(self) -> Path:
        return self.lyrics_dir / "translation.json"

    @property
    def tts_lines_dir(self) -> Path:
        return self.lyrics_dir / "tts_lines"

    @property
    def english_vocals(self) -> Path:
        return self.lyrics_dir / "english_vocals.wav"

    @property
    def final(self) -> Path:
        return self.lyrics_dir / "final.wav"


def get_paths(audio_path: Path, lyrics_text: str, root: Path = CACHE_ROOT) -> CachePaths:
    a_key = audio_hash(audio_path)
    l_key = lyrics_hash(lyrics_text)
    audio_dir = root / a_key
    lyrics_dir = audio_dir / l_key
    audio_dir.mkdir(parents=True, exist_ok=True)
    lyrics_dir.mkdir(parents=True, exist_ok=True)
    (audio_dir / "speaker_ckpt").mkdir(exist_ok=True)
    (lyrics_dir / "tts_lines").mkdir(exist_ok=True)
    return CachePaths(audio_dir=audio_dir, lyrics_dir=lyrics_dir)


def list_audio_entries(root: Path = CACHE_ROOT) -> list[dict]:
    if not root.exists():
        return []
    out = []
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        size = sum(p.stat().st_size for p in d.rglob("*") if p.is_file())
        out.append({"key": d.name, "path": str(d), "size_bytes": size})
    return out


def clear_entry(key: str, root: Path = CACHE_ROOT) -> bool:
    target = root / key
    if target.exists():
        shutil.rmtree(target)
        return True
    return False


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)
