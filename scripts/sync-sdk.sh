#!/usr/bin/env bash
# Builds the SDK's protocol core to WebAssembly and copies its conformance
# vectors and the sources the pages quote, so the site runs the real core.
# Needs Rust 1.98.1 or later with the wasm32-unknown-unknown target, and
# wasm-pack 0.13.1.
#
#   bash scripts/sync-sdk.sh [checkout of sdk-beta] [checkout of sdk-full/40-docs-ci]
#
# The live pages run the beta (`sdk-beta`). The parked pages run the full
# stack frozen at `sdk-full/40-docs-ci`, which has the sinks and durable mode.
# Without a path the script clones each branch into .sdk/. Commit the results:
# the static host builds the site without Rust.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
SDK_REPO=https://github.com/bobbyiliev/materialize.git
LIVE_BRANCH=sdk-beta
PARKED_BRANCH=sdk-full/40-docs-ci

# Prints the path of a checkout of branch $1, cloning into $2 if $3 is empty.
checkout() {
  local branch=$1 dir=$2 given=$3
  if [ -n "$given" ]; then
    echo "$given"
    return
  fi
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch -q --depth 1 origin "$branch"
    git -C "$dir" checkout -q FETCH_HEAD
  else
    git clone -q --depth 1 --branch "$branch" "$SDK_REPO" "$dir"
  fi
  echo "$dir"
}

# Builds one checkout into the given outputs: sync <checkout> <branch> <wasm
# dir> <vectors dir> <source dir> <version file> <quoted file>...
sync() {
  local checkout=$1 branch=$2 wasm=$3 vectors=$4 source=$5 version=$6
  shift 6
  local sdk="$checkout/misc/materialize-sdk"
  local commit sdk_abs
  commit=$(git -C "$checkout" rev-parse HEAD)
  sdk_abs=$(cd "$sdk" && pwd)
  # The remaps keep local paths, such as the home folder, out of the panic
  # messages compiled into the binary. The last matching remap applies.
  (cd "$sdk/node" && env RUSTFLAGS="--remap-path-prefix=$HOME=/home --remap-path-prefix=$sdk_abs=/sdk" \
    wasm-pack build --release --target web \
    --out-dir "$root/$wasm" --out-name sdk_core --no-pack)
  rm -f "$wasm/.gitignore"
  rm -rf "$vectors" && mkdir -p "$vectors"
  cp "$sdk"/conformance/*.json "$vectors/"
  # The parked vectors keep only the functions the beta core lacks.
  if [ -n "${SKIP_VECTORS_IN:-}" ]; then
    for v in "$SKIP_VECTORS_IN"/*.json; do rm -f "$vectors/$(basename "$v")"; done
  fi
  rm -rf "$source" && mkdir -p "$source"
  for f in "$@"; do
    mkdir -p "$source/$(dirname "$f")"
    cp "$sdk/$f" "$source/$f"
  done
  printf '{ "branch": "%s", "commit": "%s" }\n' "$branch" "$commit" > "$version"
  echo "Synced $branch at $commit: the core and $(ls "$vectors" | wc -l | tr -d ' ') vector files."
}

live=$(checkout "$LIVE_BRANCH" .sdk/beta "${1:-}")
parked=$(checkout "$PARKED_BRANCH" .sdk/parked "${2:-}")

sync "$live" "$LIVE_BRANCH" src/core/wasm src/vectors src/source src/sdk-version.json \
  rust/src/live.rs rust/examples/valkey.rs core/src/batch.rs core/src/classify.rs \
  core/src/statement.rs core/src/subscription.rs python/materialize_sdk/_live.py node/ts/live.ts

# The parked pages quote only what the beta does not have.
SKIP_VECTORS_IN=src/vectors sync "$parked" "$PARKED_BRANCH" src/core/wasm-parked src/vectors-parked src/source-parked \
  src/sdk-version-parked.json \
  rust/src/sink.rs rust/src/durable.rs rust/examples/postgres_sink.rs \
  turbopuffer/examples/search.rs turbopuffer/src/sink.rs core/src/checkpoint.rs
