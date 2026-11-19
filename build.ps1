$ErrorActionPreference = 'Stop'
$version = '9.1.0'
$root = Join-Path $env:USERPROFILE ".gradle\manual-distributions\gradle-$version"
if (-not (Test-Path (Join-Path $root 'bin\gradle.bat'))) {
    $downloads = Join-Path $env:USERPROFILE '.gradle\manual-distributions'
    New-Item -ItemType Directory -Path $downloads -Force | Out-Null
    $zip = Join-Path $env:TEMP "gradle-$version-bin.zip"
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$version-bin.zip" -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $downloads -Force
    Remove-Item $zip -Force
}
& (Join-Path $root 'bin\gradle.bat') @args
exit $LASTEXITCODE
