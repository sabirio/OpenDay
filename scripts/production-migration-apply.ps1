[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ManifestPath,

    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly,

    [Parameter(ParameterSetName = 'Apply')]
    [string]$PostgresImage = 'postgres:17',

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$VerifiedBackupPath,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ExpectedBackupManifestSha256,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ApprovedPreflightPath,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ExpectedPreflightSha256,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$Approval,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$OutputPath,

    [Parameter(ParameterSetName = 'Apply')]
    [string]$EnvFile
)

# Generalized, manifest-driven production migration executor. Replaces the
# per-migration hardcoded pattern (production-remediation-apply.ps1 for 028,
# production-migration029-apply.ps1 for 029) with one script that accepts
# ANY reviewed manifest - the exact set, order, and checksums of migration
# files it may ever apply are entirely defined by that manifest, never by
# a free-form path or SQL string passed on the command line.
#
# Two mutually exclusive modes (PowerShell parameter sets enforce this - it
# is not possible to pass -ValidateOnly and -Approval together):
#
#   -ValidateOnly: loads and validates the manifest (schema, strict order,
#     path containment, byte-exact checksums, repository HEAD identity).
#     Never touches Docker, a network, or any credential. Safe to run
#     freely, as often as wanted, by anyone with read access to the repo.
#
#   Apply mode (default parameter set, all six -Verified.../-Approved.../
#     -Approval/-OutputPath parameters mandatory): re-runs every -ValidateOnly
#     check, THEN requires a verified backup manifest checksum, an approved
#     preflight result checksum whose own JSON says READY, and an exact
#     confirmation phrase computed FROM THE MANIFEST (never a caller-supplied
#     string) - only after all of that does it open a production connection
#     (via the same Get-ProductionConnectionFingerprint fingerprinting every
#     other production script in this repo already uses) and apply the
#     manifest's migrations one file per psql invocation, in order, stopping
#     immediately on the first non-zero exit code.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\MigrationManifestValidator.ps1')
. (Join-Path $PSScriptRoot 'lib\ManifestMigrationExecutor.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')

Write-Host "Loading manifest: $ManifestPath"
$manifest = Import-MigrationManifest -Path $ManifestPath
Write-Host "Manifest batch: $($manifest.batchId) (target $($manifest.approvedProjectRef))"

Test-ManifestMigrationOrder -Manifest $manifest | Out-Null
Write-Host 'Migration order: PASS'

$checksums = Test-ManifestMigrationChecksums -Manifest $manifest -RepoRoot $repoRoot
Write-Host "Migration checksums: PASS ($($checksums.Count)/$($checksums.Count) byte-identical)"

$actualHead = Test-RepositoryIdentity -RepoRoot $repoRoot -ExpectedCommit $manifest.authoritativeCommit
Write-Host "Repository identity: PASS (HEAD=$actualHead)"

if ($PSCmdlet.ParameterSetName -eq 'Validate') {
    Write-Host 'VALIDATE_ONLY: PASS - no Docker, network, or credential access was attempted'
    exit 0
}

# --- Apply mode: everything above already passed. Now the apply-only gates. ---

$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifestPath = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifestPath)) { throw 'ABORT: verified backup manifest is missing' }
if ((Get-FileChecksum -Path $backupManifestPath).ToLowerInvariant() -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'ABORT: verified backup manifest checksum mismatch' }
Write-Host 'Backup manifest checksum: PASS'

$preflightPath = (Resolve-Path -LiteralPath $ApprovedPreflightPath).Path
if ((Get-FileChecksum -Path $preflightPath).ToLowerInvariant() -ne $ExpectedPreflightSha256.ToLowerInvariant()) { throw 'ABORT: approved preflight checksum mismatch' }
$preflight = Get-Content -Raw -LiteralPath $preflightPath | ConvertFrom-Json
if ($preflight.status -ne "READY_FOR_$($manifest.batchId)" -or -not $preflight.productionFingerprintVerified -or -not $preflight.blockingLocks.safe) {
    throw "ABORT: preflight evidence is failed, stale, or incomplete (status=$($preflight.status))"
}
Write-Host 'Preflight approval: PASS'

$expectedApproval = Get-ManifestApprovalPhrase -Manifest $manifest
if ($Approval -cne $expectedApproval) {
    throw "ABORT: confirmation phrase does not match. expected exactly: $expectedApproval"
}
Write-Host 'Confirmation phrase: PASS'

if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local' }

$applyReport = [ordered]@{
    batchId = $manifest.batchId
    manifestPath = (Resolve-Path -LiteralPath $ManifestPath).Path
    repositoryCommit = $actualHead
    approvedProjectRef = $manifest.approvedProjectRef
    startedAtUtc = [DateTime]::UtcNow.ToString('o')
    completedAtUtc = $null
    checksums = $checksums
    execution = $null
    overallStatus = 'NOT_RUN'
}

$conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $manifest.approvedProjectRef
Write-Host 'Production fingerprint: PASS'
$pgConnection = [pscustomobject]@{ Host = $conn.Host; Port = $conn.Port; Database = $conn.Database; User = $conn.User; Password = $conn.Password; SslMode = 'require' }
$conn = $null

$applyReport.execution = Invoke-ManifestMigrationSequence -Manifest $manifest -ChecksumResults $checksums -PgConnection $pgConnection -PostgresImage $PostgresImage
$pgConnection = $null
$applyReport.completedAtUtc = [DateTime]::UtcNow.ToString('o')
$applyReport.overallStatus = $applyReport.execution.overallStatus

foreach ($step in $applyReport.execution.steps) {
    Write-Host "$($step.file): $($step.status) (exit=$($step.exitCode), $($step.durationSeconds)s)"
}
Write-Host "APPLY $($applyReport.overallStatus): batch $($manifest.batchId)"

$json = $applyReport | ConvertTo-Json -Depth 10
Assert-NoSecretLeak -Text $json | Out-Null

$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
$tempOutput = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
Write-Utf8NoBom -Path $tempOutput -Value $json
Move-Item -LiteralPath $tempOutput -Destination $OutputPath -Force

if ($applyReport.overallStatus -eq 'PASS') { exit 0 } else { exit 1 }
