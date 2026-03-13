#!/usr/bin/env bash
set -euo pipefail
cd /home/admin/.openclaw/workspace/projects/bot-bridge-service
export $(grep -v '^#' .env | xargs)
export BRIDGE_URL="${BRIDGE_URL:-http://127.0.0.1:8787}"
export BRIDGE_TARGET_AGENT="${BRIDGE_TARGET_AGENT:-main}"
export BRIDGE_WORKER_ID="${BRIDGE_WORKER_ID:-openclaw-node-a-worker}"
export BRIDGE_WORKER_MODE="${BRIDGE_WORKER_MODE:-mock}"
exec /usr/bin/node /home/admin/.openclaw/workspace/projects/bot-bridge-service/worker-openclaw.js
