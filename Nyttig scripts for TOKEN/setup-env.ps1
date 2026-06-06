# ============================================================
#  setup-env.ps1  -  TxTt2.05.10 (Vite) Supabase auto-setup
#  Generates .env.local automatically from a user's own
#  Supabase project. The user only pastes ONE access token.
#
#  Run from the app's root folder:
#     powershell -ExecutionPolicy Bypass -File .\setup-env.ps1
# ============================================================

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== TxTt2.05.10  Supabase setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Step 1. Open this page in your browser:" -ForegroundColor Yellow
Write-Host "        https://supabase.com/dashboard/account/tokens"
Write-Host "Step 2. Click 'Generate new token', name it, copy it (starts with sbp_)."
Write-Host ""

$token = Read-Host "Paste your Supabase access token"
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "No token entered. Aborting." -ForegroundColor Red
    exit 1
}

$headers = @{ Authorization = "Bearer $($token.Trim())" }

# --- Get the user's projects --------------------------------
try {
    $projects = @(Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects" -Headers $headers -Method Get)
}
catch {
    Write-Host "Could not reach Supabase. Is the token correct?" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

if ($projects.Count -eq 0) {
    Write-Host "No Supabase projects found on this account." -ForegroundColor Red
    Write-Host "Create one at https://supabase.com/dashboard first, then re-run." -ForegroundColor Red
    exit 1
}

# --- Pick a project -----------------------------------------
if ($projects.Count -gt 1) {
    Write-Host ""
    Write-Host "Which project is this for?" -ForegroundColor Yellow
    for ($i = 0; $i -lt $projects.Count; $i++) {
        Write-Host ("  [{0}] {1}   ({2})" -f ($i + 1), $projects[$i].name, $projects[$i].id)
    }
    $sel = [int](Read-Host "Enter the number") - 1
    if ($sel -lt 0 -or $sel -ge $projects.Count) {
        Write-Host "Invalid choice. Aborting." -ForegroundColor Red
        exit 1
    }
    $project = $projects[$sel]
}
else {
    $project = $projects[0]
}

$ref         = $project.id
$supabaseUrl = "https://$ref.supabase.co"

# --- Get the API keys for that project ----------------------
$keys = @(Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/api-keys" -Headers $headers -Method Get)

# Prefer the new 'publishable' key; fall back to legacy 'anon'.
$anonKey = ($keys | Where-Object { $_.type -eq 'publishable' } | Select-Object -First 1).api_key
if (-not $anonKey) {
    $anonKey = ($keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
}
if (-not $anonKey) {
    Write-Host "Could not find a public (publishable/anon) key for this project." -ForegroundColor Red
    exit 1
}

# --- Write .env.local next to this script -------------------
$envPath = Join-Path $PSScriptRoot ".env.local"
$content = @"
VITE_SUPABASE_URL=$supabaseUrl
VITE_SUPABASE_ANON_KEY=$anonKey
"@
Set-Content -Path $envPath -Value $content -Encoding UTF8

Write-Host ""
Write-Host "Done. Wrote $envPath" -ForegroundColor Green
Write-Host ("  VITE_SUPABASE_URL      = {0}" -f $supabaseUrl)
Write-Host ("  VITE_SUPABASE_ANON_KEY = {0}..." -f $anonKey.Substring(0, [Math]::Min(12, $anonKey.Length)))
Write-Host ""
Write-Host "You can now run the app." -ForegroundColor Cyan
