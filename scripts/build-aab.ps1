#Requires -Version 5.1
<#
  Release AAB 빌드 (clean 없음 — 증분 빌드).
  Cursor와 분리된 터미널에서 실행하는 것을 권장합니다.

  선택: 로그를 파일로도 남기면 통합 터미널 버퍼·메모리 부담을 줄일 수 있습니다.
  .\scripts\build-aab.ps1 -LogFile "D:\logs\aab-build.log"
#>
param(
  [string]$LogFile = ""
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Android = Join-Path $Root 'android'
$Gradlew = Join-Path $Android 'gradlew.bat'

if (-not (Test-Path $Gradlew)) {
  Write-Host "[build-aab] ERROR: gradlew.bat not found: $Gradlew" -ForegroundColor Red
  exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " YooYLand - Android bundleRelease (AAB)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Directory: $Android" -ForegroundColor Gray
Write-Host " Command:   .\gradlew.bat bundleRelease (no clean)" -ForegroundColor Gray
if ($LogFile) {
  Write-Host " Log file:  $LogFile (Tee-Object)" -ForegroundColor Gray
}
Write-Host ""

Push-Location $Android
try {
  if ($LogFile) {
    $dir = Split-Path -Parent $LogFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    & .\gradlew.bat bundleRelease *>&1 | Tee-Object -FilePath $LogFile
    $code = $LASTEXITCODE
  } else {
    & .\gradlew.bat bundleRelease
    $code = $LASTEXITCODE
  }
} finally {
  Pop-Location
}

if ($code -ne 0) {
  Write-Host ""
  Write-Host "[build-aab] FAILED (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "[build-aab] DONE" -ForegroundColor Green
exit 0
