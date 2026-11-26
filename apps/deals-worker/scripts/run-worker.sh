#!/usr/bin/env bash
# Run the coupon worker on the desktop display.
#   scripts/run-worker.sh sync       nightly read-only coupon sync (what the timer runs)
#   scripts/run-worker.sh login      sign in to Kroger in a visible window (owner types the password)
#   scripts/run-worker.sh discover   dump the live coupon API shape to samples/
#
# Kroger blocks headless browsers, so the worker always opens a real Chromium
# window. Where it draws that window:
#   * a screen is plugged in and the desktop is running: on the desktop. If the
#     MagicMirror kiosk is showing there, it is closed for the run and always
#     reopened afterward, even when the sync fails.
#   * no screen, or nobody logged in (for example after a reboot): on a private
#     virtual screen inside the worker container. Nothing on the desktop changes.
# Override with DEALS_DISPLAY_MODE=screen|virtual (env or root .env). Default auto.
set -uo pipefail

CMD="${1:-sync}"
case "$CMD" in sync|login|discover) ;; *) echo "Usage: $0 sync|login|discover" >&2; exit 1 ;; esac

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"   # NutriLabs repo root: docker-compose.yml and .env
cd "$ROOT"
KIOSK="$HOME/Documents/MagicMirror/scripts/kiosk.sh"
LOCK="${XDG_RUNTIME_DIR:-/tmp}/nutrilabs-deals-worker.lock"
log() { echo "[$(date -Is)] $*"; }

exec 9>"$LOCK"
if ! flock -n 9; then log "Another worker run is in progress. Exiting."; exit 0; fi

UID_N="$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$UID_N}"

# True when GNOME reports at least one monitor. The NVIDIA driver does not fill
# in /sys/class/drm/*/status, so ask the desktop itself, then fall back to sysfs.
screen_plugged_in() {
  local state
  state="$(DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus" timeout 5 gdbus call --session \
    --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.GetCurrentState 2>/dev/null)"
  if [ -n "$state" ]; then
    # Reply is (serial, monitors, ...). An empty monitor list prints as "@a(...) []".
    local re='^\(uint32 [0-9]+, \[\('
    [[ "$state" =~ $re ]]; return
  fi
  grep -qx connected /sys/class/drm/card*-*/status 2>/dev/null
}

MODE="${DEALS_DISPLAY_MODE:-$(grep -m1 '^DEALS_DISPLAY_MODE=' .env 2>/dev/null | cut -d= -f2-)}"
MODE="${MODE:-auto}"
# The desktop session's Xwayland auth file (its name changes on every login).
XAUTH_FILE="$(ls -t "$XDG_RUNTIME_DIR"/.mutter-Xwaylandauth.* 2>/dev/null | head -1)"
DESKTOP_UP=0
if [ -n "$XAUTH_FILE" ] && [ -S /tmp/.X11-unix/X0 ]; then DESKTOP_UP=1; fi

case "$MODE" in
  screen)  USE_SCREEN=1 ;;
  virtual) USE_SCREEN=0 ;;
  *) if [ "$DESKTOP_UP" = 1 ] && screen_plugged_in; then USE_SCREEN=1; else USE_SCREEN=0; fi ;;
esac

if [ "$USE_SCREEN" = 1 ] && [ "$DESKTOP_UP" = 0 ]; then
  log "DEALS_DISPLAY_MODE=screen but no desktop session is running on the screen."
  exit 5
fi
if [ "$USE_SCREEN" = 0 ] && [ "$CMD" = login ]; then
  log "Login needs you to see and type into the window, so it needs a plugged-in screen and a logged-in desktop."
  exit 5
fi

if [ "$USE_SCREEN" = 1 ]; then
  log "Display: desktop screen"
  export XAUTH_FILE DEALS_VIRTUAL_DISPLAY=0
else
  log "Display: virtual screen (no monitor detected or desktop not running)"
  unset XAUTH_FILE
  export DEALS_VIRTUAL_DISPLAY=1
fi

STATE_DIR="$(grep -m1 '^DEALS_STATE_DIR=' .env | cut -d= -f2-)"
if [ -z "$STATE_DIR" ]; then log "Set DEALS_STATE_DIR in $ROOT/.env (a folder outside the repo)."; exit 1; fi
export DEALS_STATE_DIR="$STATE_DIR"
mkdir -p "$STATE_DIR/browser-profile" "$STATE_DIR/state" "$DIR/samples"
chmod 700 "$STATE_DIR"

KIOSK_WAS_UP=0
if [ "$USE_SCREEN" = 1 ] && pgrep -f -- "--kiosk -P mirror" >/dev/null; then KIOSK_WAS_UP=1; fi

restore() {
  if [ "$KIOSK_WAS_UP" = 1 ] && ! pgrep -f -- "--kiosk -P mirror" >/dev/null; then
    log "Reopening the MagicMirror kiosk"
    DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 \
      DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus" \
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
docker compose --profile deals-worker run --rm -T deals-worker "$CMD"
CODE=$?
case $CODE in
  0) log "Worker finished OK" ;;
  2) log "Kroger session expired. Coupons were still read signed out if allowed. Run: $0 login" ;;
  4) log "Worker could not reach the NutriLabs API (is NutriLabs running? ./deploy.sh)" ;;
  *) log "Worker failed with exit code $CODE" ;;
esac
exit $CODE
