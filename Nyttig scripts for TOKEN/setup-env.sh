#!/usr/bin/env bash
# ============================================================
#  setup-env.sh  -  TxTt2.05.10 (Vite) Supabase auto-setup (macOS)
#  Generates .env.local automatically from a user's own
#  Supabase project. The user only pastes ONE access token.
#
#  Run from the app's root folder:
#     bash setup-env.sh
#  (uses curl + python3, both standard on macOS)
# ============================================================
set -euo pipefail

API="https://api.supabase.com/v1"

echo ""
echo "=== TxTt2.05.10  Supabase setup ==="
echo ""
echo "Step 1. Open: https://supabase.com/dashboard/account/tokens"
echo "Step 2. Click 'Generate new token', copy it (starts with sbp_)."
echo ""
read -r -p "Paste your Supabase access token: " TOKEN

if [ -z "${TOKEN// }" ]; then
  echo "No token entered. Aborting."
  exit 1
fi

# --- Fetch the user's projects ------------------------------
PROJECTS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/projects") || {
  echo "Could not reach Supabase. Is the token correct?"; exit 1; }

# --- Let python pick the project ref, then print it ---------
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
# Multiple projects: ask on the terminal (stderr so it shows)
sys.stderr.write("\nWhich project is this for?\n")
for i, p in enumerate(projects):
    sys.stderr.write("  [%d] %s   (%s)\n" % (i + 1, p.get("name", "?"), p["id"]))
sys.stderr.write("Enter the number: ")
sys.stderr.flush()
try:
    choice = int(open("/dev/tty").readline().strip()) - 1
    print(projects[choice]["id"])
except Exception:
    print("ERR_CHOICE")
PY
)

case "$REF" in
  ERR_PARSE)  echo "Could not read Supabase response."; exit 1 ;;
  ERR_NONE)   echo "No Supabase projects found. Create one at supabase.com first."; exit 1 ;;
  ERR_CHOICE) echo "Invalid choice. Aborting."; exit 1 ;;
esac

SUPABASE_URL="https://$REF.supabase.co"

# --- Fetch API keys and extract the public (anon) key -------
KEYS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" "$API/projects/$REF/api-keys")

ANON_KEY=$(python3 - "$KEYS_JSON" <<'PY'
import sys, json
keys = json.loads(sys.argv[1])
# Prefer the new 'publishable' key, fall back to legacy 'anon'
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
  echo "Could not find a public (publishable/anon) key for this project."
  exit 1
fi

# --- Write .env.local next to this script -------------------
DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_PATH="$DIR/.env.local"
cat > "$ENV_PATH" <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
EOF

echo ""
echo "Done. Wrote $ENV_PATH"
echo "  VITE_SUPABASE_URL      = $SUPABASE_URL"
echo "  VITE_SUPABASE_ANON_KEY = ${ANON_KEY:0:12}..."
echo ""
echo "You can now run the app."
