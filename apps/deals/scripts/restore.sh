#!/usr/bin/env bash
# Restore a backup made by backup.sh. This REPLACES the current database contents.
#   scripts/restore.sh backups/deals-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Usage: $0 backups/deals-....sql.gz}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }
read -r -p "Replace the KrogerDeals database with $FILE? Type yes: " ans
[ "$ans" = "yes" ] || { echo "Cancelled."; exit 1; }
docker compose stop deals
gunzip -c "$FILE" | docker compose exec -T deals-db psql -U deals -d deals -v ON_ERROR_STOP=1 -q
docker compose start deals
echo "Restored $FILE"
