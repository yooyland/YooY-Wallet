#Requires -Version 5.1
<#
  무거운 명령(Gradle, npm ci, Metro 등)을 돌릴 때 Cursor 메모리·터미널 부담을 줄이기 위한 헬퍼.

  사용 예:
    .\scripts\run-heavy.ps1 -Command "npm ci"
    .\scripts\run-heavy.ps1 -WorkingDirectory "D:\App-YooYLand\android" -Command ".\gradlew.bat :app:tasks" -LogFile "D:\logs\gradle-tasks.log"

  팁: -LogFile 을 쓰면 출력이 파일로도 저장되어, 통합 터미널 스크롤 버퍼가 덜 커집니다.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Command,
  [string]$WorkingDirectory = (Get-Location).Path,
  [string]$LogFile = ""
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $WorkingDirectory)) {
  Write-Host "[run-heavy] ERROR: WorkingDirectory not found: $WorkingDirectory" -ForegroundColor Red
  exit 1
}

Write-Host "[run-heavy] cwd: $WorkingDirectory" -ForegroundColor Cyan
Write-Host "[run-heavy] cmd: $Command" -ForegroundColor Cyan
if ($LogFile) { Write-Host "[run-heavy] log: $LogFile" -ForegroundColor Gray }

Push-Location $WorkingDirectory
try {
  $sb = [scriptblock]::Create($Command)
  if ($LogFile) {
    $dir = Split-Path -Parent $LogFile
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    & $sb *>&1 | Tee-Object -FilePath $LogFile
  } else {
    & $sb
  }
  if ($null -ne (Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue)) {
    exit [int]$LASTEXITCODE
  }
  exit 0
} finally {
  Pop-Location
}
