param(
    [string]$PairAddress,
    [string]$DeviceAddress,
    [string]$ApiBaseUrl = 'http://lightshare8.mycafe24.com',
    [switch]$Release,
    [switch]$ListDevices
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adb = if ($adbCommand) { $adbCommand.Source } else { $null }
if (-not $adb) {
    $sdkRoots = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA/Android/Sdk")
    $properties = Join-Path $projectRoot 'android/local.properties'
    if (Test-Path $properties) {
        $sdkLine = Get-Content $properties | Where-Object { $_ -match '^sdk.dir=' } | Select-Object -First 1
        if ($sdkLine) { $sdkRoots += $sdkLine.Substring(8).Replace('\\', '\').Replace('\:', ':') }
    }
    foreach ($sdkRoot in $sdkRoots) {
        if ($sdkRoot -and (Test-Path (Join-Path $sdkRoot 'platform-tools/adb.exe'))) {
            $adb = Join-Path $sdkRoot 'platform-tools/adb.exe'
            break
        }
    }
}
if (-not $adb) { throw 'ADB not found. Install Android SDK Platform-Tools in Android Studio.' }

if ($ListDevices) {
    & $adb devices -l
    if ($LASTEXITCODE -ne 0) { throw 'Could not list devices.' }
    return
}
if ($PairAddress) {
    # ADB prompts for the temporary pairing code; do not save it in this script.
    & $adb pair $PairAddress
    if ($LASTEXITCODE -ne 0) { throw 'Pairing failed. Reopen the pairing dialog on the phone and retry.' }
}
if ($DeviceAddress) {
    & $adb connect $DeviceAddress
    if ($LASTEXITCODE -ne 0) { throw 'Wireless connection failed.' }
}
$deviceLines = & $adb devices
if ($LASTEXITCODE -ne 0) { throw 'Could not list devices.' }
$wirelessDevices = @($deviceLines | ForEach-Object {
    if ($_ -match '^(\S+)\s+device\s*$') {
        $serial = $Matches[1]
        if ($serial -match ':\d+$|\._adb-tls-connect\._tcp\.?$') { $serial }
    }
})
if ($DeviceAddress) {
    if ($DeviceAddress -notin $wirelessDevices) { throw 'Phone is not connected. Use the connection port, not the pairing port.' }
    $device = $DeviceAddress
} elseif ($wirelessDevices.Count -eq 1) {
    $device = $wirelessDevices[0]
} else {
    throw 'Enable wireless debugging, then specify -DeviceAddress IP:PORT. For first pairing also specify -PairAddress IP:PAIR_PORT.'
}
$flutter = Get-Command flutter -ErrorAction Stop
Push-Location $projectRoot
try {
    $runArgs = @('run', '-d', $device, "--dart-define=ONARIA_API_BASE_URL=$ApiBaseUrl")
    if ($Release) { $runArgs += '--release' }
    & $flutter.Source @runArgs
    if ($LASTEXITCODE -ne 0) { throw 'Flutter build or device launch failed.' }
} finally {
    Pop-Location
}
