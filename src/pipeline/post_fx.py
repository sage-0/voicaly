"""Post-processing FX on the ACE-Step extracted vocal track.

Two stages, both intentionally mild to avoid sounding artificial:
  1. Consonant enhancer: detects high-frequency transients (>3 kHz) using
     an envelope follower and boosts them by ~2-3 dB so English plosives
     stand out against the smooth Japanese-vocal attack the model picked up.
  2. Breath insertion: detects silence runs >=200 ms preceded by audio,
     overlays a synthetic bandpass-noise breath (300-2500 Hz, ~-28 dBFS)
     at the start of each so phrase boundaries feel alive.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal


def enhance_consonants(
    audio: np.ndarray,
    sr: int,
    cutoff_hz: float = 3000.0,
    boost_db: float = 2.5,
    release_ms: float = 20.0,
) -> np.ndarray:
    """高域 transient (>cutoff_hz) を envelope follower で検出して boost_db だけ強調。

    実装: HPF で >3kHz を抽出 → ブースト → 原音と合成 (差分 50% blend で過剰回避)。
    """
    if audio.size == 0:
        return audio
    sos = signal.butter(4, cutoff_hz / (sr / 2), btype="highpass", output="sos")
    hp = signal.sosfilt(sos, audio).astype(np.float32)
    boost = 10 ** (boost_db / 20.0)
    enhanced_hp = hp * boost
    return (audio + (enhanced_hp - hp) * 0.5).astype(np.float32)


def _synthesize_breath(
    n_samples: int,
    sr: int,
    low_hz: float = 300.0,
    high_hz: float = 2500.0,
    seed: int | None = None,
) -> np.ndarray:
    """帯域制限ノイズ (300-2500 Hz) に短い attack-release エンベロープを掛けた合成ブレス。"""
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n_samples).astype(np.float32)
    sos = signal.butter(
        4,
        [low_hz / (sr / 2), high_hz / (sr / 2)],
        btype="bandpass",
        output="sos",
    )
    noise = signal.sosfilt(sos, noise).astype(np.float32)
    env = np.ones(n_samples, dtype=np.float32)
    a = int(n_samples * 0.3)
    r = n_samples - a
    if a > 0:
        env[:a] = np.linspace(0.0, 1.0, a)
    if r > 0:
        env[a:] = np.linspace(1.0, 0.0, r)
    return noise * env


def insert_breaths(
    audio: np.ndarray,
    sr: int,
    threshold_db: float = -45.0,
    min_silence_ms: float = 200.0,
    breath_duration_ms: float = 150.0,
    breath_level_db: float = -28.0,
    rms_window_ms: float = 20.0,
) -> np.ndarray:
    """RMS が threshold_db を下回る区間が min_silence_ms 以上続く場所の先頭にブレスを挿入。

    silence の直前に音 (歌) があった場合だけ挿入する (曲頭の長い無音には入れない)。
    """
    if audio.size == 0:
        return audio
    win = max(1, int(sr * rms_window_ms / 1000.0))
    sq = (audio.astype(np.float32)) ** 2
    rms = np.sqrt(
        np.convolve(sq, np.ones(win, dtype=np.float32) / win, mode="same") + 1e-10
    )
    rms_db = 20.0 * np.log10(rms + 1e-10)
    silent = rms_db < threshold_db

    out = audio.copy().astype(np.float32)
    breath_n = int(sr * breath_duration_ms / 1000.0)
    min_silence_n = int(sr * min_silence_ms / 1000.0)
    breath_amp = 10 ** (breath_level_db / 20.0)

    # silence runs を検出
    in_silence = False
    start = 0
    for i in range(len(silent)):
        if silent[i] and not in_silence:
            start = i
            in_silence = True
        elif not silent[i] and in_silence:
            duration = i - start
            # 直前に音があったか (start > 0 で前のサンプルが silent ではない)
            if duration >= min_silence_n and start > 0 and not silent[start - 1]:
                end = min(start + breath_n, len(out))
                br = _synthesize_breath(end - start, sr, seed=start) * breath_amp
                out[start:end] += br
            in_silence = False
    return out


def process_vocal(
    in_wav: Path,
    out_wav: Path,
    consonant_boost_db: float = 2.5,
    breath_level_db: float = -28.0,
) -> Path:
    """Apply consonant enhancer + breath insertion to a vocal wav."""
    if out_wav.exists():
        return out_wav
    audio, sr = sf.read(str(in_wav), dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = audio.mean(axis=1).astype(np.float32)
    audio = enhance_consonants(audio, sr, boost_db=consonant_boost_db)
    audio = insert_breaths(audio, sr, breath_level_db=breath_level_db)
    # peak normalize (1.0 を超えるとクリップ)
    peak = float(np.max(np.abs(audio))) or 1.0
    if peak > 1.0:
        audio = (audio / peak * 0.98).astype(np.float32)
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_wav), audio, sr, subtype="PCM_16")
    return out_wav
