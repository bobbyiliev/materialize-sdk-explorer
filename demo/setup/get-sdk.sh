#!/usr/bin/env bash
# Checks out the SDK from the sdk-preview branch into demo/.sdk. Only the
# SDK's folder is fetched, not the whole Materialize repository.
# Run it again to update.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=https://github.com/bobbyiliev/materialize.git
BRANCH=sdk-preview
if [ -d .sdk/.git ]; then
  git -C .sdk pull -q --depth 1 origin "$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" --filter=blob:none --sparse "$REPO" .sdk
  git -C .sdk sparse-checkout set misc/materialize-sdk
fi
echo "The SDK is in demo/.sdk/misc/materialize-sdk at $(git -C .sdk rev-parse --short HEAD)."
