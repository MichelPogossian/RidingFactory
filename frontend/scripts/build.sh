#!/usr/bin/env bash
# Build Vite pour Render : accepte VITE_API_URL en URL complète ou en hostname.
set -euo pipefail

if [ -n "${VITE_API_URL:-}" ] && ! [[ "${VITE_API_URL}" =~ ^https?:// ]]; then
  export VITE_API_URL="https://${VITE_API_URL}"
fi
export VITE_API_URL="${VITE_API_URL%/}"

echo "Building frontend with VITE_API_URL=${VITE_API_URL:-<empty>}"
npm ci
npm run build
