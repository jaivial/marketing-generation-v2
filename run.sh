#!/bin/bash
set -e
PIDFILE=/home/jaime/run/marketing-generation.pid
LOGFILE=/home/jaime/run/marketing-generation.log
mkdir -p /home/jaime/run
case "$1" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
      echo "already running (pid $(cat $PIDFILE))"; exit 0
    fi
    cd /home/jaime/marketing-generation
    # Run as root so the listener is in a system-netns-allowed process
    sudo -n .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 9101 \
      >"$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 2
    echo "started pid=$(cat $PIDFILE) — log=$LOGFILE"
    ;;
  stop)
    [ -f "$PIDFILE" ] && sudo -n kill "$(cat $PIDFILE)" 2>/dev/null && rm -f "$PIDFILE" && echo "stopped"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
      echo "running pid=$(cat $PIDFILE)"
      ss -ltnp 2>/dev/null | grep ':9101' || echo "(no listener)"
    else echo "not running"; fi
    ;;
  *) echo "usage: $0 {start|stop|status}"; exit 2 ;;
esac
