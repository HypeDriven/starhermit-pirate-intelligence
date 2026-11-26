#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT
cargo build --manifest-path tools/crew-voice/Cargo.toml --locked --release \
  --target wasm32-unknown-unknown --target-dir "$build_dir"
install -m 0644 "$build_dir/wasm32-unknown-unknown/release/pirate_crew_voice.wasm" assets/voices/chimera.wasm
