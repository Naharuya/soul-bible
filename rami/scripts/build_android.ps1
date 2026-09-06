$ErrorActionPreference = "Stop"
$SourceRoot = Split-Path -Parent $PSScriptRoot

function Fail([string]$Message) {
  Write-Host "[ERROR] $Message" -ForegroundColor Red
  exit 1
}

Write-Host "[1/7] Checking Flutter..." -ForegroundColor Cyan
$flutter = Get-Command flutter -ErrorAction SilentlyContinue
if (-not $flutter) {
  Fail "Flutter is not installed or is not in PATH. Install Flutter, reopen Terminal, then run build_apk.bat again."
}
& flutter --version
if ($LASTEXITCODE -ne 0) { Fail "flutter --version failed." }

Write-Host "[2/7] Checking Android toolchain..." -ForegroundColor Cyan
$doctor = & flutter doctor 2>&1 | Out-String
Write-Host $doctor
if ($doctor -notmatch "Android toolchain") {
  Fail "Flutter cannot find the Android toolchain. Install Android Studio + Android SDK first."
}

# Android Gradle on Windows can reject non-ASCII project paths (Korean folder names).
# Always build from a short ASCII-only temporary path and copy the APK back.
$BuildBase = "C:\rami_build_temp"
$WorkRoot = Join-Path $BuildBase "rami_mvp_v0.4.0"
Write-Host "[3/7] Preparing ASCII-only build folder..." -ForegroundColor Cyan
Write-Host "Source: $SourceRoot"
Write-Host "Build : $WorkRoot"
if (Test-Path $WorkRoot) { Remove-Item $WorkRoot -Recurse -Force }
New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null

# Copy only project sources/config; omit caches and previous build output.
$excludeDirs = @('build','.dart_tool','.git','.idea')
$excludeFiles = @('RAMI-v0.2.1-release.apk','RAMI-v0.2.2-release.apk','RAMI-v0.3.0-release.apk','RAMI-v0.4.0-release.apk')
$roboArgs = @($SourceRoot, $WorkRoot, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
foreach ($d in $excludeDirs) { $roboArgs += '/XD'; $roboArgs += (Join-Path $SourceRoot $d) }
foreach ($f in $excludeFiles) { $roboArgs += '/XF'; $roboArgs += $f }
& robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { Fail "Could not copy project to the temporary ASCII build folder." }
$global:LASTEXITCODE = 0
Set-Location $WorkRoot

Write-Host "[4/7] Creating/updating Android project files..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $WorkRoot "android\app"))) {
  & flutter create --platforms=android --org com.rami --project-name rami_mvp .
  if ($LASTEXITCODE -ne 0) { Fail "flutter create failed." }
}

# Extra safeguard for Android Gradle path checking.
$gradleProps = Join-Path $WorkRoot "android\gradle.properties"
if (Test-Path $gradleProps) {
  $gp = Get-Content $gradleProps -Raw
  if ($gp -notmatch '(?m)^android\.overridePathCheck=true\s*$') {
    Add-Content -Path $gradleProps -Value "`nandroid.overridePathCheck=true" -Encoding UTF8
  }
}

$manifestPath = Join-Path $WorkRoot "android\app\src\main\AndroidManifest.xml"
if (-not (Test-Path $manifestPath)) { Fail "AndroidManifest.xml was not created." }
$manifest = Get-Content $manifestPath -Raw
$permissions = @(
  '<uses-permission android:name="android.permission.NFC" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-feature android:name="android.hardware.nfc" android:required="false" />'
)
foreach ($line in $permissions) {
  $name = if ($line -match 'android:name="([^"]+)"') { $Matches[1] } else { '' }
  if ($name -and $manifest -notmatch [regex]::Escape($name)) {
    $manifest = $manifest -replace '<manifest([^>]*)>', ("<manifest`$1>`r`n    " + $line)
  }
}
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

# Add RAMI deep-link / NFC URI routing to the Flutter activity.
# Custom scheme is the most reliable current MVP test because it does not need
# a live website or Digital Asset Links verification.
$manifest = Get-Content $manifestPath -Raw
if ($manifest -notmatch 'RAMI_DEEP_LINK_V04') {
  $filters = @'
            <!-- RAMI_DEEP_LINK_V04 -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="rami" android:host="t" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.nfc.action.NDEF_DISCOVERED" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="rami" android:host="t" />
            </intent-filter>
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="rami.app" android:pathPrefix="/t/" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.nfc.action.NDEF_DISCOVERED" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:scheme="https" android:host="rami.app" android:pathPrefix="/t/" />
            </intent-filter>
'@
  $manifest = $manifest -replace '</activity>', ($filters + "`r`n        </activity>")
  Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
}

# app_links should own deep-link delivery instead of Flutter's built-in router.
$manifest = Get-Content $manifestPath -Raw
if ($manifest -notmatch 'flutter_deeplinking_enabled') {
  $meta = '            <meta-data android:name="flutter_deeplinking_enabled" android:value="false" />'
  $manifest = $manifest -replace '</activity>', ($meta + "`r`n        </activity>")
  Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
}

# record 7.x requires Android minSdk 23.
$kts = Join-Path $WorkRoot "android\app\build.gradle.kts"
$groovy = Join-Path $WorkRoot "android\app\build.gradle"
if (Test-Path $kts) {
  $g = Get-Content $kts -Raw
  $g = $g -replace 'minSdk\s*=\s*flutter\.minSdkVersion', 'minSdk = 23'
  Set-Content $kts $g -Encoding UTF8
} elseif (Test-Path $groovy) {
  $g = Get-Content $groovy -Raw
  $g = $g -replace 'minSdkVersion\s+flutter\.minSdkVersion', 'minSdkVersion 23'
  $g = $g -replace 'minSdk\s+flutter\.minSdkVersion', 'minSdk 23'
  Set-Content $groovy $g -Encoding UTF8
}

Write-Host "[5/7] Getting Flutter packages..." -ForegroundColor Cyan
& flutter pub get
if ($LASTEXITCODE -ne 0) { Fail "flutter pub get failed. Check the Flutter/Dart version and internet connection." }

Write-Host "[6/7] Building release APK..." -ForegroundColor Cyan
& flutter build apk --release
if ($LASTEXITCODE -ne 0) { Fail "flutter build apk --release failed. Copy the full error text and send it to Ari." }

$built = Join-Path $WorkRoot "build\app\outputs\flutter-apk\app-release.apk"
if (-not (Test-Path $built)) { Fail "Build reported success but app-release.apk was not found." }
$out = Join-Path $SourceRoot "RAMI-v0.4.0-release.apk"
Copy-Item $built $out -Force
$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)

Write-Host "[7/7] Finished." -ForegroundColor Green
Write-Host "APK: $out ($sizeMb MB)" -ForegroundColor Green
Write-Host "The temporary build folder was: $WorkRoot" -ForegroundColor DarkGray
Write-Host "Install RAMI-v0.4.0-release.apk on an NFC-capable Android phone." -ForegroundColor Green
