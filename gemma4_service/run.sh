#!/usr/bin/env bash
# gemma4-svc — gemma4-dpo 専用翻訳マイクロサービス (transformers 5.11 / venv-g4)。
#
# なぜ別コンテナか:
#   gemma4 (google/gemma-4-E2B-it, model_type=gemma4) は transformers 5.x を要求するが、
#   ACE-Step は transformers <4.58 を pin しており同一プロセスに同居できない。
#   そこで gemma4 だけ別コンテナで推論し、webapp は model=gemma4-dpo のときだけ
#   HTTP (GEMMA4_SERVICE_URL=http://gemma4-svc:8000) で呼ぶ。gemma2/gemma3 は webapp 内ローカル。
#
# イメージ gemma4-svc:latest の出自 (commit スナップショット):
#   docker commit gemma34-exp gemma4-svc:latest   # /opt/venv-g4 (transformers 5.11.0) を取り込む
#   ※ venv-g4 を一から作り直す場合は /home/seij/lyrics/exp34/setup_env.sh の venv-g4 節を参照。
#
# ベースモデル/アダプタは共有HFキャッシュ・モデルディレクトリから読む (再DL不要):
#   adapter : /home/seij/lyrics/models/gemma4-dpo
#   base    : google/gemma-4-E2B-it  (HF cache: /home/seij/lyrics/.hf_cache)
set -euo pipefail

docker rm -f gemma4-svc 2>/dev/null || true
docker run -d --name gemma4-svc \
  --network workspace-webapp_default \
  --gpus all \
  --restart unless-stopped \
  -v /home/seij/lyrics/models:/workspace/models:ro \
  -v /home/seij/lyrics/.hf_cache:/workspace/.hf_cache \
  -v /home/seij/lyrics-webapp/gemma4_service:/svc:ro \
  -e HF_HOME=/workspace/.hf_cache \
  -e GEMMA4_BASE=google/gemma-4-E2B-it \
  -e GEMMA4_ADAPTER=/workspace/models/gemma4-dpo \
  -e GEMMA4_PORT=8000 \
  --entrypoint /opt/venv-g4/bin/python \
  gemma4-svc:latest /svc/server.py

echo "gemma4-svc started."
echo "  logs   : docker logs -f gemma4-svc"
echo "  health : docker exec lyrics-webapp curl -s http://gemma4-svc:8000/health"
