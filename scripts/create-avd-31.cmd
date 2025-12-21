@echo off
set ANDROID_SDK_ROOT=C:\Users\jch43\AppData\Local\Android\Sdk
set ANDROID_HOME=%ANDROID_SDK_ROOT%
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

echo y | "%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\sdkmanager.bat" "system-images;android-31;google_apis;x86_64"
"%ANDROID_SDK_ROOT%\cmdline-tools\latest\bin\avdmanager.bat" create avd -n Pixel_8_API_31 -k "system-images;android-31;google_apis;x86_64" --device "pixel_8" --force
echo Done.

