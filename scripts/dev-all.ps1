# dev-all.ps1 - starts all 6 backend services in background, Expo in foreground
# Usage: npm run dev

$root = Split-Path $PSScriptRoot -Parent

$services = @(
  @{ name = "user-service";       port = 4001; color = "Blue"    },
  @{ name = "house-service";      port = 4002; color = "Green"   },
  @{ name = "journaling-service"; port = 4003; color = "Yellow"  },
  @{ name = "engagement-service"; port = 4004; color = "Magenta" },
  @{ name = "calendar-service";   port = 4005; color = "Cyan"    },
  @{ name = "ai-service";         port = 4006; color = "Red"     }
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Village - Full Dev Mode"               -ForegroundColor Cyan
Write-Host "  All services + Expo (LAN)"             -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start each backend service in a minimized background window
$processList = @()

foreach ($svc in $services) {
  Write-Host "  Starting $($svc.name) (port $($svc.port))..." -ForegroundColor $svc.color
  $svcPath = "$root\backend\services\$($svc.name)"
  $args = "/c npm run dev --prefix `"$svcPath`""
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList $args -WindowStyle Minimized -PassThru
  $processList += $p
}

Write-Host ""
Write-Host "  Waiting 3 seconds for services to boot..." -ForegroundColor DarkGray
Start-Sleep -Seconds 3

# Quick health check on each port
foreach ($svc in $services) {
  try {
    Invoke-WebRequest -Uri "http://localhost:$($svc.port)/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop | Out-Null
    Write-Host "  [OK] $($svc.name) :$($svc.port)" -ForegroundColor Green
  } catch {
    Write-Host "  [??] $($svc.name) :$($svc.port) - still starting" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Starting Expo (LAN, cache cleared)..." -ForegroundColor Cyan
Write-Host "Scan the QR code with Expo Go on your phone." -ForegroundColor DarkGray
Write-Host ""

Set-Location $root

try {
  npx expo start --lan --clear
} finally {
  Write-Host ""
  Write-Host "Shutting down all services..." -ForegroundColor Yellow
  foreach ($p in $processList) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Host "All services stopped." -ForegroundColor Green
}
