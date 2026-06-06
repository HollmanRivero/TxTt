#!/usr/bin/env bash
# ============================================================
#  token-meny.sh  -  TxTt2.05.10  (macOS)
#  Nummerert meny for Supabase access token / .env.local.
#  Kjor fra app-mappen:   bash "Nyttig scripts for TOKEN/token-meny.sh"
#  (bruker curl + python3, begge standard paa macOS)
# ============================================================
set -uo pipefail

API="https://api.supabase.com/v1"
TOKEN_URL="https://supabase.com/dashboard/account/tokens"

# .env.local skrives i prosjektets frontend-mappe.
# Scriptet ligger i  <rot>/Nyttig scripts for TOKEN/ , saa gaa ett hakk opp.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_DIR="$ROOT/frontend"
[ -d "$ENV_DIR" ] || ENV_DIR="$ROOT"
ENV_PATH="$ENV_DIR/.env.local"

pause() { echo; read -r -p "Trykk Enter for aa ga tilbake til menyen ..." _; }

open_link() {
  echo
  echo "Aapner: $TOKEN_URL"
  if command -v open >/dev/null 2>&1; then open "$TOKEN_URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$TOKEN_URL"
  else echo "Kopier lenken manuelt: $TOKEN_URL"; fi
  pause
}

setup_env() {
  echo
  echo "=== Sett opp .env.local (Supabase) ==="
  echo "1. Aapne: $TOKEN_URL"
  echo "2. Trykk 'Generate new token', kopier den (starter med sbp_)."
  echo
  read -r -p "Lim inn din Supabase access token: " TOKEN
  if [ -z "${TOKEN// }" ]; then echo "Ingen token oppgitt. Avbryter."; pause; return; fi

  PROJECTS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/projects") || {
    echo "Naadde ikke Supabase. Er token riktig?"; pause; return; }

  REF=$(python3 - "$PROJECTS_JSON" <<'PY'
import sys, json
try:
    projects = json.loads(sys.argv[1])
except Exception:
    print("ERR_PARSE"); sys.exit(0)
if not isinstance(projects, list) or len(projects) == 0:
    print("ERR_NONE"); sys.exit(0)
if len(projects) == 1:
    print(projects[0]["id"]); sys.exit(0)
sys.stderr.write("\nHvilket prosjekt gjelder det?\n")
for i, p in enumerate(projects):
    sys.stderr.write("  [%d] %s   (%s)\n" % (i + 1, p.get("name", "?"), p["id"]))
sys.stderr.write("Skriv nummeret: ")
sys.stderr.flush()
try:
    choice = int(open("/dev/tty").readline().strip()) - 1
    print(projects[choice]["id"])
except Exception:
    print("ERR_CHOICE")
PY
)

  case "$REF" in
    ERR_PARSE)  echo "Kunne ikke lese Supabase-svaret."; pause; return ;;
    ERR_NONE)   echo "Fant ingen prosjekter. Lag ett paa supabase.com forst."; pause; return ;;
    ERR_CHOICE) echo "Ugyldig valg. Avbryter."; pause; return ;;
  esac

  SUPABASE_URL="https://$REF.supabase.co"
  KEYS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/projects/$REF/api-keys")
  ANON_KEY=$(python3 - "$KEYS_JSON" <<'PY'
import sys, json
keys = json.loads(sys.argv[1])
for k in keys:
    if k.get("type") == "publishable":
        print(k["api_key"]); sys.exit(0)
for k in keys:
    if k.get("name") == "anon":
        print(k["api_key"]); sys.exit(0)
print("")
PY
)
  if [ -z "$ANON_KEY" ]; then
    echo "Fant ingen offentlig (publishable/anon) noekkel for prosjektet."; pause; return; fi

  cat > "$ENV_PATH" <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF
  echo
  echo "Ferdig. Skrev $ENV_PATH"
  echo "  VITE_SUPABASE_URL      = $SUPABASE_URL"
  echo "  VITE_SUPABASE_ANON_KEY = ${ANON_KEY:0:12}..."
  pause
}

show_env() {
  echo
  if [ -f "$ENV_PATH" ]; then
    echo "Naavaerende $ENV_PATH:"
    # vis URL, men masker noekkelen
    while IFS= read -r line; do
      case "$line" in
        VITE_SUPABASE_ANON_KEY=*) echo "  VITE_SUPABASE_ANON_KEY=${line:23:12}..." ;;
        *) echo "  $line" ;;
      esac
    done < "$ENV_PATH"
  else
    echo "Ingen .env.local funnet enno ($ENV_PATH)."
    echo "Velg [1] for aa lage den."
  fi
  pause
}

while true; do
  clear 2>/dev/null || true
  echo "============================================"
  echo "   TxTt - Access Token / .env.local"
  echo "============================================"
  echo "  1) Sett opp .env.local (lim inn access token)"
  echo "  2) Aapne token-siden i nettleseren"
  echo "  3) Vis naavaerende .env.local"
  echo "  0) Avslutt"
  echo "--------------------------------------------"
  read -r -p "Velg [0-3]: " valg
  case "$valg" in
    1) setup_env ;;
    2) open_link ;;
    3) show_env ;;
    0|q|Q) echo "Ha det!"; exit 0 ;;
    *) echo "Ugyldig valg."; sleep 1 ;;
  esac
done
