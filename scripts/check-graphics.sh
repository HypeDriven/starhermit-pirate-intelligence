#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
runtime="${STARHERMIT_BIN:-starhermit}"
fixture="$(mktemp -d /tmp/pirate-graphics.XXXXXX)"
trap 'rm -rf "$fixture"' EXIT
cp -R src "$fixture/src"
cp tests/fixtures/graphics-scene.ts "$fixture/src/graphics-check.ts"
cat > "$fixture/starhermit.txt" <<'MANIFEST'
name=Pirate Intelligence graphics check
engine.api=1
engine.version=1.39.0
engine.minor=39
engine.entry=src/graphics-check.ts
engine.limits.image_mib=512
engine.limits.mesh_mib=256
engine.limits.heap_mib=512
engine.param.quality-sweep=
MANIFEST
if [[ "${1:-}" == "--headless" ]]; then
  "$runtime" check "$fixture" --param quality-sweep=true
else
  "$runtime" "$fixture" --render-check --quality "${1:-infinite}" --script "${GRAPHICS_PLAY:-tests/fixtures/graphics-play.txt}"
fi
