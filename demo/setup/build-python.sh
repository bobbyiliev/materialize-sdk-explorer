#!/usr/bin/env bash
# Builds the Python package into demo/2-python/.venv. Needs Python 3.10 or
# later and Rust 1.98.1 or later.
set -euo pipefail
cd "$(dirname "$0")/../2-python"
python3 -m venv .venv
.venv/bin/pip install -q "maturin>=1.9,<2"
(source .venv/bin/activate && cd ../.sdk/misc/materialize-sdk/python && maturin develop -q --release)
echo "Done. Run: cd demo/2-python && source .venv/bin/activate && python live.py"
