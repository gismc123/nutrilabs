#!/usr/bin/env bash
# Run the coupon worker on the desktop display.
#   scripts/run-worker.sh sync       nightly read-only coupon sync (what the timer runs)
#   scripts/run-worker.sh login      sign in to Kroger in a visible window (owner types the password)
#   scripts/run-worker.sh discover   dump the live coupon API shape to samples/
#
# Kroger blocks headless browsers, so the worker needs the real screen. If the
# MagicMirror kiosk is showing, it is closed for the run and always reopened
# afterward, even when the sync fails.
set -uo pipefail

CMD="${1:-sync}"
case "$CMD" in sync|login|discover) ;; *) echo "Usage: $0 sync|login|discover" >&2; exit 1 ;; esac

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
KIOSK="$HOME/Documents/MagicMirror/scripts/kiosk.sh"
LOCK="${XDG_RUNTIME_DIR:-/tmp}/krogerdeals-worker.lock"
log() { echo "[$(date -Is)] $*"; }

exec 9>"$LOCK"
if ! flock -n 9; then log "Another worker run is in progress. Exiting."; exit 0; fi

# The desktop session's Xwayland auth file (its name changes on every login).
XAUTH_FILE="$(ls -t /run/user/"$(id -u)"/.mutter-Xwaylandauth.* 2>/dev/null | head -1)"
if [ -z "$XAUTH_FILE" ] || [ ! -S /tmp/.X11-unix/X0 ]; then
  log "No desktop display found (is the user logged in on the screen?). Cannot run headed Chromium."
  exit 5
fi
export XAUTH_FILE

STATE_DIR="$(grep -m1 '^DEALS_STATE_DIR=' .env | cut -d= -f2-)"
mkdir -p "$STATE_DIR/browser-profile" "$STATE_DIR/state" samples
chmod 700 "$STATE_DIR"

KIOSK_WAS_UP=0
if pgrep -f -- "--kiosk -P mirror" >/dev/null; then KIOSK_WAS_UP=1; fi

restore() {
  if [ "$KIOSK_WAS_UP" = 1 ] && ! pgrep -f -- "--kiosk -P mirror" >/dev/null; then
    log "Reopening the MagicMirror kiosk"
    DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR="/run/user/$(id -u)" \
      DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" \
      setsid nohup "$KIOSK" >/dev/null 2>&1 < /dev/null &
  fi
}
trap restore EXIT INT TERM

if [ "$KIOSK_WAS_UP" = 1 ]; then
  log "Closing the MagicMirror kiosk for the run"
  pkill -f -- "--kiosk -P mirror"
  sleep 3
fi

log "Starting worker: $CMD"
docker compose --profile worker run --rm -T deals-worker "$CMD"
CODE=$?
case $CODE in
  0) log "Worker finished OK" ;;
  2) log "Kroger session expired. Coupons were still read signed out if allowed. Run: $0 login" ;;
  4) log "Worker could not reach the Deals server (is 'docker compose up -d' running?)" ;;
  *) log "Worker failed with exit code $CODE" ;;
esac
exit $CODE
