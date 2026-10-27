#!/usr/bin/env bash
# Builds the SDK's protocol core to WebAssembly and copies its conformance
# vectors, so the site runs the real core. Needs Rust 1.98.1 or later with the
# wasm32-unknown-unknown target, and wasm-pack 0.13.1.
#
#   bash scripts/sync-sdk.sh [path to a checkout of the sdk-preview branch]
#
# Without a path it clones the branch into .sdk/. Commit the results: the
# static host builds the site without Rust.
set -euo pipefail
cd "$(dirname "$0")/.."
root=$PWD
SDK_REPO=https://github.com/bobbyiliev/materialize.git
SDK_BRANCH=sdk-preview
checkout="${1:-}"
if [ -z "$checkout" ]; then
  checkout=.sdk
  if [ -d "$checkout/.git" ]; then
    git -C "$checkout" fetch -q --depth 1 origin "$SDK_BRANCH"
    git -C "$checkout" checkout -q FETCH_HEAD
  else
    git clone -q --depth 1 --branch "$SDK_BRANCH" "$SDK_REPO" "$checkout"
  fi
fi
sdk="$checkout/misc/materialize-sdk"
commit=$(git -C "$checkout" rev-parse HEAD)

# The remaps keep local paths, such as the home folder, out of the panic
# messages compiled into the binary. The last matching remap applies.
sdk_abs=$(cd "$sdk" && pwd)
(cd "$sdk/node" && env RUSTFLAGS="--remap-path-prefix=$HOME=/home --remap-path-prefix=$sdk_abs=/sdk" \
  wasm-pack build --release --target web \
  --out-dir "$root/src/core/wasm" --out-name sdk_core --no-pack)
rm -f src/core/wasm/.gitignore
rm -f src/vectors/*.json
cp "$sdk"/conformance/*.json src/vectors/
# The sources the site quotes, so its code examples are the branch's code.
rm -rf src/source && mkdir -p src/source
for f in rust/src/live.rs rust/src/sink.rs rust/src/durable.rs rust/examples/postgres_sink.rs \
  turbopuffer/examples/search.rs turbopuffer/src/sink.rs core/src/batch.rs core/src/checkpoint.rs \
  core/src/classify.rs core/src/statement.rs core/src/subscription.rs \
  python/materialize_sdk/_live.py node/ts/live.ts; do
  mkdir -p "src/source/$(dirname "$f")"
  cp "$sdk/$f" "src/source/$f"
done
printf '{ "branch": "%s", "commit": "%s" }\n' "$SDK_BRANCH" "$commit" > src/sdk-version.json
echo "Synced the core and $(ls src/vectors | wc -l | tr -d ' ') vector files from $commit."
