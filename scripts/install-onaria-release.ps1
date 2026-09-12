param([string]$Device)
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'android-release.mjs'
if ($Device) { & node $installer $Device } else { & node $installer }
if ($LASTEXITCODE -ne 0) { throw 'Release update stopped. Existing app was not deleted.' }
