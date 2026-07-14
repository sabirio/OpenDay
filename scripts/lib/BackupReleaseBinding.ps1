Set-StrictMode -Version Latest

function Get-Sha256Lower {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Resolve-BackupReleaseBinding {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$CanonicalScriptPath,
        [Parameter(Mandatory)][string]$SourceCommit,
        [Parameter(Mandatory)][string]$ReleaseManifestPath,
        [Parameter(Mandatory)][string]$ExpectedReleaseManifestSha256,
        [Parameter(Mandatory)][string]$ExpectedBackupScriptSha256,
        [string]$ApprovedReleaseTag
    )
    if ($SourceCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'RELEASE BINDING REJECTED: SourceCommit must be a lowercase full 40-character Git commit' }
    foreach ($pair in @(@('ExpectedReleaseManifestSha256',$ExpectedReleaseManifestSha256),@('ExpectedBackupScriptSha256',$ExpectedBackupScriptSha256))) {
        if ($pair[1] -cnotmatch '^[0-9a-f]{64}$') { throw "RELEASE BINDING REJECTED: $($pair[0]) must be a lowercase SHA-256" }
    }
    $root = (Resolve-Path -LiteralPath $RepoRoot).Path
    $canonical = (Resolve-Path -LiteralPath $CanonicalScriptPath).Path
    $expectedCanonical = (Join-Path $root 'scripts\production-backup.ps1')
    if ($canonical -cne $expectedCanonical) { throw 'RELEASE BINDING REJECTED: executing script is not the canonical repository backup entry point' }
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & git -C $root cat-file -e "$SourceCommit^{commit}" 2>$null; $commitExit = $LASTEXITCODE }
    finally { $ErrorActionPreference = $savedPreference }
    if ($commitExit -ne 0) { throw 'RELEASE BINDING REJECTED: SourceCommit does not exist in this repository' }
    $head = (& git -C $root rev-parse HEAD).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $head -cne $SourceCommit) { throw "RELEASE BINDING REJECTED: SourceCommit must equal current repository HEAD ($head)" }
    $manifestCandidate = if ([IO.Path]::IsPathRooted($ReleaseManifestPath)) { $ReleaseManifestPath } else { Join-Path $root $ReleaseManifestPath }
    if (-not (Test-Path -LiteralPath $manifestCandidate -PathType Leaf)) { throw 'RELEASE BINDING REJECTED: release manifest is missing' }
    $manifest = (Resolve-Path -LiteralPath $manifestCandidate).Path
    $rootPrefix = $root.TrimEnd('\') + '\'
    if (-not $manifest.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'RELEASE BINDING REJECTED: release manifest escapes repository root' }
    $manifestHash = Get-Sha256Lower $manifest
    if ($manifestHash -cne $ExpectedReleaseManifestSha256) { throw 'RELEASE BINDING REJECTED: release manifest SHA-256 mismatch' }
    $scriptHash = Get-Sha256Lower $canonical
    if ($scriptHash -cne $ExpectedBackupScriptSha256) { throw 'RELEASE BINDING REJECTED: canonical backup script SHA-256 mismatch' }
    return [pscustomobject][ordered]@{
        sourceCommit = $SourceCommit
        releaseManifestPath = $manifest.Substring($rootPrefix.Length).Replace('\','/')
        releaseManifestSha256 = $manifestHash
        manifestSha256 = $manifestHash
        scriptSha256 = $scriptHash
        backupScriptPath = 'scripts/production-backup.ps1'
        approvedReleaseTag = $(if ([string]::IsNullOrWhiteSpace($ApprovedReleaseTag)) { $null } else { $ApprovedReleaseTag })
    }
}

function Assert-BackupManifestReleaseBinding {
    param(
        [Parameter(Mandatory)]$Manifest,
        [Parameter(Mandatory)][string]$ExpectedSourceCommit,
        [Parameter(Mandatory)][string]$ExpectedReleaseManifestSha256,
        [Parameter(Mandatory)][string]$ExpectedBackupScriptSha256
    )
    if ($Manifest.status -cne 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND') { throw 'RELEASE BINDING REJECTED: backup status is not release-qualified' }
    if ([string]$Manifest.sourceCommit -cne $ExpectedSourceCommit) { throw 'RELEASE BINDING REJECTED: backup sourceCommit mismatch' }
    if ([string]$Manifest.releaseManifestSha256 -cne $ExpectedReleaseManifestSha256) { throw 'RELEASE BINDING REJECTED: backup releaseManifestSha256 mismatch' }
    if ([string]$Manifest.manifestSha256 -cne $ExpectedReleaseManifestSha256) { throw 'RELEASE BINDING REJECTED: backup compatibility manifestSha256 mismatch' }
    if ([string]$Manifest.releaseManifestSha256 -cne [string]$Manifest.manifestSha256) { throw 'RELEASE BINDING REJECTED: manifest hash compatibility fields disagree' }
    if ([string]$Manifest.scriptSha256 -cne $ExpectedBackupScriptSha256) { throw 'RELEASE BINDING REJECTED: backup scriptSha256 mismatch' }
    if ([string]$Manifest.backupScriptPath -cne 'scripts/production-backup.ps1') { throw 'RELEASE BINDING REJECTED: backup script identity mismatch' }
    return $true
}
