"""Thin wrapper around Demucs v4 (htdemucs) for vocal/instrumental separation."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

# Demucs CLI uses torchaudio.save which requires torchcodec under torch ≥ 2.5.
# In the Docker image we install matching torchcodec+ffmpeg so the main
# Python env can run demucs directly. For host dev (e.g. dev container that
# kept torch 2.10 but no matching torchcodec), set ``DEMUCS_PYTHON`` to a
# separate venv's interpreter (typical: an HQ-SVC venv with torch 2.0).
_DEMUCS_PY_ENV = os.environ.get("DEMUCS_PYTHON")


def _resolve_python() -> str:
    if _DEMUCS_PY_ENV and os.path.exists(_DEMUCS_PY_ENV):
        return _DEMUCS_PY_ENV
    return sys.executable


def separate(
    wav_path: Path,
    out_dir: Path,
    model: str = "htdemucs",
    two_stems: bool = True,
) -> dict[str, Path]:
    """Run Demucs and place ``vocals.wav`` / ``instrumental.wav`` in ``out_dir``.

    Returns a dict ``{"vocals": Path, "instrumental": Path}``.
    Skips re-running if both outputs already exist.
    """
    wav_path = Path(wav_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    vocals_out = out_dir / "vocals.wav"
    inst_out = out_dir / "instrumental.wav"
    if vocals_out.exists() and inst_out.exists():
        return {"vocals": vocals_out, "instrumental": inst_out}

    work_dir = out_dir / "_demucs_tmp"
    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        _resolve_python(),
        "-m",
        "demucs.separate",
        "-n",
        model,
        "-o",
        str(work_dir),
        str(wav_path),
    ]
    if two_stems:
        cmd.extend(["--two-stems", "vocals"])

    subprocess.run(cmd, check=True)

    stem_dir = work_dir / model / wav_path.stem
    src_vocals = stem_dir / "vocals.wav"
    src_other = stem_dir / "no_vocals.wav" if two_stems else stem_dir / "other.wav"
    if not src_vocals.exists() or not src_other.exists():
        raise RuntimeError(f"Demucs outputs missing under {stem_dir}")

    shutil.move(str(src_vocals), vocals_out)
    shutil.move(str(src_other), inst_out)
    shutil.rmtree(work_dir, ignore_errors=True)
    return {"vocals": vocals_out, "instrumental": inst_out}
