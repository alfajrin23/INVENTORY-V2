$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$toolRoot = Join-Path $projectRoot '.android-toolchain'
$jdkRoot = Join-Path $toolRoot 'jdk'
$sdkRoot = Join-Path $toolRoot 'sdk'

if (!(Test-Path $jdkRoot)) {
  throw "JDK portable belum ada di $jdkRoot. Jalankan setup Android toolchain dulu."
}

if (!(Test-Path (Join-Path $sdkRoot 'platforms/android-36'))) {
  throw "Android SDK 36 belum ada di $sdkRoot. Jalankan setup Android SDK dulu."
}

$jdkHome = Get-ChildItem $jdkRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
$env:JAVA_HOME = $jdkHome
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:PATH = "$jdkHome\bin;$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:PATH"

Push-Location $projectRoot
try {
  npm run build
  npx cap sync android

  Push-Location (Join-Path $projectRoot 'android')
  try {
    .\gradlew.bat assembleDebug
  } finally {
    Pop-Location
  }

  $apkSource = Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
  $releaseDir = Join-Path $projectRoot 'release'
  $apkTarget = Join-Path $releaseDir 'ABElektronik-Inventory-debug.apk'
  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
  Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
  Write-Host "APK berhasil dibuat: $apkTarget"
} finally {
  Pop-Location
}
