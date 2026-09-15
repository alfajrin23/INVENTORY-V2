$ErrorActionPreference = 'Stop'

$required = @(
  'AB_RELEASE_STORE_FILE',
  'AB_RELEASE_STORE_PASSWORD',
  'AB_RELEASE_KEY_ALIAS',
  'AB_RELEASE_KEY_PASSWORD',
  'AB_VERSION_CODE',
  'AB_VERSION_NAME'
)

$missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
if ($missing.Count -gt 0) {
  throw "Environment variable untuk build update belum lengkap: $($missing -join ', ')"
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$toolRoot = Join-Path $projectRoot '.android-toolchain'
$jdkRoot = Join-Path $toolRoot 'jdk'
$sdkRoot = Join-Path $toolRoot 'sdk'

if (!(Test-Path $env:AB_RELEASE_STORE_FILE)) {
  throw "Keystore tidak ditemukan: $env:AB_RELEASE_STORE_FILE"
}

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
    .\gradlew.bat assembleRelease
  } finally {
    Pop-Location
  }

  $apkSource = Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk'
  if (!(Test-Path $apkSource)) {
    throw "APK release tidak ditemukan di $apkSource"
  }

  $releaseDir = Join-Path $projectRoot 'release'
  $apkTarget = Join-Path $releaseDir 'ABElektronik-Inventory.apk'
  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
  Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force

  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apkTarget).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$apkTarget.sha256" -Value "$hash  ABElektronik-Inventory.apk" -Encoding ascii
  Write-Host "APK update berhasil dibuat: $apkTarget"
  Write-Host "Versi: $env:AB_VERSION_NAME ($env:AB_VERSION_CODE)"
  Write-Host "SHA256: $hash"
} finally {
  Pop-Location
}
