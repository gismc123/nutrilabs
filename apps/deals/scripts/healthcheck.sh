#!/usr/bin/env bash
# Quick health report: containers, web app, and how fresh the data is.
# Exit 0 healthy, 1 something needs attention.
set -uo pipefail
cd "$(dirname "$0")/.."
STATUS=0
say() { echo "$*"; }

for svc in deals deals-db; do
  state=$(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk -v s="$svc" '$1==s{print $2}')
  if [ "$state" = "healthy" ]; then say "ok    $svc container healthy"; else say "FAIL  $svc container: ${state:-not running}"; STATUS=1; fi
done

PORT=$(grep -m1 '^DEALS_PORT=' .env | cut -d= -f2-); PORT=${PORT:-1043}
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/api/auth/status")
if [ "$code" = "200" ]; then say "ok    web app answers on :$PORT"; else say "FAIL  web app on :$PORT returned $code"; STATUS=1; fi

# Latest sync runs, read straight from the database.
docker compose exec -T deals-db psql -U deals -d deals -At -F'|' -c "
  SELECT kind, status, to_char((\"startedAt\" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
         round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - \"startedAt\") / 3600)::int
  FROM (SELECT DISTINCT ON (kind) * FROM sync_runs ORDER BY kind, \"startedAt\" DESC) r" 2>/dev/null |
while IFS='|' read -r kind status when hours; do
  if [ "$status" = "ok" ] && [ "${hours:-999}" -le 36 ]; then say "ok    last $kind sync $status at $when"
  else say "WARN  last $kind sync $status at $when (${hours}h ago)"; fi
done
exit $STATUS
