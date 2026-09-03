#!/usr/bin/env bash
# Quorum — clean checkout to running demo.
# Usage: ./init.sh            start the dev server
#        ./init.sh --check    verify environment + Gonka connectivity, then exit
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\033[36m│\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m│ ok\033[0m %s\n' "$*"; }
die()  { printf '\033[31m│ !!\033[0m %s\n' "$*" >&2; exit 1; }

printf '\033[36m┌─ Quorum ───────────────────────────────────────\033[0m\n'

# 1. toolchain
command -v node >/dev/null || die "node not found. Install Node.js 20 or newer."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found; Quorum needs Node 20+."
ok "node $(node -v)"

# 2. secrets
if [ ! -f .env ]; then
  cp .env.example .env
  die ".env was missing — created one from .env.example. Put your Gonka Router key in it, then re-run ./init.sh"
fi
set -a; . ./.env; set +a
[ "${GONKA_API_KEY:-}" != "" ] || die "GONKA_API_KEY is empty in .env — get a key at https://gonkarouter.io"
case "${GONKA_API_KEY}" in sk-your-gonka*) die "GONKA_API_KEY is still the placeholder from .env.example.";; esac
: "${GONKA_BASE_URL:=https://api.gonkarouter.io/v1}"
ok "GONKA_API_KEY loaded (${#GONKA_API_KEY} chars, not printed)"

# 3. deps
if [ ! -d node_modules ]; then
  say "installing dependencies…"
  npm install --no-audit --no-fund
fi
ok "dependencies present"

# 4. live Gonka connectivity — the hard requirement of the brief
say "checking Gonka Router connectivity…"
MODELS="$(curl -sS --max-time 30 "${GONKA_BASE_URL}/models" -H "Authorization: Bearer ${GONKA_API_KEY}")" \
  || die "could not reach ${GONKA_BASE_URL}/models"
echo "$MODELS" | grep -q '"data"' || die "unexpected response from Gonka Router: ${MODELS:0:200}"
COUNT="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).data.length)}catch(e){console.log(0)}})' <<<"$MODELS")"
[ "$COUNT" -ge 2 ] || die "Gonka Router returned $COUNT model(s); Quorum needs at least 2."
ok "Gonka Router reachable — $COUNT models available"

if [ "${1:-}" = "--check" ]; then
  printf '\033[32m└─ environment ok ───────────────────────────────\033[0m\n'
  exit 0
fi

printf '\033[36m└─ starting dev server on http://localhost:3000 ─\033[0m\n'
exec npm run dev
