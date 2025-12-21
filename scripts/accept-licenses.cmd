@echo off
set ANDROID_SDK_ROOT=C:\Users\jch43\AppData\Local\Android\Sdk
set ANDROID_HOME=%ANDROID_SDK_ROOT%
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.17.10-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

for /l %%n in (1,1,30) do echo y | "C:\Users\jch43\AppData\Local\Android\Sdk\cmdline-tools\latest\bin\sdkmanager.bat" --licenses

echo Done.
