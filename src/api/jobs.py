"""In-memory job store and background pipeline runner."""

from __future__ import annotations

import logging
import sys
import time
import uuid
from pathlib import Path
from queue import Queue
from threading import Lock, Thread
from typing import Any

logger = logging.getLogger("utaime.jobs")


# In-memory job store: job_id -> job dict
_jobs: dict[str, dict[str, Any]] = {}

# ACE-Step + Demucs each pin a large model in VRAM. Two concurrent pipeline
# runs would race for the GPU and OOM on most setups. We serialize pipeline
# execution; new jobs queue up and the SSE stream stays alive on the heartbeat.
_pipeline_lock = Lock()


def create_job() -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "status": "running",
        "queue": Queue(),
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    logger.info("[job %s] created", job_id)
    return job_id


def get_job(job_id: str) -> dict[str, Any] | None:
    return _jobs.get(job_id)


def _translation_to_rows(translations: list[dict]) -> list[dict]:
    """Convert orchestrator translation dicts to API row format.

    The orchestrator emits {"japanese", "mora_count", "english"} per row.
    """
    rows = []
    for i, t in enumerate(translations):
        rows.append({
            "id": i + 1,
            "ja": t.get("japanese", ""),
            "mora": t.get("mora_count", 0),
            "en": t.get("english", ""),
        })
    return rows


def _handle_pipeline_event(
    job_id: str,
    q: Queue,
    stage: str,
    pct: float,
    payload: dict,
    translations_cache: list[dict],
) -> list[dict]:
    """Translate one orchestrator yield into the SSE event(s) for that step.

    Returns the (possibly updated) translations_cache.
    """
    job = _jobs[job_id]
    msg = payload.get("msg", "")

    if stage == "translate_line":
        # Per-line streaming event from DPO Gemma. Convert to the row shape
        # the frontend already uses.
        row = {
            "id": int(payload.get("idx", 0)) + 1,
            "ja": payload.get("japanese", ""),
            "mora": payload.get("mora_count", 0),
            "en": payload.get("english", ""),
        }
        total = int(payload.get("total", 0))
        logger.info(
            "[job %s] translate_line %d/%d  mora=%d  en=%r",
            job_id, row["id"], total, row["mora"], row["en"][:60],
        )
        q.put({"type": "translation_line", "row": row, "total": total})

    if stage == "translate" and "translations" in payload:
        translations_cache = payload["translations"]
        rows = _translation_to_rows(translations_cache)
        logger.info("[job %s] translation_ready (%d rows)", job_id, len(rows))
        q.put({"type": "translation_ready", "rows": rows})

    q.put({
        "type": "progress",
        "stage": stage,
        "pct": pct,
        "message": msg or f"{stage} {int(pct * 100)}%",
    })

    if stage == "done":
        candidates = payload.get("candidates", [])
        translation = _translation_to_rows(
            payload.get("translations", translations_cache)
        )

        result_candidates = []
        for i, c in enumerate(candidates):
            fname = Path(c["final_wav"]).name
            result_candidates.append({
                "rank": i + 1,
                "tag": c["tag"],
                "score": c["score"],
                "audio_url": f"/api/audio/{job_id}/{fname}",
                "seed": c["seed"],
                "strength": c["strength"],
                "mode": c["mode"],
            })

        job["result"] = {
            "candidates": result_candidates,
            "translation": translation,
            # Keep full paths for audio serving — kept under "_raw_candidates"
            # so they never leak into the JSON returned by GET /result.
            "_raw_candidates": [
                {"tag": c["tag"], "final_wav": c["final_wav"]}
                for c in candidates
            ],
        }
        job["status"] = "done"
        logger.info(
            "[job %s] done — %d candidates, top=%s score=%.3f",
            job_id,
            len(result_candidates),
            result_candidates[0]["tag"] if result_candidates else "(none)",
            result_candidates[0]["score"] if result_candidates else -1.0,
        )

    return translations_cache


def start_pipeline(
    job_id: str,
    audio_path: Path,
    lyrics: str,
    dpo_model_path: str,
    cache_root: Path,
) -> None:
    """Launch the pipeline in a background daemon thread, pushing events to the job queue."""

    def _run() -> None:
        job = _jobs[job_id]
        q: Queue = job["queue"]
        t_start = time.time()
        try:
            # Ensure the webapp root is on sys.path so src.pipeline can be imported.
            repo = str(Path(__file__).resolve().parents[2])
            if repo not in sys.path:
                sys.path.insert(0, repo)

            from src.pipeline.orchestrator import run as orchestrator_run

            logger.info(
                "[job %s] starting pipeline (audio=%s lyrics=%d chars)",
                job_id, audio_path.name, len(lyrics),
            )

            # If another job is mid-flight, signal "queued" before blocking on
            # the lock so the SSE stream can show a waiting state.
            if _pipeline_lock.locked():
                logger.info("[job %s] queued (pipeline lock held by another job)", job_id)
                q.put({
                    "type": "progress",
                    "stage": "queued",
                    "pct": 0.0,
                    "message": "他のジョブを処理中... 順番待ち",
                })

            translations_cache: list[dict] = []

            # Isolate each job's cache under the job UUID so re-uploading the
            # same audio/lyrics always triggers a fresh run. The shared
            # cache_root (`/app/cache`) just becomes a parent directory of
            # job-scoped subdirectories.
            job_cache_root = cache_root / job_id
            logger.info("[job %s] cache dir: %s (isolated, no cross-job reuse)", job_id, job_cache_root)

            with _pipeline_lock:
                logger.info("[job %s] acquired pipeline lock, running orchestrator", job_id)
                for stage, pct, payload in orchestrator_run(
                    audio_path, lyrics, job_cache_root, dpo_model_path
                ):
                    translations_cache = _handle_pipeline_event(
                        job_id, q, stage, pct, payload, translations_cache
                    )

            elapsed = time.time() - t_start
            logger.info("[job %s] pipeline finished in %.1fs", job_id, elapsed)
            q.put({"type": "done"})

        except Exception as exc:
            import traceback

            tb = traceback.format_exc()
            logger.error("[job %s] pipeline failed: %s\n%s", job_id, exc, tb)
            job["status"] = "error"
            job["error"] = str(exc)
            q.put({"type": "error", "message": str(exc)})

        finally:
            q.put(None)  # sentinel: signals the SSE generator to stop

    Thread(target=_run, daemon=True).start()
