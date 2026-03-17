param(
  [string]$AppRoot = "D:\App-YooYLand",
  [string]$VerName  # 비우면 자동(yyyy.MM.dd.NN)
)

$android = Join-Path $AppRoot "android"
$dist = Join-Path $AppRoot "dist"
if (!(Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

# 오늘 날짜 기반 versionCode 자동 증가 (형식: yyyymmddNN)
$today = (Get-Date -Format 'yyyyMMdd')
$existing = Get-ChildItem $dist -Filter "app-release-$today*.aab" -ErrorAction SilentlyContinue
$maxInc = 0
foreach ($f in $existing) {
  if ($f.BaseName -match "app-release-$today(\d{2})-") {
    $inc = [int]$Matches[1]
    if ($inc -gt $maxInc) { $maxInc = $inc }
  }
}
$incNext = "{0:D2}" -f ($maxInc + 1)
$vc = "$today$incNext"

# versionName 자동: yyyy.MM.dd.NN (인자 미지정 시)
if ([string]::IsNullOrWhiteSpace($VerName)) {
  $VerName = (Get-Date -Format 'yyyy.MM.dd') + "." + $incNext
}

Write-Host "Using versionCode: $vc  |  versionName: $VerName"

$env:ANDROID_VERSION_CODE = $vc
$env:ANDROID_VERSION_NAME = $VerName
# Release build must always use NODE_ENV=production (bundle minify, no console, speed).
$env:NODE_ENV = "production"

Push-Location $android
./gradlew.bat --no-daemon --stop | Out-Null
./gradlew.bat clean :app:bundleRelease --no-daemon --no-build-cache --no-parallel --warning-mode all
Pop-Location

$src = Join-Path $android "app\build\outputs\bundle\release\app-release.aab"
$ts = (Get-Date -Date (Get-Item $src).LastWriteTime).ToString('yyyyMMdd-HHmmss')
$dest = Join-Path $dist ("app-release-" + $vc + "-" + $ts + ".aab")
Copy-Item $src $dest -Force

Write-Host "✅ Build completed."
Write-Host "AAB: $dest"
