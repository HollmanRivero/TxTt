#!/usr/bin/env bash
# Commit + push nye filer til https://github.com/HollmanRivero/TxTt
# Kjør fra din egen Terminal:  bash push-changes.sh
set -euo pipefail

cd "$(dirname "$0")"

# Rydd vekk eventuell stale lock fra tidligere forsøk
rm -f .git/index.lock

# Stage de nye/endrede filene
git add ".github/workflows/setup_env.py" \
        "Nyttig scripts for TOKEN/" \
        "frontend/electron/" \
        "frontend/package.json" \
        "frontend/package-lock.json"

echo "--- Dette blir committet: ---"
git status --short

git commit -m "Add Supabase token-setup scripts, Electron build + CI env workflow

- Nyttig scripts for TOKEN/: setup-env.sh, setup-env.ps1, instruksjoner
- .github/workflows/setup_env.py
- frontend/electron/main.cjs + Electron/DMG-build i package.json
- Fjernet ugyldig 'package.json' dependency"

git push origin main

echo "--- Ferdig pushet til origin/main ---"
