"""End-to-end pipeline v2 — ACE-Step lego based, no voice cloning.

Pipeline:
    audio + japanese lyrics
    → Demucs (1st pass) → instrumental_orig.wav
    → DPO Gemma translation (with rejection sampling for syllable count)
    → ACE-Step v1.5 lego mode (src=input audio) → ace_full.wav
    → Demucs (2nd pass on ace_full.wav) → ace_vocals.wav
    → mix(ace_vocals + instrumental_orig, +6dB / -3dB) → final.wav

Yields ``(stage, pct_0_to_1, payload)`` per stage so the Gradio UI can
render a progress bar. Cached intermediates are reused on rerun.

The voice-cloning stage (HQ-SVC / Seed-VC / OpenVoice) was evaluated and
dropped: every option degraded vocal quality more than it added speaker
character. ACE-Step's default vocalist happened to match the test song's
singer reasonably well; for other songs the speaker may differ and that
limitation is acknowledged.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterator

import numpy as np

REPO = Path(__file__).resolve().parents[2]
# Container default: bind-mount the host's model directory at /app/models.
# Override via ACE_CKPT_DIR for local-host runs.
ACE_CKPT = os.environ.get("ACE_CKPT_DIR", "/app/models/ace-step-v1.5")
ACE_LEGO_INSTRUCTION = "Generate the vocals track based on the audio context:"
ACE_LEGO_CAPTION = (
    "Female English vocals following the melody of the source audio exactly, "
    "expressive J-pop performance, every English line sung at the same "
    "pitch and timing as the original Japanese vocal"
)
ACE_LEGO_STRENGTH = 0.28
# XL turbo (5B) was empirically chosen over 2B turbo / SFT / base after a
# strength sweep on hananinatte: M_XL_seed42_str0.28.wav was the
# user-confirmed best of 30+ comparisons. The 2B turbo's "FINAL" was a
# lucky run we could not reliably reproduce; XL gives more consistent
# rhythm tracking at lower audio_cover_strength.
ACE_LEGO_CONFIG = "acestep-v15-xl-turbo"
ACE_LEGO_STEPS = 16

# Lego-only candidate sweep centred on the user-confirmed best
# (seed=42, str=0.28). Higher str makes XL leak Japanese phonetics into
# the English vocal; lower str makes singing break down. The candidates
# cluster around 0.25–0.30 across several seeds.
ACE_CANDIDATES = [
    # ★ user-confirmed best (anchor)
    ("lego", 42, 0.28),
    # close strength neighbours on the same seed
    ("lego", 42, 0.25),
    ("lego", 42, 0.27),
    ("lego", 42, 0.30),
    # alternative seeds at the sweet-spot strength
    ("lego", 777, 0.25),
    ("lego", 2718, 0.25),
    ("lego", 99, 0.25),
    ("lego", 31415, 0.25),
    ("lego", 8888, 0.25),
    ("lego", 1234, 0.25),
]

# DPO 1-shot translation was user-preferred over rejection sampling (the
# rejsamp candidates introduced repeated lines and stray meta text). Keep
# this at 1 unless we re-introduce stricter candidate filtering.
REJSAMP_N = 1
DEFAULT_DPO_MODEL = os.environ.get("DPO_MODEL_PATH", "/app/models/gemma-dpo-final")


# ---------- helpers ----------------------------------------------------


def _en_syllables(text: str) -> int:
    return len(re.findall(r"[aeiouy]+", text.lower()))


def _hash_audio(audio_path: Path) -> str:
    return hashlib.sha1(audio_path.read_bytes()).hexdigest()[:16]


def _hash_text(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def _clean_meta(text: str) -> str:
    """Strip LLM meta-commentary from a translation candidate."""
    cuts = ["How do you want", "I'm not sure", "Can you give", "Note:", "  /  /"]
    for c in cuts:
        idx = text.find(c)
        if idx >= 0:
            text = text[:idx]
    return text.strip()


# ---------- stage functions -------------------------------------------


def _stage_separate(audio_path: Path, out_dir: Path) -> tuple[Path, Path]:
    """Return ``(vocals, instrumental)``. Reuses if both wavs exist."""
    vocals = out_dir / "vocals.wav"
    inst = out_dir / "instrumental.wav"
    if vocals.exists() and inst.exists():
        return vocals, inst
    from src.separation.demucs_runner import separate

    out = separate(audio_path, out_dir)
    return out["vocals"], out["instrumental"]


def _stage_translate(
    lyrics_text: str,
    model_path: str,
    out_path: Path,
):
    """Generator yielding per-line + final translation events.

    Yields tuples ``(event_type, payload)``:
        ``("line", {idx, total, japanese, mora_count, english})`` — once per line
        ``("result", list_of_cleaned_dicts)`` — final list after sanitization

    The cleaned/sanitized result is what gets cached to disk. The per-line
    events use lightly-cleaned raw text so the UI can display them live
    before the final sanitization pass runs.
    """
    if out_path.exists():
        cached = json.loads(out_path.read_text("utf-8"))
        # Even for cached translations, replay them as line events so the
        # frontend's streaming UI behaves the same way.
        for idx, row in enumerate(cached):
            yield "line", {
                "idx": idx,
                "total": len(cached),
                "japanese": row.get("japanese", ""),
                "mora_count": row.get("mora_count", 0),
                "english": row.get("english", ""),
            }
        yield "result", cached
        return

    import torch

    from src.translator.lyrics_translator import LyricsTranslator
    from src.translator.sanitize import parse_translation

    torch.manual_seed(42)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(42)

    print(f"[translate] Loading DPO model from {model_path}", flush=True)
    tr = LyricsTranslator(model_path=model_path)
    lyrics_lines = [ln.strip() for ln in lyrics_text.splitlines() if ln.strip()]
    total = len(lyrics_lines)
    print(f"[translate] Translating {total} lines", flush=True)

    raw: list[dict] = []
    for idx, result in enumerate(
        tr.translate_iter(lyrics_lines, max_new_tokens=60, temperature=0.5)
    ):
        raw.append(result)
        live_english = _clean_meta(result.get("english_translation", "")).strip()
        print(
            f"[translate] line {idx + 1}/{total}  mora={result['target_syllables']}  → {live_english[:80]}",
            flush=True,
        )
        yield "line", {
            "idx": idx,
            "total": total,
            "japanese": result["original_japanese"],
            "mora_count": result["target_syllables"],
            "english": live_english,
        }

    cleaned = parse_translation(raw, mora_counter=tr.count_mora)
    for row in cleaned:
        row["english"] = _clean_meta(row.get("english", ""))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(cleaned, ensure_ascii=False, indent=2), "utf-8")
    print(f"[translate] Done. Cached to {out_path}", flush=True)
    yield "result", cleaned


_WHISPER_MODEL = None


def _whisper_lyric_score(
    wav_path: Path, workspace: Path, target_words: set[str]
) -> tuple[float, str]:
    """Score a candidate by how many target lyric words Whisper recognizes in it.

    1. Demucs the candidate → vocals.wav (isolating the singing)
    2. Run Whisper-tiny.en on vocals.wav → transcription
    3. Compute fraction of target words that appear in the transcript

    Higher = more recognizable English singing of our target lyrics. Pure
    RMS coverage couldn't tell ``actual singing`` from ``babbling`` — Whisper
    can, because it only confidently transcribes when the audio sounds like
    real English.
    """
    import re

    import soundfile as sf
    from faster_whisper import WhisperModel

    from src.separation.demucs_runner import separate

    workspace.mkdir(parents=True, exist_ok=True)
    out = separate(wav_path, workspace)
    vocals_wav = out["vocals"]

    global _WHISPER_MODEL
    if _WHISPER_MODEL is None:
        _WHISPER_MODEL = WhisperModel("base.en", device="cuda", compute_type="float16")
    segments, _info = _WHISPER_MODEL.transcribe(
        str(vocals_wav),
        beam_size=1,
        language="en",
        vad_filter=True,
        no_speech_threshold=0.5,
    )
    transcript = " ".join(s.text for s in segments).lower()
    transcript_words = set(re.findall(r"[a-z']+", transcript))

    if not target_words:
        return 0.0, transcript
    overlap = len(target_words & transcript_words) / max(len(target_words), 1)

    # Quick sanity stats so we can read the candidate logs in flight.
    data, sr = sf.read(str(vocals_wav))
    if data.ndim == 2:
        data = data.mean(axis=1)
    dur = len(data) / sr
    return overlap, f"{transcript[:80]}... ({dur:.1f}s, {len(transcript_words)} unique words)"


def _stage_ace_generate(
    audio_path: Path,
    translations: list[dict],
    inst_orig: Path,
    out_dir: Path,
) -> tuple[Path, str, list[dict]]:
    """Run candidates, return ``(picked_final_wav, picked_tag, all_candidates)``.

    ``all_candidates`` is a list of dicts ``{tag, final_wav, score, detail}``
    sorted by score (best first). The Gradio UI uses this list to surface
    every candidate to the user so they can pick by ear; the picked best is
    still copied to ``picked_final_wav`` for callers that want a single file.
    """
    final_out = out_dir / "final_picked.wav"
    manifest_path = out_dir / "candidates_manifest.json"
    if final_out.exists() and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text("utf-8"))
        return final_out, manifest[0]["tag"] if manifest else "cached", manifest

    os.environ.setdefault("ACESTEP_CHECKPOINTS_DIR", ACE_CKPT)
    # IMPORTANT: do *not* touch CUBLAS_WORKSPACE_CONFIG / cudnn flags.
    # scripts/ace_step_variants3.py (the source of the M2 / FINAL gold
    # standard) ran on the default cudnn settings (deterministic=False,
    # benchmark=True). Forcing determinism here selects a different kernel
    # and yields different output than M2. Let ACE-Step's internal
    # ``set_seeds(manual_seeds=[seed])`` handle reproducibility via
    # ``GenerationParams.seed``.

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler

    out_dir.mkdir(parents=True, exist_ok=True)
    lyrics_block = "\n".join(r["english"] for r in translations if r.get("english"))

    dit = AceStepHandler()
    _, ok = dit.initialize_service(
        project_root=ACE_CKPT,
        config_path=ACE_LEGO_CONFIG,
        device="auto",
        offload_to_cpu=False,
    )
    if not ok:
        raise RuntimeError("ACE-Step DiT init failed")

    llm = LLMHandler()
    _, ok = llm.initialize(
        checkpoint_dir=ACE_CKPT,
        lm_model_path="acestep-5Hz-lm-1.7B",
        backend="pt",
        device="auto",
        offload_to_cpu=False,
        dtype=None,
    )
    if not ok:
        raise RuntimeError("ACE-Step LM init failed")

    target_words: set[str] = set()
    for r in translations:
        for w in re.findall(r"[a-zA-Z']+", r.get("english", "").lower()):
            if len(w) > 1:
                target_words.add(w)

    candidates_dir = out_dir / "candidates"
    candidates_dir.mkdir(exist_ok=True)
    config = GenerationConfig(batch_size=1, audio_format="wav")

    from src.pipeline.mix import mix_tracks
    from src.separation.demucs_runner import separate

    scores: list[tuple[float, str, int, float, Path, str]] = []  # (score, mode, seed, strength, final_wav, detail)

    # ---- Warmup ------------------------------------------------------
    # Empirically, an M1-replica warmup (lego, seed=42, str=0.40) produced
    # worse output than a generic warmup with a distinct seed. Stay with
    # a generic warmup whose RNG consumption doesn't shadow any real seed
    # in the candidate sweep. The function of warmup is only to put cudnn
    # kernel selection / lazy init in a steady state.
    warmup_dir = candidates_dir / "_warmup"
    warmup_dir.mkdir(exist_ok=True)
    warmup_marker = warmup_dir / ".done"
    if not warmup_marker.exists():
        try:
            warmup_params = GenerationParams(
                task_type="lego",
                thinking=False,
                caption=ACE_LEGO_CAPTION,
                lyrics=lyrics_block,
                src_audio=str(audio_path),
                instruction=ACE_LEGO_INSTRUCTION,
                audio_cover_strength=ACE_LEGO_STRENGTH,
                vocal_language="en",
                inference_steps=ACE_LEGO_STEPS,
                seed=987654,  # not in ACE_CANDIDATES
            )
            print("  [best-of-N] running generic warmup pass ...")
            _ = generate_music(dit, llm, warmup_params, config, save_dir=str(warmup_dir))
        except Exception as e:
            print(f"  [best-of-N] warmup failed (continuing anyway): {e}")
        warmup_marker.touch()
        for f in warmup_dir.glob("*.wav"):
            try:
                f.unlink()
            except Exception:
                pass

    for mode, seed, strength in ACE_CANDIDATES:
        # Do not call torch.manual_seed / cuda.manual_seed_all here.
        # ACE-Step's GenerationParams(seed=...) flows into the internal
        # set_seeds() which uses its own torch.Generator instance —
        # external manual_seed only perturbs the global RNG state and
        # diverges output from variants3.py's behaviour.

        common_kwargs = dict(
            thinking=False,
            caption=ACE_LEGO_CAPTION,
            lyrics=lyrics_block,
            src_audio=str(audio_path),
            audio_cover_strength=strength,
            vocal_language="en",
            inference_steps=ACE_LEGO_STEPS,
            seed=seed,
        )
        if mode == "lego":
            params = GenerationParams(
                task_type="lego",
                instruction=ACE_LEGO_INSTRUCTION,
                **common_kwargs,
            )
        else:
            params = GenerationParams(task_type="cover", **common_kwargs)

        tag = f"{mode}_seed{seed}_str{strength:.2f}"
        per_dir = candidates_dir / tag
        per_dir.mkdir(exist_ok=True)
        cand_path = per_dir / "ace.wav"

        if not cand_path.exists():
            try:
                result = generate_music(dit, llm, params, config, save_dir=str(per_dir))
            except Exception as e:
                print(f"  [best-of-N] {tag} generation EXCEPTION: {e}")
                continue
            if not result.success or not result.audios:
                print(f"  [best-of-N] {tag} FAILED: {result.error}")
                continue
            shutil.move(str(result.audios[0]["path"]), str(cand_path))

        # Score on the candidate's vocals via Demucs + Whisper.
        try:
            score, detail = _whisper_lyric_score(
                cand_path, per_dir / "demucs_score", target_words
            )
        except Exception as e:
            print(f"  [best-of-N] {tag} score FAILED: {e}")
            score, detail = -1.0, str(e)

        # Build the candidate-specific final wav for ranking parity.
        final_path = per_dir / "final.wav"
        try:
            if mode == "lego":
                # Re-Demucs to isolate vocals, then mix with original inst.
                demucs_dir = per_dir / "demucs_mix"
                demucs_out = separate(cand_path, demucs_dir)
                mix_tracks(demucs_out["vocals"], inst_orig, final_path)
            else:
                # Cover already contains its own instrumental; use as-is.
                shutil.copy2(str(cand_path), str(final_path))
        except Exception as e:
            print(f"  [best-of-N] {tag} mixing FAILED: {e}")
            continue

        print(f"  [best-of-N] {tag:38s}  word_overlap={score:.3f}  {detail}")
        scores.append((score, mode, seed, strength, final_path, detail))

    if not scores:
        raise RuntimeError("ACE-Step produced no candidates")
    scores.sort(key=lambda t: t[0], reverse=True)
    best_score, best_mode, best_seed, best_strength, best_path, _ = scores[0]
    best_tag = f"{best_mode}_seed{best_seed}_str{best_strength:.2f}"
    print(f"  [best-of-N] PICKED {best_tag} word_overlap={best_score:.3f}")
    shutil.copy2(str(best_path), str(final_out))

    # Build the manifest of every successful candidate so the UI can show
    # the full list and let the user pick by ear.
    manifest = [
        {
            "tag": f"{mode}_seed{seed}_str{strength:.2f}",
            "mode": mode,
            "seed": int(seed),
            "strength": float(strength),
            "score": float(score),
            "final_wav": str(final_path),
            "detail": detail,
        }
        for score, mode, seed, strength, final_path, detail in scores
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    return final_out, best_tag, manifest


def _stage_extract_vocals(ace_wav: Path, out_dir: Path) -> Path:
    """Demucs the ACE-Step output to isolate its vocals track."""
    target = out_dir / "ace_vocals.wav"
    if target.exists():
        return target
    from src.separation.demucs_runner import separate

    out = separate(ace_wav, out_dir)
    shutil.move(str(out["vocals"]), str(target))
    # We don't need the AI instrumental — discard.
    try:
        Path(out["instrumental"]).unlink()
    except Exception:
        pass
    return target


def _stage_mix(ace_vocals: Path, inst_orig: Path, out_path: Path) -> Path:
    if out_path.exists():
        return out_path
    from src.pipeline.mix import mix_tracks

    return mix_tracks(ace_vocals, inst_orig, out_path)


# ---------- orchestrator ----------------------------------------------


def run(
    audio_path: Path,
    lyrics_text: str,
    cache_root: Path = Path("cache"),
    dpo_model_path: str = DEFAULT_DPO_MODEL,
) -> Iterator[tuple[str, float, dict]]:
    """Drive the full pipeline, yielding ``(stage, pct, payload)`` events."""
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(audio_path)

    audio_key = _hash_audio(audio_path)
    lyrics_key = _hash_text(lyrics_text)
    audio_cache = cache_root / audio_key
    lyrics_cache = audio_cache / lyrics_key
    audio_cache.mkdir(parents=True, exist_ok=True)
    lyrics_cache.mkdir(parents=True, exist_ok=True)

    yield ("separate", 0.05, {"msg": "Separating vocals and instrumental..."})
    t0 = time.time()
    _, inst_orig = _stage_separate(audio_path, audio_cache)
    yield (
        "separate",
        0.15,
        {"instrumental": str(inst_orig), "elapsed": round(time.time() - t0, 1)},
    )

    yield ("translate", 0.20, {"msg": "Translating lyrics with DPO Gemma..."})
    t0 = time.time()
    translations: list[dict] = []
    for ev_type, payload in _stage_translate(
        lyrics_text, dpo_model_path, lyrics_cache / "translation.json"
    ):
        if ev_type == "line":
            # Reserve 0.20–0.55 for translation; allocate proportionally per line.
            line_pct = 0.20 + 0.35 * (payload["idx"] + 1) / max(payload["total"], 1)
            yield ("translate_line", line_pct, payload)
        elif ev_type == "result":
            translations = payload

    yield (
        "translate",
        0.55,
        {
            "rows": len(translations),
            "translations": translations,
            "elapsed": round(time.time() - t0, 1),
        },
    )

    yield (
        "ace_step",
        0.60,
        {"msg": "Generating ACE-Step lego + cover candidates and picking by Whisper..."},
    )
    t0 = time.time()
    picked_final, picked_tag, candidates = _stage_ace_generate(
        audio_path, translations, inst_orig, lyrics_cache
    )
    final = lyrics_cache / "final.wav"
    shutil.copy2(str(picked_final), str(final))
    yield (
        "done",
        1.0,
        {
            "final": str(final),
            "translations": translations,
            "picked": picked_tag,
            "candidates": candidates,
            "elapsed": round(time.time() - t0, 1),
        },
    )
