#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "Die Datei .env fehlt. Bitte zuerst: cp .env.example .env"
  exit 1
fi

if [[ ! -x fints-sidecar/.venv/bin/uvicorn ]]; then
  echo "Die FinTS-Umgebung fehlt. Bitte zuerst die Sidecar-Abhängigkeiten installieren."
  exit 1
fi

SIDECAR_PID=""
AUTO_SYNC_PID=""

cleanup() {
  if [[ -n "$SIDECAR_PID" ]] && kill -0 "$SIDECAR_PID" 2>/dev/null; then
    kill "$SIDECAR_PID" 2>/dev/null || true
    wait "$SIDECAR_PID" 2>/dev/null || true
  fi
  if [[ -n "$AUTO_SYNC_PID" ]] && kill -0 "$AUTO_SYNC_PID" 2>/dev/null; then
    kill "$AUTO_SYNC_PID" 2>/dev/null || true
    wait "$AUTO_SYNC_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM HUP

if command -v lsof >/dev/null 2>&1; then
  if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 3000 ist bereits belegt. Die App läuft vermutlich schon."
    exit 1
  fi

  if lsof -nP -iTCP:8790 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 8790 ist bereits belegt."
    echo "Wenn der FinTS-Dienst separat läuft, starte die App mit: npm run dev"
    exit 1
  fi
fi

./fints-sidecar/run.sh &
SIDECAR_PID=$!

./node_modules/.bin/tsx scripts/auto-sync.ts &
AUTO_SYNC_PID=$!

echo "Financiero startet auf http://localhost:3000"
echo "Bankdaten werden automatisch alle 24 Stunden abgeglichen."
echo "Zum Beenden Ctrl+C drücken."

npm run dev
