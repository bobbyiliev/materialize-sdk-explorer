#!/usr/bin/env bash
# Runs the SDK's Valkey example: it keeps the Valkey hash `orders` equal to the
# Materialize table `orders`, keyed by `id`. Starts a throwaway Valkey on port
# 16379 first. Each start loads a new snapshot and swaps it in with one RENAME.
#
# Look at the hash with:
#   docker exec valkey-sdk-demo valkey-cli HGETALL orders
set -euo pipefail
cd "$(dirname "$0")/../.sdk/misc/materialize-sdk"
if ! docker ps --format '{{.Names}}' | grep -qx valkey-sdk-demo; then
  docker run -d --rm --name valkey-sdk-demo -p 16379:6379 valkey/valkey:9.0.6 >/dev/null
  sleep 1
fi
MATERIALIZE_URL="host=localhost port=26875 user=materialize sslmode=disable" \
VALKEY_URL=redis://localhost:16379 \
SOURCE="${SOURCE:-orders}" \
KEY="${KEY:-id}" \
cargo run -q --release --example valkey
