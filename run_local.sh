#!/usr/bin/env bash
# Quick launcher for local testing: reads .env (if present), then starts uvicorn.
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
PYTHONPATH=. exec ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 9105 "$@"
