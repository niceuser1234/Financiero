#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Für die lokale Entwicklung nur die benötigten, ausdrücklich erlaubten Werte
# aus der ignorierten Root-.env lesen. Die Datei wird bewusst nicht als
# Shellcode "gesourct".
if [[ -f ../.env ]]; then
  while IFS='=' read -r key value; do
    value="${value%$'\r'}"
    case "$key" in
      FINTS_SIDECAR_TOKEN)
        if [[ -z "${FINTS_SIDECAR_TOKEN:-}" ]]; then
          export FINTS_SIDECAR_TOKEN="$value"
        fi
        ;;
      APP_BASE_URL)
        if [[ -z "${APP_BASE_URL:-}" ]]; then
          export APP_BASE_URL="$value"
        fi
        ;;
    esac
  done < ../.env
fi

: "${FINTS_SIDECAR_TOKEN:?FINTS_SIDECAR_TOKEN fehlt in der Umgebung oder Root-.env}"

echo "FinTS-Hintergrunddienst: http://127.0.0.1:8790"
echo "Financiero-App: ${APP_BASE_URL:-http://localhost:3000}"

exec ./.venv/bin/uvicorn fints_sidecar.app:app --host 127.0.0.1 --port 8790
