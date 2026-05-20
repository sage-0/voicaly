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


def compress_envelope(
    audio: np.ndarray,
    sr: int,
    window_ms: float = 50.0,
    target_rms: float = 0.1,
    max_gain: float = 4.0,
    min_gain: float = 0.5,
) -> np.ndarray:
    """短時間 RMS を target_rms に正規化することで vocal のダイナミックレンジを圧縮する。

    silence (RMS ≈ 0) で max_gain になっても無音 × 大きいゲイン ≈ 無音なので問題ない。
    break 区間 (vocal は小さいが非ゼロ) では max_gain で持ち上げられて密度を保つ。

    Parameters
    ----------
    audio:
        モノラル float32 波形。
    sr:
        サンプルレート (Hz)。
    window_ms:
        短時間 RMS を計算するウィンドウ幅 (ms)。50 ms は歌唱の syllable 1 個分に対応。
    target_rms:
        目標 RMS レベル (0〜1)。0.1 はフルスケールの −20 dBFS 相当。
    max_gain:
        silence 付近での暴走防止クリップ上限。4.0 = +12 dB。
    min_gain:
        ピーク区間への過度な圧縮を防ぐ下限。0.5 = −6 dB。

    Returns
    -------
    np.ndarray
        圧縮後の float32 波形。入力と同じ長さ。
    """
    win = max(1, int(sr * window_ms / 1000.0))
    sq = audio.astype(np.float32) ** 2
    kernel = np.ones(win, dtype=np.float32) / win
    rms = np.sqrt(np.convolve(sq, kernel, mode="same") + 1e-10)
    gain = np.clip(target_rms / rms, min_gain, max_gain)
    return (audio * gain).astype(np.float32)


def mix_tracks_with_vocal_compression(
    vocals_wav: Path,
    instrumental_wav: Path,
    out_path: Path,
    sr: int = 44100,
    vocal_gain_db: float = -6.0,
    inst_gain_db: float = 0.0,
) -> Path:
    """vocals を compress_envelope で均一化 → vocal_gain_db を適用 → instrumental とミックス。

    既存の mix_tracks と異なり、vocals に compressor を通すことで break 区間の密度を保つ。
    ACE-Step の src_audio として渡す「ボーカル抑制版」を生成する際に使用する。

    Parameters
    ----------
    vocals_wav:
        Demucs で分離した日本語ボーカル wav。
    instrumental_wav:
        Demucs で分離したインストゥルメンタル wav。
    out_path:
        出力先 wav パス。親ディレクトリが存在しない場合は自動生成する。
    sr:
        出力サンプルレート (Hz)。読み込み時に必要に応じてリサンプルする。
    vocal_gain_db:
        compressor 後に vocals 全体にかける減衰量 (dB)。通常は負値 (例: -6.0)。
    inst_gain_db:
        instrumental 全体への gain (dB)。0.0 でレベル変化なし。

    Returns
    -------
    Path
        out_path と同一。
    """
    v, _ = _read_mono(Path(vocals_wav), sr)
    inst, _ = _read_mono(Path(instrumental_wav), sr)

    # Break 区間の音響密度を保つため compressor を通す
    v = compress_envelope(v, sr)

    n = max(len(v), len(inst))
    if len(v) < n:
        v = np.pad(v, (0, n - len(v)))
    if len(inst) < n:
        inst = np.pad(inst, (0, n - len(inst)))

    v *= 10 ** (vocal_gain_db / 20)
    inst *= 10 ** (inst_gain_db / 20)
    mix = v + inst

    peak = float(np.max(np.abs(mix))) or 1.0
    if peak > 1.0:
        mix = (mix / peak * 0.98).astype(np.float32)

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out_path), mix, sr, subtype="PCM_16")
    return out_path
