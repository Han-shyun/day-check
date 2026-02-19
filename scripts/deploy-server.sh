#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-${SERVER_APP_PATH:-/home/ubuntu/day-check}}"
LOG_FILE="${APP_DIR}/server.log"
PID_FILE="${APP_DIR}/server.pid"

cd "$APP_DIR"

echo "[deploy] install production dependencies"
npm ci --omit=dev

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

pkill -f "node server.js" || true

nohup node server.js > "$LOG_FILE" 2>&1 < /dev/null &
echo $! > "$PID_FILE"
disown
echo "[deploy] server restarted (pid $(cat "$PID_FILE"))"
