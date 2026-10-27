#!/usr/bin/env bash
# Starts Materialize in Docker on port 26875 (SQL) and 26877 (system), and
# turns on RETAIN HISTORY, which a durable sink needs to resume.
set -euo pipefail
URL="postgres://materialize@localhost:26875/materialize"
ready() { psql "$URL" -qtAc "select 1" >/dev/null 2>&1; }
if ! ready; then
  docker rm -f mz-sdk-demo >/dev/null 2>&1 || true
  docker run -d --name mz-sdk-demo -p 26875:6875 -p 26877:6877 materialize/materialized:latest >/dev/null
  echo "Starting Materialize..."
  for _ in $(seq 1 90); do ready && break; sleep 2; done
  ready || { echo "Materialize did not start. See: docker logs mz-sdk-demo"; exit 1; }
fi
psql "postgres://mz_system@localhost:26877/materialize" -qc \
  "ALTER SYSTEM SET enable_logical_compaction_window = true"
echo "Materialize is up. Connect with: psql $URL"
