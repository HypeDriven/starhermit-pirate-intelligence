#!/usr/bin/env bash
# Registers the crew workshop's Pluck catalog for Pirate Intelligence.
# Needs the game OWNER's account token (dashboard login or CLI session), never a
# launch token: STARHERMIT_TOKEN=... scripts/register-pluck-items.sh
# Prices must match MOD_KINDS in server.js.
set -euo pipefail
: "${STARHERMIT_TOKEN:?set STARHERMIT_TOKEN to the game owner's account token}"
API="${STARHERMIT_API:-https://api.starhermit.com}/api/v1/me/github-games/546dae33-aa48-4775-bff9-c0c48deb759f/plucks/items"
while IFS='|' read -r key name price; do
  curl -fsS -X PUT "$API/$key" -H "Authorization: Bearer $STARHERMIT_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"price\":$price,\"active\":true}" >/dev/null
  echo "registered $key ($price PLK)"
done <<'ITEMS'
mod.sail|Crew-designed sail canvas|8
mod.hull|Crew-designed hull paint|10
mod.flag|Crew-designed colours|5
mod.clothing|Crew-designed clothing|4
mod.weapon|Crew-designed weapon|6
ITEMS
