#!/usr/bin/env bash
# Builds the Node package in demo/.sdk. Needs Node 22 or later, Rust 1.98.1 or
# later with the wasm32-unknown-unknown target, and wasm-pack 0.13.1
# (cargo install wasm-pack --version 0.13.1 --locked).
set -euo pipefail
cd "$(dirname "$0")/../.sdk/misc/materialize-sdk/node"
npm ci -s
npm run -s build
echo "Done. Run: cd demo/3-node && node live.mjs"
