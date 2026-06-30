#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi
CF_API_TOKEN="${CF_API_TOKEN:-}"
CF_ZONE_ID="${CF_ZONE_ID:-}"

cd "$SCRIPT_DIR"

echo "Building and restarting services..."
docker compose build
docker compose up -d
echo "Deploy complete."

if [ -n "$CF_API_TOKEN" ] && [ -n "$CF_ZONE_ID" ]; then
  echo "Purging Cloudflare cache..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | grep -o '"success":[^,}]*'
  echo "Cloudflare cache purged."
else
  echo "Skipping Cloudflare purge (CF_API_TOKEN or CF_ZONE_ID not set)."
fi
