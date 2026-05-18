# syntax=docker/dockerfile:1.6
#
# Lyrics→English Singing Web App
# ===============================
# Single-image build that runs the full pipeline behind a Gradio UI.
#
# Stages:
#   1. CUDA 12.8 + Python 3.11 base
#   2. apt-time deps (ffmpeg, build tools, git)
#   3. pip install PyTorch 2.10 cu128 + project requirements
#   4. Clone & install ACE-Step v1.5 (needs Python ≥ 3.11)
#   5. Copy app source
#
# Run-time expectations:
#   - Mount the host's ACE-Step v1.5 model snapshot to /app/models/ace-step-v1.5
#   - Mount the DPO Gemma adapter to /app/models/gemma-dpo-final
#   - Mount a writable cache directory to /app/cache
#   - Bind GPU: --gpus all

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
RUN python3 -m pip install --break-system-packages --upgrade pip setuptools wheel \
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
RUN mkdir -p /app/cache /app/models /app/.hf

EXPOSE 7860

# Pre-resolve CUDA library paths so onnxruntime/ACE-Step can import them.
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.12/dist-packages/nvidia/cublas/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cudnn/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cufft/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/curand/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cusparse/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cuda_runtime/lib:\
/usr/local/lib/python3.12/dist-packages/nvidia/cuda_nvrtc/lib

ENTRYPOINT ["python3", "-m", "src.web.app"]
