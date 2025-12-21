@echo off
set ANDROID_SDK_ROOT=C:\Users\jch43\AppData\Local\Android\Sdk
set ANDROID_HOME=%ANDROID_SDK_ROOT%
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

echo y | "C:\Users\jch43\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platforms;android-31"
echo y | "C:\Users\jch43\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" "build-tools;31.0.0"
echo y | "C:\Users\jch43\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" "system-images;android-31;google_apis_playstore;x86_64"

echo Done.
