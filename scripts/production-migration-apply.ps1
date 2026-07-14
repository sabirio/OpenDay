[CmdletBinding(DefaultParameterSetName = 'Validate')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [Parameter(Mandatory, ParameterSetName = 'ShowApproval')]
    [string]$ManifestPath,

    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly,

    [Parameter(Mandatory, ParameterSetName = 'ShowApproval')]
    [switch]$ShowRequiredApproval,

    [Parameter(ParameterSetName = 'Apply')]
    [string]$PostgresImage = 'postgres:17',

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$VerifiedBackupPath,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ExpectedBackupManifestSha256,

    [Parameter(Mandatory, ParameterSetName = 'Apply')]
    [string]$ExpectedBackupScriptSha256,

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
. (Join-Path $PSScriptRoot 'lib\PreflightEvidenceContract.ps1')
. (Join-Path $PSScriptRoot 'lib\ReleaseApprovalContract.ps1')
. (Join-Path $PSScriptRoot 'lib\BackupReleaseBinding.ps1')

Write-Host "Loading manifest: $ManifestPath"
$manifest = Import-MigrationManifest -Path $ManifestPath
Write-Host "Manifest batch: $($manifest.batchId) (target $($manifest.approvedProjectRef))"

Test-ManifestMigrationOrder -Manifest $manifest | Out-Null
Write-Host 'Migration order: PASS'

$checksums = Test-ManifestMigrationChecksums -Manifest $manifest -RepoRoot $repoRoot
Write-Host "Migration checksums: PASS ($($checksums.Count)/$($checksums.Count) byte-identical)"

# A checksum match against the manifest is not proof the file matches what
# Git has committed - a dirty working-tree file with its manifest checksum
# updated to match would otherwise pass silently. Distinct gate, distinct
# failure message.
Test-ManifestMigrationsTrackedAndClean -Manifest $manifest -RepoRoot $repoRoot | Out-Null
Write-Host 'Migration files tracked and clean: PASS'

$actualHead = Test-RepositoryIdentity -RepoRoot $repoRoot -ExpectedCommit $manifest.authoritativeCommit
Write-Host "Repository identity: PASS (HEAD=$actualHead)"

if ($PSCmdlet.ParameterSetName -eq 'Validate') {
    Write-Host 'VALIDATE_ONLY: PASS - no Docker, network, or credential access was attempted'
    exit 0
}

$approvalDescriptor = Get-RepositoryReleaseApprovalDescriptor -Manifest $manifest -ManifestPath $ManifestPath -RepoRoot $repoRoot
if ($PSCmdlet.ParameterSetName -eq 'ShowApproval') {
    Write-Host 'REQUIRED OWNER APPROVAL (copy exactly; comparison is ordinal and case-sensitive after trimming outer whitespace):'
    Write-Host (Get-RequiredReleaseApprovalPhrase -Descriptor $approvalDescriptor)
    Write-Host 'SHOW_REQUIRED_APPROVAL: PASS - no Docker, network, credential, or database access was attempted'
    exit 0
}

# --- Apply mode: everything above already passed. Now the apply-only gates. ---

try {
    Assert-ReleaseApproval -Approval $Approval -Descriptor $approvalDescriptor | Out-Null
} catch {
    $approvalFailureReport = [ordered]@{
        batchId = $manifest.batchId; repositoryCommit = $actualHead; completedAtUtc = [DateTime]::UtcNow.ToString('o')
        approvalSchema = $approvalDescriptor.schema; releaseId = $approvalDescriptor.releaseId
        classification = Get-ReleaseApprovalFailureClassification; overallStatus = 'BLOCKED_BEFORE_APPLY'
        failure = $_.Exception.Message
        execution = [ordered]@{ steps = @($manifest.migrations | ForEach-Object { [ordered]@{ number = $_.number; file = $_.file; attempted = $false; status = 'NOT_ATTEMPTED' } }) }
    }
    $approvalFailureJson = $approvalFailureReport | ConvertTo-Json -Depth 10
    Assert-NoSecretLeak -Text $approvalFailureJson | Out-Null
    $approvalFailureOutputDir = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $approvalFailureOutputDir)) { New-Item -ItemType Directory -Path $approvalFailureOutputDir -Force | Out-Null }
    $approvalFailureTemp = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
    Write-Utf8NoBom -Path $approvalFailureTemp -Value $approvalFailureJson
    Move-Item -LiteralPath $approvalFailureTemp -Destination $OutputPath -Force
    throw
}
Write-Host 'Release approval contract: PASS'

$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifestPath = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifestPath)) { throw 'ABORT: verified backup manifest is missing' }
if ((Get-FileChecksum -Path $backupManifestPath).ToLowerInvariant() -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'ABORT: verified backup manifest checksum mismatch' }
$backupManifest = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json
$releaseManifestHash = (Get-FileHash -LiteralPath (Resolve-Path $ManifestPath).Path -Algorithm SHA256).Hash.ToLowerInvariant()
$canonicalBackupScript = Join-Path $repoRoot 'scripts\production-backup.ps1'
if ((Get-FileHash -LiteralPath $canonicalBackupScript -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedBackupScriptSha256) { throw 'ABORT: canonical backup script checksum mismatch' }
Assert-BackupManifestReleaseBinding -Manifest $backupManifest -ExpectedSourceCommit $actualHead -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $ExpectedBackupScriptSha256 | Out-Null
Write-Host 'Backup manifest checksum: PASS'

$preflightPath = (Resolve-Path -LiteralPath $ApprovedPreflightPath).Path
if ((Get-FileChecksum -Path $preflightPath).ToLowerInvariant() -ne $ExpectedPreflightSha256.ToLowerInvariant()) { throw 'ABORT: approved preflight checksum mismatch' }
try {
    $preflight = Import-SnagListPreflightEvidence -Path $preflightPath -ExpectedBatchId $manifest.batchId
} catch {
    $preApplyReport = [ordered]@{
        batchId = $manifest.batchId
        repositoryCommit = $actualHead
        completedAtUtc = [DateTime]::UtcNow.ToString('o')
        classification = Get-SnagListReleaseFailureStatus -Phase PRE_APPLY
        overallStatus = 'BLOCKED_BEFORE_APPLY'
        failure = $_.Exception.Message
        execution = [ordered]@{
            steps = @($manifest.migrations | ForEach-Object { [ordered]@{ number = $_.number; file = $_.file; attempted = $false; status = 'NOT_ATTEMPTED' } })
        }
    }
    $preApplyJson = $preApplyReport | ConvertTo-Json -Depth 10
    Assert-NoSecretLeak -Text $preApplyJson | Out-Null
    $preApplyOutputDir = Split-Path -Parent $OutputPath
    if (-not (Test-Path -LiteralPath $preApplyOutputDir)) { New-Item -ItemType Directory -Path $preApplyOutputDir -Force | Out-Null }
    $preApplyTemp = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
    Write-Utf8NoBom -Path $preApplyTemp -Value $preApplyJson
    Move-Item -LiteralPath $preApplyTemp -Destination $OutputPath -Force
    throw
}
Write-Host 'Preflight approval: PASS'

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
if ($manifest.Contains('requiredDatabaseUser') -and $conn.User -notmatch "^$([regex]::Escape($manifest.requiredDatabaseUser))(\.|$)") {
    throw "ABORT: database user does not satisfy manifest requiredDatabaseUser=$($manifest.requiredDatabaseUser)"
}
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
