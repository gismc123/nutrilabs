#!/usr/bin/env bash
# Back up the KrogerDeals database to backups/ (gitignored). Keeps the newest 14.
#   scripts/backup.sh
# Restore with: scripts/restore.sh backups/deals-YYYYmmdd-HHMMSS.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
chmod 700 backups
OUT="backups/deals-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T deals-db pg_dump -U deals -d deals --clean --if-exists --no-owner | gzip > "$OUT"
chmod 600 "$OUT"
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
ls -1t backups/deals-*.sql.gz | tail -n +15 | xargs -r rm --
