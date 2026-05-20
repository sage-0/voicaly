"""FastAPI backend for the Utaime lyrics translation pipeline."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from queue import Empty

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from src.api import jobs as jobs_module
from src.api import presets as presets_module
from src.api.presets import Preset

# Initialize app logging. Outputs go to stderr → captured by `docker logs`.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("utaime.api")

app = FastAPI(title="Utaime API")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log every HTTP request with status code and duration. SSE streams
    legitimately take a long time; their duration here measures only the
    handshake, not the full stream lifetime."""
    t0 = time.time()
    try:
        response = await call_next(request)
        dt = (time.time() - t0) * 1000
        logger.info("%s %s → %d (%.0fms)", request.method, request.url.path, response.status_code, dt)
        return response
    except Exception as exc:
        dt = (time.time() - t0) * 1000
        logger.exception("%s %s → 500 (%.0fms): %s", request.method, request.url.path, dt, exc)
        raise

# Same-origin in production (frontend served from this server). CORS '*' is
# safe because browsers refuse to attach credentials to wildcard origins,
# so an unauthenticated cross-site request can never reach a CF-Access-gated
# origin with the user's CF_Authorization cookie attached.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_ROOT = Path(os.environ.get("UPLOAD_ROOT", "/tmp/utaime"))
CACHE_ROOT = Path(os.environ.get("PIPELINE_CACHE_ROOT", "/app/cache"))
DPO_MODEL = os.environ.get("DPO_MODEL_PATH", "/app/models/gemma-dpo-final")
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

# Resource limits — bound memory usage from a single authenticated upload.
MAX_AUDIO_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_LYRICS_LEN = 10_000              # ~10 KB
ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac"}

# SSE keepalive interval. The ACE-Step stage can run for several minutes
# between yield events, so we send a comment line every N seconds to keep
# intermediate proxies (Cloudflare, nginx, browsers) from closing the stream.
SSE_HEARTBEAT_SEC = 15.0


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Preset CRUD
# ---------------------------------------------------------------------------


@app.get("/api/presets")
async def list_presets_endpoint() -> JSONResponse:
    """Return all presets (built-in first, then user-created)."""
    return JSONResponse({"presets": presets_module.list_presets()})


@app.post("/api/presets", status_code=201)
async def create_preset_endpoint(body: dict) -> JSONResponse:
    """Create a new user preset.

    Request body: Preset JSON without ``id`` and ``created_at`` (both are
    auto-assigned by the server).  Built-in flag is always forced to False.
    """
    try:
        saved = presets_module.save_preset(body)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return JSONResponse(saved, status_code=201)


@app.delete("/api/presets/{preset_id}", status_code=204)
async def delete_preset_endpoint(preset_id: str):
    """Delete a user preset. Returns 400 for built-in presets, 404 if not found."""
    try:
        presets_module.delete_preset(preset_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /api/jobs  — create and start a new pipeline job
# ---------------------------------------------------------------------------


@app.post("/api/jobs", status_code=201)
async def create_job(
    audio_file: UploadFile,
    lyrics: str = Form(...),
    preset_json: str = Form(...),
    translation_model: str = Form("gemma"),
    cover_model: str = Form("ace1"),
) -> JSONResponse:
    # ---- Validate preset ----
    try:
        preset = Preset(**json.loads(preset_json))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid preset_json: {exc}")

    # ---- Validate lyrics ----
    if not lyrics.strip():
        raise HTTPException(status_code=400, detail="lyrics is empty")
    if len(lyrics) > MAX_LYRICS_LEN:
        raise HTTPException(status_code=413, detail=f"lyrics too long (max {MAX_LYRICS_LEN} chars)")

    # ---- Validate audio extension ----
    suffix = Path(audio_file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported audio format (allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTS))})",
        )

    # ---- Read audio with size cap ----
    content = await audio_file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="audio file is empty")
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"audio file too large (max {MAX_AUDIO_SIZE // (1024 * 1024)} MB)",
        )

    job_id = jobs_module.create_job()

    # Persist the uploaded audio under <UPLOAD_ROOT>/<job_id>/input.<ext>
    upload_dir = UPLOAD_ROOT / job_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    audio_path = upload_dir / f"input{suffix}"
    audio_path.write_bytes(content)

    logger.info(
        "[job %s] POST /api/jobs accepted — audio=%s (%d bytes), t_model=%s, c_model=%s, "
        "preset=%s, post_fx=%s, lyrics=%d chars",
        job_id, audio_file.filename, len(content), translation_model, cover_model,
        preset.id, preset.post_fx_enabled, len(lyrics),
    )

    jobs_module.start_pipeline(
        job_id=job_id,
        audio_path=audio_path,
        lyrics=lyrics,
        dpo_model_path=DPO_MODEL,
        cache_root=CACHE_ROOT,
        preset=preset,
    )

    return JSONResponse({"job_id": job_id}, status_code=201)


# ---------------------------------------------------------------------------
# GET /api/jobs/{job_id}/events  — SSE progress stream
# ---------------------------------------------------------------------------


@app.get("/api/jobs/{job_id}/events")
async def stream_events(job_id: str) -> StreamingResponse:
    job = jobs_module.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    async def generate():
        q = job["queue"]
        loop = asyncio.get_event_loop()
        while True:
            try:
                event = await loop.run_in_executor(None, q.get, True, SSE_HEARTBEAT_SEC)
            except Empty:
                # No event for HEARTBEAT_SEC: emit an SSE comment so proxies
                # (Cloudflare, nginx) and the browser keep the connection open
                # during long-running pipeline stages (e.g., ACE-Step).
                yield ": keep-alive\n\n"
                continue
            except Exception:
                break

            if event is None:
                # Sentinel: pipeline finished (success or error already queued).
                break
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# GET /api/jobs/{job_id}/result  — final result JSON
# ---------------------------------------------------------------------------


@app.get("/api/jobs/{job_id}/result")
async def get_result(job_id: str) -> JSONResponse:
    job = jobs_module.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")

    status = job["status"]
    result = job.get("result") or {}

    return JSONResponse({
        "status": status,
        "candidates": result.get("candidates", []),
        "translation": result.get("translation", []),
        "error": job.get("error"),
    })


# ---------------------------------------------------------------------------
# GET /api/audio/{job_id}/{filename}  — serve a candidate WAV file
# ---------------------------------------------------------------------------


@app.get("/api/audio/{job_id}/{filename}")
async def serve_audio(job_id: str, filename: str) -> FileResponse:
    # Basic path-traversal guard.
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="invalid filename")

    job = jobs_module.get_job(job_id)
    if job is None or not job.get("result"):
        raise HTTPException(status_code=404, detail="job or result not found")

    # URL filename is `<tag>.wav`; on disk every candidate stores its result
    # under `<tag>/final.wav`. Resolve via _raw_candidates so we look up the
    # actual path by tag, not by basename (which is identical for all).
    if not filename.endswith(".wav"):
        raise HTTPException(status_code=400, detail="not a wav request")
    tag = filename[:-4]

    for rc in job["result"].get("_raw_candidates", []):
        if rc["tag"] == tag:
            wav_path = Path(rc["final_wav"])
            if not wav_path.is_file():
                raise HTTPException(status_code=404, detail="audio file missing on disk")
            return FileResponse(str(wav_path), media_type="audio/wav")

    raise HTTPException(status_code=404, detail="audio file not found")


# ---------------------------------------------------------------------------
# Static frontend (mounted last so API routes take precedence)
# ---------------------------------------------------------------------------

if FRONTEND_DIST.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(FRONTEND_DIST), html=True),
        name="static",
    )
