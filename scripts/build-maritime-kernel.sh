#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rustc tools/maritime-kernel.rs --target wasm32-unknown-unknown --crate-type cdylib --edition 2021 \
  -C opt-level=3 -C panic=abort -C lto=fat -C strip=symbols -o assets/maritime.wasm
chmod 644 assets/maritime.wasm
