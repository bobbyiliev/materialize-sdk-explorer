#!/usr/bin/env bash
# Checks out the SDK beta from the sdk-beta branch into demo/.sdk. With
# `parked`, checks out the frozen full stack, which has the parked sinks, into
# demo/.sdk-parked instead. Only the SDK's folder is fetched, not the whole
# Materialize repository. Run it again to update.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=https://github.com/bobbyiliev/materialize.git
if [ "${1:-}" = parked ]; then
  BRANCH=sdk-full/40-docs-ci DIR=.sdk-parked
else
  BRANCH=sdk-beta DIR=.sdk
fi
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --depth 1 origin "$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" --filter=blob:none --sparse "$REPO" "$DIR"
  git -C "$DIR" sparse-checkout set misc/materialize-sdk
fi
echo "The SDK is in demo/$DIR/misc/materialize-sdk at $(git -C "$DIR" rev-parse --short HEAD)."
