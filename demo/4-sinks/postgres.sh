#!/usr/bin/env bash
# Runs the Postgres sink example: it keeps a Postgres table equal to the
# Materialize table `orders`, with each batch and its checkpoint in one
# Postgres transaction. Starts a throwaway Postgres on port 15432 first.
#
# Stop it with Ctrl+C and start it again: it resumes from its checkpoint.
# Look at the target with:
#   psql postgres://postgres@localhost:15432/postgres -c "SELECT row, count FROM mz_rows ORDER BY row"
set -euo pipefail
cd "$(dirname "$0")/../.sdk/misc/materialize-sdk"
if ! docker ps --format '{{.Names}}' | grep -qx pg-sdk-demo; then
  docker run -d --rm --name pg-sdk-demo -e POSTGRES_HOST_AUTH_METHOD=trust -p 15432:5432 postgres:17 >/dev/null
  sleep 3
fi
MATERIALIZE_URL="host=localhost port=26875 user=materialize sslmode=disable" \
POSTGRES_URL="host=localhost port=15432 user=postgres sslmode=disable" \
SOURCE="${SOURCE:-materialize.public.orders}" \
SINK_ID="${SINK_ID:-postgres-demo}" \
cargo run -q --release --example postgres_sink
