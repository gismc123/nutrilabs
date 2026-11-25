#!/usr/bin/env bash
# Install the nightly coupon sync and weekly backup as systemd USER timers.
# Changes files outside the repo (~/.config/systemd/user, ~/.local/state/krogerdeals),
# so run it yourself after reading it. Undo: scripts/install-timer.sh --remove
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
LOG_DIR="$HOME/.local/state/krogerdeals"
UNITS=(krogerdeals-coupons.service krogerdeals-coupons.timer krogerdeals-backup.service krogerdeals-backup.timer)

if [ "${1:-}" = "--remove" ]; then
  systemctl --user disable --now krogerdeals-coupons.timer krogerdeals-backup.timer 2>/dev/null || true
  for u in "${UNITS[@]}"; do rm -f "$UNIT_DIR/$u"; done
  ( crontab -l 2>/dev/null | grep -v 'krogerdeals-logrotate' ) | crontab -
  systemctl --user daemon-reload
  echo "Removed KrogerDeals timers."
  exit 0
fi

mkdir -p "$UNIT_DIR" "$LOG_DIR"
for u in "${UNITS[@]}"; do
  sed -e "s|@DEALS_DIR@|$DIR|g" -e "s|@LOG_DIR@|$LOG_DIR|g" "$DIR/scripts/systemd/$u" > "$UNIT_DIR/$u"
done
sed -e "s|@LOG_DIR@|$LOG_DIR|g" "$DIR/scripts/systemd/logrotate.conf" > "$LOG_DIR/logrotate.conf"
# Weekly log rotation with the user's own state file (no root needed).
( crontab -l 2>/dev/null | grep -v 'krogerdeals-logrotate'
  echo "15 5 * * 0 /usr/sbin/logrotate -s $LOG_DIR/logrotate.state $LOG_DIR/logrotate.conf # krogerdeals-logrotate" ) | crontab -
systemctl --user daemon-reload
systemctl --user enable --now krogerdeals-coupons.timer krogerdeals-backup.timer
# Timers in a user session keep running after logout only with lingering on.
loginctl show-user "$USER" -p Linger | grep -q yes || echo "Note: run 'loginctl enable-linger $USER' if timers should run while logged out (the coupon sync needs the desktop session anyway)."
systemctl --user list-timers 'krogerdeals-*'
