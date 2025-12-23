Param()

$ErrorActionPreference = 'Stop'

$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot'
if (-not (Test-Path "$jdk\bin\java.exe")) {
  Write-Error "JDK not found at $jdk"
}

$env:JAVA_HOME = $jdk
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Write-Host "Using JAVA_HOME=$env:JAVA_HOME"

Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  & .\gradlew.bat --version
  & .\gradlew.bat clean :app:bundleRelease
} finally {
  Pop-Location
}


