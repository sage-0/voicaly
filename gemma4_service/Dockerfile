# syntax=docker/dockerfile:1.6
#
# gemma4-svc — gemma4-dpo translation microservice
# ================================================
# Runs in its own container because gemma-4 (google/gemma-4-E2B-it,
# model_type=gemma4) requires transformers 5.x, while ACE-Step in the main
# webapp pins transformers <4.58 — the two cannot share one process.
# The webapp calls this over HTTP only when translation_model == gemma4-dpo.
#
# Run-time expectations (see ../docker-compose.yml, profile "gemma4"):
#   - Mount the gemma4-dpo adapter at /workspace/models/gemma4-dpo
#   - Provide HF_TOKEN for the gated google/gemma-4-E2B-it base model
#   - Bind GPU: --gpus all

FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GEMMA4_BASE=google/gemma-4-E2B-it \
    GEMMA4_ADAPTER=/workspace/models/gemma4-dpo \
    GEMMA4_PORT=8000 \
    HF_HOME=/workspace/.hf

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-dev python3-pip git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.12 /usr/local/bin/python3 \
    && ln -sf /usr/bin/python3.12 /usr/local/bin/python

# PyTorch (cu128) — matches the host CUDA 12.8 runtime.
RUN python3 -m pip install --break-system-packages --ignore-installed pip setuptools wheel \
 && python3 -m pip install --break-system-packages \
        --extra-index-url https://download.pytorch.org/whl/cu128 \
        "torch==2.10.0+cu128"

# transformers 5.x is required for gemma-4 (model_type=gemma4).
RUN python3 -m pip install --break-system-packages \
        "transformers==5.11.0" "peft>=0.13" "accelerate>=1.0"

WORKDIR /workspace
COPY server.py /svc/server.py
RUN mkdir -p /workspace/models /workspace/.hf

EXPOSE 8000

ENTRYPOINT ["python3", "/svc/server.py"]
