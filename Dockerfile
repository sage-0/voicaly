# syntax=docker/dockerfile:1.6
#
# Lyrics→English Singing Web App
# ===============================
# Multi-stage build:
#   Stage 1 (frontend-build): Node 20 — builds Vite+React into /build/dist
#   Stage 2 (runtime):        CUDA 12.8 + Python 3.12 — runs FastAPI / uvicorn
#
# Stages:
#   1. Node 20: install npm deps, run vite build
#   2. CUDA 12.8 + Python 3.12 base
#   3. apt-time deps (ffmpeg, build tools, git)
#   4. pip install PyTorch 2.10 cu128 + project requirements
#   5. Clone & install ACE-Step v1.5 (needs Python ≥ 3.11)
#   6. Copy app source + frontend dist
#
# Run-time expectations:
#   - Mount the host's ACE-Step v1.5 model snapshot to /app/models/ace-step-v1.5
#   - Mount the DPO Gemma adapter to /app/models/gemma-dpo-final
#   - Mount a writable cache directory to /app/cache
#   - Bind GPU: --gpus all

# ---- Stage 1: フロントエンドビルド -----------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python + CUDA ------------------------------------------------
FROM nvidia/cuda:12.8.1-cudnn-devel-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GRADIO_HOST=0.0.0.0 \
    GRADIO_PORT=7860 \
    ACE_CKPT_DIR=/app/models/ace-step-v1.5 \
    DPO_MODEL_PATH=/app/models/gemma-dpo-final \
    PIPELINE_CACHE_ROOT=/app/cache \
    HF_HOME=/app/.hf

# ---- 1. OS deps ---------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-dev python3.12-venv python3-pip \
        ffmpeg git curl ca-certificates build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.12 /usr/local/bin/python3 \
    && ln -sf /usr/bin/python3.12 /usr/local/bin/python

# ---- 2. PyTorch (cu128) -------------------------------------------------
# --ignore-installed is needed because Ubuntu 24.04's pip ships from dpkg
# without a RECORD file, so a normal --upgrade fails to uninstall it first.
RUN python3 -m pip install --break-system-packages --ignore-installed pip setuptools wheel \
 && python3 -m pip install --break-system-packages \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        "torch==2.10.0+cu128" "torchvision==0.25.0+cu128" "torchaudio==2.10.0+cu128"

# ---- 3. Project requirements -------------------------------------------
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN python3 -m pip install --break-system-packages -r /app/requirements.txt

# torchcodec needs to match torch 2.10; ffmpeg is provided by apt above.
RUN python3 -m pip install --break-system-packages "torchcodec>=0.12,<0.13"

# ---- 4. ACE-Step v1.5 (clone + install --no-deps to keep our pins) ------
RUN git clone --depth 1 https://github.com/ace-step/ACE-Step-1.5.git /opt/ACE-Step-1.5 \
 && python3 -m pip install --break-system-packages --no-deps -e /opt/ACE-Step-1.5

# ---- 5. App source ------------------------------------------------------
COPY src /app/src

# Cache and models are mount points; they're created at runtime.
RUN mkdir -p /app/cache /app/models /app/.hf /app/frontend/dist

# フロントエンドの静的ファイルをコピー
COPY --from=frontend-build /build/dist /app/frontend/dist

EXPOSE 7860

# Pre-resolve CUDA library paths so onnxruntime/ACE-Step can import them.
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.12/dist-packages/nvidia/cublas/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cudnn/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cufft/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/curand/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cusparse/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cuda_runtime/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cuda_nvrtc/lib

ENTRYPOINT ["python3", "-m", "uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "7860"]
