#!/usr/bin/env bash
# Quick Deals health report: NutriLabs API, the deals endpoint, and data freshness.
# Exit 0 healthy, 1 something needs attention.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
STATUS=0
say() { echo "$*"; }

state=$(docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$1=="api"{print $2}')
if [ "$state" = "running" ]; then say "ok    NutriLabs api container running"; else say "FAIL  NutriLabs api container: ${state:-not running}"; STATUS=1; fi

# Signed out, the deals API must answer 401 (route mounted, auth in front of it).
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:1042/api/deals/settings")
if [ "$code" = "401" ]; then say "ok    /api/deals answers (401 signed out, as expected)"; else say "FAIL  /api/deals returned $code"; STATUS=1; fi
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:1042/api/deals/internal/health")
if [ "$code" = "404" ]; then say "ok    worker ingest path hidden from the web (404)"; else say "FAIL  /api/deals/internal is reachable from the web ($code)"; STATUS=1; fi

if systemctl --user is-active --quiet nutrilabs-deals-coupons.timer; then say "ok    coupon refresh timer active"
else say "WARN  coupon refresh timer not active (apps/deals-worker/scripts/install-timer.sh)"; fi

# Latest sync runs, read straight from the database.
PGUSER=$(grep -m1 '^POSTGRES_USER=' .env | cut -d= -f2-)
PGDB=$(grep -m1 '^POSTGRES_DB=' .env | cut -d= -f2-)
docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDB" -At -F'|' -c "
  SELECT kind, status, to_char((\"startedAt\" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
         round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - \"startedAt\") / 3600)::int
  FROM (SELECT DISTINCT ON (kind) * FROM deal_sync_runs ORDER BY kind, \"startedAt\" DESC) r" 2>/dev/null |
while IFS='|' read -r kind status when hours; do
  if [ "$status" = "ok" ] && [ "${hours:-999}" -le 36 ]; then say "ok    last $kind sync $status at $when"
  else say "WARN  last $kind sync $status at $when (${hours}h ago)"; fi
done
exit $STATUS
