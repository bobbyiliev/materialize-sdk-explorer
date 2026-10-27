#!/usr/bin/env bash
# Runs the turbopuffer search sink: it keeps turbopuffer namespaces equal to
# the Materialize table `articles`, embeds `body` for search by meaning, and
# indexes it for search by words. Needs a turbopuffer API key in
# TURBOPUFFER_API_KEY.
#
#   bash turbopuffer.sh sink                      # run the sink
#   bash turbopuffer.sh search "a kitten resting" # search, in a second terminal
set -euo pipefail
: "${TURBOPUFFER_API_KEY:?set TURBOPUFFER_API_KEY to a turbopuffer API key}"
cd "$(dirname "$0")/../.sdk/misc/materialize-sdk"
export MATERIALIZE_URL="host=localhost port=26875 user=materialize"
export SOURCE="${SOURCE:-materialize.public.articles}" KEY="${KEY:-id}" EMBED="${EMBED:-body}" FULL_TEXT="${FULL_TEXT:-body}"
export NAME="${NAME:-$(whoami)-sdk-demo}"
cargo run -q --release -p materialize-sdk-turbopuffer --example search -- "$@"
