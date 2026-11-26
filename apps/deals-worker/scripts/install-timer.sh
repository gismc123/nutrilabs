#!/usr/bin/env bash
# Install the Deals coupon refresh as a systemd USER timer. It checks every minute
# and NutriLabs decides when a refresh runs (nightly, or scheduled in Deals > Store).
# Changes files outside the repo (~/.config/systemd/user, ~/.local/state/nutrilabs-deals),
# so run it yourself after reading it. Undo: scripts/install-timer.sh --remove
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
LOG_DIR="$HOME/.local/state/nutrilabs-deals"
UNITS=(nutrilabs-deals-coupons.service nutrilabs-deals-coupons.timer)

if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now nutrilabs-deals-coupons.timer 2>/dev/null || true
  for u in "${UNITS[@]}"; do rm -f "$UNIT_DIR/$u"; done
  ( crontab -l 2>/dev/null | grep -v 'nutrilabs-deals-logrotate' || true ) | crontab -
  systemctl --user daemon-reload
  echo "Removed the Deals coupon timer."
  exit 0
fi

mkdir -p "$UNIT_DIR" "$LOG_DIR"
for u in "${UNITS[@]}"; do
  sed -e "s|@DEALS_DIR@|$DIR|g" -e "s|@LOG_DIR@|$LOG_DIR|g" "$DIR/scripts/systemd/$u" > "$UNIT_DIR/$u"
done
sed -e "s|@LOG_DIR@|$LOG_DIR|g" "$DIR/scripts/systemd/logrotate.conf" > "$LOG_DIR/logrotate.conf"
# Weekly log rotation with the user's own state file (no root needed).
( crontab -l 2>/dev/null | grep -v 'nutrilabs-deals-logrotate' || true
  echo "15 5 * * 0 /usr/sbin/logrotate -s $LOG_DIR/logrotate.state $LOG_DIR/logrotate.conf # nutrilabs-deals-logrotate" ) | crontab -
systemctl --user daemon-reload
systemctl --user enable --now nutrilabs-deals-coupons.timer
# Timers in a user session keep running after logout only with lingering on.
loginctl show-user "$USER" -p Linger | grep -q yes || echo "Note: run 'loginctl enable-linger $USER' if timers should run while logged out (the coupon sync falls back to a virtual screen, so it works with nobody logged in)."
systemctl --user list-timers 'nutrilabs-deals-*'
