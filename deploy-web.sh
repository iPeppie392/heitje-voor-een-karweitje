#!/usr/bin/env bash
# Bouwt de app als website en zet hem live op Vercel.
# Vaste URL: https://heitje-voor-een-karweitje-five.vercel.app
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Vercel-token uit ~/.env
TOKEN="$(grep '^VERCEL_TOKEN' "$HOME/.env" | cut -d= -f2- | tr -d '"'\'' ')"
SCOPE="i-peppie392"
PROJECT_ID="prj_SJOai26qUeTQIO8a2iIWnpIsWh2Y"
ORG_ID="team_EcHX2biPsRLVz7eeMAFthb4r"

echo "1/2  Website bouwen..."
rm -rf dist
npx expo export --platform web >/dev/null

echo "2/2  Live zetten op Vercel..."
mkdir -p dist/.vercel
printf '{"projectId":"%s","orgId":"%s"}' "$PROJECT_ID" "$ORG_ID" > dist/.vercel/project.json
npx vercel deploy dist --prod --yes --scope "$SCOPE" --token="$TOKEN" >/dev/null

echo "Klaar: https://heitje-voor-een-karweitje-five.vercel.app"
