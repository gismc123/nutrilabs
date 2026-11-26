#!/bin/sh
# Picks the display for the headed Chromium window.
#   DEALS_VIRTUAL_DISPLAY=1  start a private virtual screen (Xvfb) in this container.
#                            Still a real, non-headless browser, just drawn off screen.
#   otherwise                use the desktop display passed in from the host.
set -e

if [ "${DEALS_VIRTUAL_DISPLAY:-0}" = 1 ]; then
  # Started directly, not via xvfb-run, which hangs when it is the container's PID 1.
  unset XAUTHORITY
  export DISPLAY=:99
  Xvfb :99 -screen 0 1366x900x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
  XVFB=$!
  i=0
  while [ ! -S /tmp/.X11-unix/X99 ]; do
    i=$((i + 1))
    if [ "$i" -gt 50 ] || ! kill -0 "$XVFB" 2>/dev/null; then
      echo "Virtual screen did not start:" >&2; cat /tmp/xvfb.log >&2; exit 3
    fi
    sleep 0.2
  done
  set +e
  node src/cli.js "$@"
  CODE=$?
  kill "$XVFB" 2>/dev/null
  exit "$CODE"
fi

# The host X socket folder is mounted read-only at /tmp/.X11-unix-host so the
# virtual screen above can create its own socket. Link the desktop one in.
N="${DISPLAY#*:}"; N="${N%%.*}"
mkdir -p /tmp/.X11-unix
ln -sf "/tmp/.X11-unix-host/X$N" "/tmp/.X11-unix/X$N"
exec node src/cli.js "$@"
