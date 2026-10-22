# Checks the Google Maps Android key at every stage: .env -> source manifest -> built APK -> device.
# Usage (from apps\mobile): powershell -File scripts\check-maps-key.ps1 [-Fix]
# -Fix re-runs `expo prebuild --platform android` when the source manifest lacks the key.
param([switch]$Fix)

$mobile = Split-Path -Parent $PSScriptRoot
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$ok = $true
function Report($pass, $msg) {
  if ($pass) { Write-Host "[ok]   $msg" -ForegroundColor Green } else { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:ok = $false }
}
function Mask($k) { if ($k.Length -gt 8) { $k.Substring(0, 6) + '...' + $k.Substring($k.Length - 3) } else { '(empty)' } }

# 1. .env
$envKey = ''
foreach ($f in '.env', '.env.local') {
  $p = Join-Path $mobile $f
  if (Test-Path $p) {
    $m = Select-String -Path $p -Pattern '^\s*GOOGLE_MAPS_ANDROID_KEY\s*=\s*(.*)$' | Select-Object -Last 1
    if ($m) { $envKey = $m.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'") }
  }
}
Report ($envKey.Length -gt 0) "GOOGLE_MAPS_ANDROID_KEY in .env: $(Mask $envKey)"

# 2. source manifest
$manifest = Join-Path $mobile 'android\app\src\main\AndroidManifest.xml'
$srcKey = ''
if (Test-Path $manifest) {
  $m = Select-String -Path $manifest -Pattern 'com\.google\.android\.geo\.API_KEY"\s+android:value="([^"]*)"'
  if ($m) { $srcKey = $m.Matches[0].Groups[1].Value }
}
Report ($srcKey.Length -gt 0 -and $srcKey -eq $envKey) "source AndroidManifest.xml key: $(Mask $srcKey)"
if (-not ($srcKey.Length -gt 0 -and $srcKey -eq $envKey) -and $Fix -and $envKey) {
  Write-Host 'Running expo prebuild to write the key...' -ForegroundColor Yellow
  Push-Location $mobile; npx expo prebuild --platform android --no-install; Pop-Location
}

# 3. built APK
$apk = Join-Path $mobile 'android\app\build\outputs\apk\debug\app-debug.apk'
$aapt = Get-ChildItem "$sdk\build-tools" -Recurse -Filter aapt2.exe -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1
if ((Test-Path $apk) -and $aapt) {
  $dump = & $aapt.FullName dump xmltree --file AndroidManifest.xml $apk 2>&1 | Out-String
  $has = $dump -match 'com\.google\.android\.geo\.API_KEY' -and $dump -match [regex]::Escape($envKey)
  Report $has "built APK manifest contains the key ($((Get-Item $apk).LastWriteTime))"
  if (-not $has) { Write-Host '       APK is stale: rebuild with `pnpm android`.' -ForegroundColor Yellow }
} else { Report $false 'built APK or aapt2 not found (run pnpm android)' }

# 4. device
$adb = "$sdk\platform-tools\adb.exe"
if (Test-Path $adb) {
  $dev = & $adb devices | Select-String '\tdevice$'
  if ($dev) {
    $pkg = & $adb shell dumpsys package app.vighnaway | Out-String
    $t = [regex]::Match($pkg, 'lastUpdateTime=(.*)').Groups[1].Value.Trim()
    Report ($pkg -match 'versionName') "app.vighnaway installed on device (lastUpdateTime=$t)"
  } else { Write-Host '[skip] no device connected' }
}

# 5. Google Cloud side (cannot be checked locally)
Write-Host "`nAlso required in Google Cloud: 'Maps SDK for Android' enabled; key restricted to package app.vighnaway + debug SHA-1:" -ForegroundColor DarkGray
Write-Host '  keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android | findstr SHA1' -ForegroundColor DarkGray
if ($ok) { exit 0 } else { exit 1 }
