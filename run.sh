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
# Requires: docker + NVIDIA Container Toolkit + ≥24 GB GPU VRAM.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

cmd="${1:-up}"

case "$cmd" in
    up)
        docker compose up --build
        ;;
    -d|--detach|detached)
        docker compose up --build -d
        echo
        echo "Web app launched in detached mode."
        echo "  URL    : http://$(hostname -I | awk '{print $1}'):${GRADIO_PORT:-7860}/"
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
