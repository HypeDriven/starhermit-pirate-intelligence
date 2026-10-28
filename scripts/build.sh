#!/usr/bin/env bash
set -euo pipefail
STARHERMIT_RUNTIME="${STARHERMIT_BIN:-starhermit}"
"$STARHERMIT_RUNTIME" check .
node --test tests/server.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
UPLOAD_BUILD="$(mktemp -d /tmp/pirate-intelligence-web.XXXXXX)"
trap 'rm -rf "$UPLOAD_BUILD"' EXIT
"$STARHERMIT_RUNTIME" package --web . --out "$UPLOAD_BUILD"
mkdir -p dist
cp -R "$UPLOAD_BUILD"/. dist/
cp dist/index.html index.html
cp dist/starhermit-files.json starhermit-files.json
python - <<'BUILD'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
with ZipFile('dist/pirate-intelligence-source.zip', 'w', ZIP_DEFLATED) as archive:
    for folder in ['src','companion','tests','scripts']:
        for p in sorted(Path(folder).rglob('*')):
            if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc':
                archive.write(p, 'pirate-intelligence/'+str(p))
    for name in ['README.md','DESIGN.md','LICENSE','server.js','starhermit.txt','tsconfig.json','.gitignore','.starhermitignore','index.html','starhermit-files.json']:
        archive.write(name,'pirate-intelligence/'+name)
BUILD
