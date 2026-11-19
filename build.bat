@echo off
setlocal
set "GRADLE_VERSION=9.1.0"
set "GRADLE_HOME=%USERPROFILE%\.gradle\manual-distributions\gradle-%GRADLE_VERSION%"
if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  echo Downloading Gradle %GRADLE_VERSION%...
  if not exist "%USERPROFILE%\.gradle\manual-distributions" mkdir "%USERPROFILE%\.gradle\manual-distributions"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'gradle-%GRADLE_VERSION%-bin.zip'; Invoke-WebRequest 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile $zip; Expand-Archive -Path $zip -DestinationPath '%USERPROFILE%\.gradle\manual-distributions' -Force; Remove-Item $zip -Force"
  if errorlevel 1 exit /b 1
)
call "%GRADLE_HOME%\bin\gradle.bat" %*
exit /b %ERRORLEVEL%
