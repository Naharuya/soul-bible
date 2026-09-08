param(
    [Parameter(Mandatory=$true)][string]$ArchivePath,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path $PSScriptRoot -Parent
$selectionPath = Join-Path $projectRoot 'backend/corpus/christianity-a-track/selections.json'
$selections = Get-Content -LiteralPath $selectionPath -Raw -Encoding UTF8 | ConvertFrom-Json
$utf8 = [Text.UTF8Encoding]::new($false, $true)
function Get-Sha256([byte[]]$Bytes) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}
function Read-ZipBytes($Zip, [string]$Name) {
    $entry = $Zip.GetEntry($Name)
    if ($null -eq $entry -or $entry.Length -gt 10000000) { throw 'Missing or oversized source entry' }
    $stream = $entry.Open()
    $memory = [IO.MemoryStream]::new()
    try { $stream.CopyTo($memory); return ,$memory.ToArray() }
    finally { $stream.Dispose(); $memory.Dispose() }
}
function Write-NewBytes([string]$Name, [byte[]]$Bytes) {
    $file = [IO.File]::Open((Join-Path $OutputDirectory $Name), [IO.FileMode]::CreateNew)
    try { $file.Write($Bytes, 0, $Bytes.Length) } finally { $file.Dispose() }
}
$archiveBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $ArchivePath).Path)
$archiveSha = Get-Sha256 $archiveBytes
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ArchivePath).Path)
try {
    $aboutBytes = Read-ZipBytes $zip 'engwebp_about.htm'
    $about = $utf8.GetString($aboutBytes)
    if ($about -notmatch 'World English Bible' -or $about -notmatch 'in the Public Domain' -or $about -notmatch 'eBible.org') {
        throw 'Official WEB identity/public-domain evidence is missing'
    }
    $vplBytes = Read-ZipBytes $zip 'engwebp_vpl.txt'
    $vpl = $utf8.GetString($vplBytes).TrimStart([char]0xFEFF)
    $verseMap = @{}
    foreach ($line in ($vpl -split '\r?\n')) {
        if ($line -match '^([A-Z0-9]{3} \d+:\d+) (.*)$') {
            if ($verseMap.ContainsKey($Matches[1])) { throw 'Duplicate source verse' }
            $verseMap[$Matches[1]] = $line
        } elseif ($line.Trim()) { throw 'Malformed VPL input' }
    }
    $selected = [Collections.Generic.List[string]]::new()
    $vplAliases = @{ SNG='SOL'; EZK='EZE'; JOL='JOE'; NAM='NAH'; MRK='MAR'; JHN='JOH'; PHP='PHI'; JAS='JAM'; '1JN'='1JO'; '2JN'='2JO'; '3JN'='3JO' }
    $used = @{}
    foreach ($passage in $selections) {
        for ($verse = $passage.verseStart; $verse -le $passage.verseEnd; $verse++) {
            $vplBook = if ($vplAliases.ContainsKey($passage.book)) { $vplAliases[$passage.book] } else { $passage.book }
            $key = '{0} {1}:{2}' -f $vplBook, $passage.chapter, $verse
            if (!$verseMap.ContainsKey($key) -or $used.ContainsKey($key)) { throw "Missing/overlapping verse: $key" }
            if ($verseMap[$key] -notmatch '^\S+ \d+:\d+ \S') { throw "Selected verse has no text: $key" }
            $used[$key] = $true
            $selected.Add($verseMap[$key])
        }
    }
    $selectedBytes = $utf8.GetBytes(($selected -join "`n") + "`n")
    $source = [ordered]@{
        sourceId = 'protestant:webp-a-track-v1'; title = 'World English Bible'; publisher = 'eBible.org'; institution = 'eBible.org'
        sourceVersion = 'engwebp-vpl-sha256-' + $archiveSha.Substring(0,16)
        sourceUrl = 'https://ebible.org/Scriptures/engwebp_vpl.zip'
        licenseStatus = 'public_domain'
        licenseEvidence = 'Publisher public-domain dedication: https://ebible.org/engwebp/copyright.htm ; archived engwebp_about.htm. Preserve original wording when using the World English Bible name. Human license review is pending.'
        provenance = "Official eBible.org engwebp Protestant edition VPL. Archive SHA256=$archiveSha; entry engwebp_vpl.txt SHA256=$(Get-Sha256 $vplBytes). Exact selected VPL lines; only LF line endings normalized. No Korean translation."
        language = 'en-US'; checksum = Get-Sha256 $selectedBytes
    }
    $evidence = [ordered]@{
        status = 'publisher_evidence_captured_not_expert_approval'
        acquiredAt = [DateTime]::UtcNow.ToString('o')
        downloadUrl = $source.sourceUrl; licenseUrl = 'https://ebible.org/engwebp/copyright.htm'
        editionUrl = 'https://ebible.org/engwebp/'; edition = 'WEB Protestant edition, engwebp, 66-book protocanon'
        archiveSha256 = $archiveSha; archiveBytes = $archiveBytes.Length
        entry = 'engwebp_vpl.txt'; entrySha256 = Get-Sha256 $vplBytes
        entryBytes = $vplBytes.Length; archiveEntryTimestamp = $zip.GetEntry('engwebp_vpl.txt').LastWriteTime.ToString('o')
        licenseFile = 'engwebp_about.htm'; licenseSha256 = Get-Sha256 $aboutBytes
        selectionFile = 'selections.json'; selectionSha256 = Get-Sha256 ([IO.File]::ReadAllBytes($selectionPath))
        subsetFile = 'selected.vpl.txt'; subsetSha256 = $source.checksum
        selectedVerses = $selected.Count; candidatePassages = $selections.Count
        textTransform = 'Exact source verse strings; UTF-8, LF record delimiters; passages join verse lines with one space'
        reviewerDecisions = 0; modelApiCalls = 0; embeddingApiCalls = 0
    }
    # Validate everything before creating an immutable evidence directory.
    if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output directory already exists; choose a new snapshot path' }
    New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
    Write-NewBytes 'selected.vpl.txt' $selectedBytes
    Write-NewBytes 'engwebp_about.htm' $aboutBytes
    Write-NewBytes 'source.json' ($utf8.GetBytes(($source | ConvertTo-Json -Depth 8) + "`n"))
    Write-NewBytes 'provenance.json' ($utf8.GetBytes(($evidence | ConvertTo-Json -Depth 8) + "`n"))
    Write-Output ($evidence | ConvertTo-Json -Depth 8)
} finally { $zip.Dispose() }
