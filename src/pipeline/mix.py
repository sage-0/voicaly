"""Mix the cloned vocals back over the separated instrumental."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


def _read_mono(path: Path, sr_target: int) -> tuple[np.ndarray, int]:
    data, sr = sf.read(str(path), always_2d=False)
    if data.ndim == 2:
        data = data.mean(axis=1)
    if sr != sr_target:
        n_dst = int(round(len(data) * sr_target / sr))
        data = np.interp(
            np.linspace(0, len(data) - 1, n_dst),
            np.arange(len(data)),
            data,
        ).astype(np.float32)
    return data.astype(np.float32), sr_target


def mix_tracks(
    vocals_wav: Path,
    instrumental_wav: Path,
    out_path: Path,
    sr: int = 44100,
    vocal_gain_db: float = 6.0,
    inst_gain_db: float = -3.0,
) -> Path:
    """Sum cloned vocals and instrumental into a single mastered wav."""
    v, _ = _read_mono(Path(vocals_wav), sr)
    i, _ = _read_mono(Path(instrumental_wav), sr)
    n = max(len(v), len(i))
    if len(v) < n:
        v = np.pad(v, (0, n - len(v)))
    if len(i) < n:
        i = np.pad(i, (0, n - len(i)))

    v *= 10 ** (vocal_gain_db / 20)
    i *= 10 ** (inst_gain_db / 20)
    mix = v + i

    peak = float(np.max(np.abs(mix))) or 1.0
    if peak > 1.0:
        mix = (mix / peak * 0.98).astype(np.float32)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), mix, sr, subtype="PCM_16")
    return out_path
