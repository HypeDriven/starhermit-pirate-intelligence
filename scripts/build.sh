#!/usr/bin/env bash
set -euo pipefail
STARHERMIT_RUNTIME="${STARHERMIT_BIN:-starhermit}"
if [[ ! -f models/smollm2-135m-q8.gguf ]]; then
  python scripts/prepare-brain.py
fi
"$STARHERMIT_RUNTIME" check .
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
UPLOAD_BUILD="$(mktemp -d /tmp/pirate-intelligence-web.XXXXXX)"
REMOTE_BUILD="$(mktemp -d /tmp/pirate-intelligence-remote.XXXXXX)"
trap 'rm -rf "$UPLOAD_BUILD" "$REMOTE_BUILD"' EXIT
"$STARHERMIT_RUNTIME" package --web . --out "$UPLOAD_BUILD" --remote-out "$REMOTE_BUILD"
mkdir -p dist
cp -R "$UPLOAD_BUILD"/. dist/
mkdir -p dist/_remote
cp -R "$REMOTE_BUILD"/. dist/_remote/
cp dist/index.html index.html
cp dist/starhermit-files.json starhermit-files.json
cp dist/starhermit-remote.json starhermit-remote.json
python - <<'BUILD'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('dist/pirate-intelligence-source.zip', 'w', ZIP_DEFLATED) as archive:
    for folder in ['src','companion','tests','scripts','tools','models']:
        for p in sorted(Path(folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.pyc','.gguf']:
                archive.write(p, 'pirate-intelligence/'+str(p))
    for name in ['README.md','DESIGN.md','spec.md','LICENSE','LICENSE.md','server.js','starhermit.txt','tsconfig.json','package.json','.gitignore','.starhermitignore','index.html','starhermit-files.json','starhermit-remote.json']:
        archive.write(name,'pirate-intelligence/'+name)
BUILD
