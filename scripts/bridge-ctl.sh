#!/usr/bin/env bash
# bridge-ctl.sh — start | stop | restart | status the claude-control process bridge
#
# The bridge runs natively on macOS so it can see Claude Code processes via ps/lsof,
# then writes ~/.claude-control/processes.json for the containerized dashboard to read.
#
# Usage:
#   ./scripts/bridge-ctl.sh start
#   ./scripts/bridge-ctl.sh stop
#   ./scripts/bridge-ctl.sh restart
#   ./scripts/bridge-ctl.sh status
#
# Or via npm:
#   npm run bridge:start
#   npm run bridge:stop
#   npm run bridge:restart
#   npm run bridge:status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_SCRIPT="$SCRIPT_DIR/bridge.js"
CONFIG_DIR="$HOME/.claude-control"
PID_FILE="$CONFIG_DIR/bridge.pid"
LOG_FILE="$CONFIG_DIR/bridge.log"

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid=$(cat "$PID_FILE")
  kill -0 "$pid" 2>/dev/null
}

do_start() {
  if is_running; then
    echo "bridge already running (pid $(cat "$PID_FILE"))"
    return 0
  fi

  mkdir -p "$CONFIG_DIR"

  nohup node "$BRIDGE_SCRIPT" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "bridge started (pid $!)"
  echo "  log: $LOG_FILE"
}

do_stop() {
  if ! is_running; then
    echo "bridge not running"
    [[ -f "$PID_FILE" ]] && rm -f "$PID_FILE"
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
  kill "$pid"
  rm -f "$PID_FILE"
  echo "bridge stopped (pid $pid)"
}

do_restart() {
  do_stop
  sleep 0.5
  do_start
}

do_status() {
  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo "bridge running (pid $pid)"
    echo "  log:      $LOG_FILE"
    echo "  output:   $CONFIG_DIR/processes.json"

    if [[ -f "$CONFIG_DIR/processes.json" ]]; then
      local age
      age=$(( $(date +%s) - $(date -r "$CONFIG_DIR/processes.json" +%s) ))
      local count
      count=$(python3 -c "import json; d=json.load(open('$CONFIG_DIR/processes.json')); print(len(d['processes']))" 2>/dev/null || echo "?")
      echo "  sessions: $count claude process(es) | last write: ${age}s ago"
    else
      echo "  output:   not yet written"
    fi
  else
    echo "bridge not running"
  fi
}

# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

CMD="${1:-}"

case "$CMD" in
  start)   do_start   ;;
  stop)    do_stop    ;;
  restart) do_restart ;;
  status)  do_status  ;;
  *)
    echo "usage: $(basename "$0") {start|stop|restart|status}"
    exit 1
    ;;
esac
