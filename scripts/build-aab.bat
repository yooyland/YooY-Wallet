@echo off
setlocal EnableExtensions
REM Release AAB 빌드 (clean 없음). Cursor 밖 터미널 권장.

set "ROOT=%~dp0.."
set "ANDROID=%ROOT%\android"
set "GRADLEW=%ANDROID%\gradlew.bat"

if not exist "%GRADLEW%" (
  echo [build-aab] ERROR: gradlew.bat not found: %GRADLEW%
  exit /b 1
)

echo ========================================
echo  YooYLand - Android bundleRelease (AAB)
echo ========================================
echo  Directory: %ANDROID%
echo  Command:   gradlew.bat bundleRelease (no clean)
echo.

pushd "%ANDROID%"
call gradlew.bat bundleRelease
set "CODE=%ERRORLEVEL%"
popd

if not "%CODE%"=="0" (
  echo.
  echo [build-aab] FAILED (exit %CODE%)
  exit /b %CODE%
)

echo.
echo [build-aab] DONE
exit /b 0
