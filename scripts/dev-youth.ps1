# dev-youth.ps1 — starts AI service in background, Expo in foreground
# Usage: npm run dev:youth

$root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Village — Youth Dev Mode" -ForegroundColor Cyan
Write-Host "  AI service + Expo (LAN)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Start AI service in a hidden background window ──────────────────────────
Write-Host "[1/2] Starting AI service (port 4006)..." -ForegroundColor Red
$ai = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c npm run dev --prefix `"$root\backend\services\ai-service`" 2>&1" `
  -WindowStyle Minimized `
  -PassThru

# Give it 2 seconds to boot before Expo starts
Start-Sleep -Seconds 2

Write-Host "      AI service PID: $($ai.Id)" -ForegroundColor DarkGray
Write-Host ""

# ── Start Expo in THIS terminal (full interactive TTY) ──────────────────────
Write-Host "[2/2] Starting Expo (LAN mode, cache cleared)..." -ForegroundColor Green
Write-Host "      Scan the QR code with Expo Go on your phone." -ForegroundColor DarkGray
Write-Host ""

Set-Location $root

try {
  npx expo start --lan --clear
} finally {
  # When Expo exits (Ctrl+C), also kill the background AI service
  Write-Host ""
  Write-Host "Shutting down AI service (PID $($ai.Id))..." -ForegroundColor Yellow
  Stop-Process -Id $ai.Id -Force -ErrorAction SilentlyContinue
  Write-Host "Done." -ForegroundColor Green
}
