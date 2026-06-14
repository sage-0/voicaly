#!/usr/bin/env bash
# One-command launcher for the lyrics→English singing web app.
#
# Usage:
#     ./run.sh                 # build + start in foreground
#     ./run.sh -d              # detached
#     ./run.sh down            # stop and remove the container
#     ./run.sh logs            # tail container logs
#     ./run.sh rebuild         # force a fresh image build then start
#
# Optional gemma4-dpo microservice (gated base, transformers 5.x):
#     docker compose --profile gemma4 up --build -d
#
# Requires: docker + NVIDIA Container Toolkit + ≥24 GB GPU VRAM.
# First run auto-downloads ACE-Step v1.5 (~33GB) + base model into named volumes.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Create .env from the template on first run so a bare clone just works.
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example (edit it to change the model or port)."
fi

# Publish port (kept in sync with WEBAPP_PORT in .env).
PORT="$(grep -E '^WEBAPP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2)"
PORT="${PORT:-7860}"

cmd="${1:-up}"

case "$cmd" in
    up)
        docker compose up --build
        ;;
    -d|--detach|detached)
        docker compose up --build -d
        echo
        echo "Web app launched in detached mode."
        echo "  URL    : http://$(hostname -I | awk '{print $1}'):${PORT}/"
        echo "  Logs   : ./run.sh logs"
        echo "  Stop   : ./run.sh down"
        ;;
    down|stop)
        docker compose down
        ;;
    logs)
        docker compose logs -f --tail=200
        ;;
    rebuild)
        docker compose build --no-cache
        docker compose up -d
        ;;
    *)
        echo "Unknown command: $cmd"
        echo "Usage: $0 [up|-d|down|logs|rebuild]"
        exit 1
        ;;
esac
