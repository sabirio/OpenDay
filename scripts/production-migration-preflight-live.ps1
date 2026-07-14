[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ManifestPath,
    [string]$PostgresImage = 'postgres:17',
    [Parameter(Mandatory)][string]$VerifiedBackupPath,
    [Parameter(Mandatory)][string]$ExpectedBackupManifestSha256,
    [Parameter(Mandatory)][string]$ExpectedBackupScriptSha256,
    [Parameter(Mandatory)][string]$ExpectedRestoreReportSha256,
    [Parameter(Mandatory)][string]$OutputPath,
    [string]$EnvFile
)

# Generalized, manifest-driven read-only production preflight. Same safe
# connection pattern as production-migration029-preflight-live.ps1
# (Get-ProductionConnectionFingerprint, dockerized psql over PG* env vars,
# one bounded READ ONLY REPEATABLE READ transaction per query via
# New-ReadOnlyCatalogScript, forbidden-statement guard, secrets never
# printed, env vars cleared in finally). The batch-specific assertions
# (Test-SnagListPreflightAssertions) live in a separate, disposable-tested
# library file - this script only supplies the connection and generic
# manifest/backup validation.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\MigrationManifestValidator.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\SnagListMigrationContract.ps1')
. (Join-Path $PSScriptRoot 'lib\PreflightEvidenceContract.ps1')
. (Join-Path $PSScriptRoot 'lib\BackupReleaseBinding.ps1')

$manifest = Import-MigrationManifest -Path $ManifestPath
Test-ManifestMigrationOrder -Manifest $manifest | Out-Null
$checksums = Test-ManifestMigrationChecksums -Manifest $manifest -RepoRoot $repoRoot
Test-ManifestMigrationsTrackedAndClean -Manifest $manifest -RepoRoot $repoRoot | Out-Null
Test-RepositoryIdentity -RepoRoot $repoRoot -ExpectedCommit $manifest.authoritativeCommit | Out-Null
Write-Host "Manifest/checksum/cleanliness/identity: PASS ($($manifest.batchId))"

if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local' }
$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifestPath = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifestPath)) { throw 'verified backup manifest is missing' }
if ((Get-FileChecksum -Path $backupManifestPath).ToLowerInvariant() -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'verified backup manifest checksum mismatch' }
$backupManifest = Get-Content -LiteralPath $backupManifestPath -Raw | ConvertFrom-Json
$releaseManifestHash = (Get-FileHash -LiteralPath (Resolve-Path $ManifestPath).Path -Algorithm SHA256).Hash.ToLowerInvariant()
$actualHead = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
if ((Get-FileHash -LiteralPath (Join-Path $repoRoot 'scripts\production-backup.ps1') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedBackupScriptSha256) { throw 'verified canonical backup script checksum mismatch' }
Assert-BackupManifestReleaseBinding -Manifest $backupManifest -ExpectedSourceCommit $actualHead -ExpectedReleaseManifestSha256 $releaseManifestHash -ExpectedBackupScriptSha256 $ExpectedBackupScriptSha256 | Out-Null
Write-Host 'Backup release binding: PASS'
$restoreReportPath = Join-Path $backup 'restore-verification.json'
if (-not (Test-Path -LiteralPath $restoreReportPath -PathType Leaf)) { throw 'verified restore report is missing' }
if ((Get-FileHash -LiteralPath $restoreReportPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ExpectedRestoreReportSha256) { throw 'verified restore report checksum mismatch' }
$restoreReport = Get-Content -LiteralPath $restoreReportPath -Raw | ConvertFrom-Json
if ([string]$restoreReport.overallStatus -cne 'PASS' -or [string]$restoreReport.releaseBindingStatus -cne 'PASS') { throw 'verified restore report is not release-qualified PASS' }
if ([IO.Path]::GetFullPath([string]$restoreReport.backupPath) -cne $backup) { throw 'verified restore report belongs to a different backup directory' }
if ([string]$restoreReport.backupManifestSha256 -cne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'verified restore report backup-manifest linkage mismatch' }
Write-Host 'Restore evidence binding: PASS'

$queryTempDirectory = Join-Path ([IO.Path]::GetTempPath()) "migration-preflight-live-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$productionFingerprintVerified = $false
$readOnlyVerified = $false
$assertions = $null

try {
    $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $manifest.approvedProjectRef
    $productionFingerprintVerified = $true
    Write-Host 'Production fingerprint: PASS'

    $env:PGHOST = $conn.Host
    $env:PGPORT = [string]$conn.Port
    $env:PGDATABASE = $conn.Database
    $env:PGUSER = $conn.User
    $env:PGPASSWORD = $conn.Password
    $env:PGSSLMODE = 'require'
    $conn = $null

    New-Item -ItemType Directory -Path $queryTempDirectory | Out-Null
    $queryMount = "type=bind,source=$queryTempDirectory,target=/inventory,readonly"
    $dockerCommon = @('run', '--rm', '--network', 'bridge', '--mount', $queryMount,
        '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
        '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage)
    $forbiddenPattern = '(?i)^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET\s+ROLE)\b'
    $script:querySequence = 0

    function Invoke-RawWrappedQuery {
        param([string]$WrappedSql)
        $script:querySequence++
        $hostQueryPath = Join-Path $queryTempDirectory ("query-{0:D3}.sql" -f $script:querySequence)
        Write-Utf8NoBom -Path $hostQueryPath -Value ($WrappedSql + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList ($dockerCommon + @(
                'psql', '-X', '--quiet', '--tuples-only', '--no-align', '--field-separator', "`t",
                '--file', "/inventory/$(Split-Path -Leaf $hostQueryPath)"))
        Remove-Item -LiteralPath $hostQueryPath -Force -ErrorAction SilentlyContinue
        if ($r.ExitCode -ne 0) { throw "production catalog query failed (exit=$($r.ExitCode)): $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }
    $queryFn = {
        param([string]$Sql)
        if ($Sql -match $forbiddenPattern) { throw "refusing to execute a non-read-only statement: $Sql" }
        return Invoke-RawWrappedQuery -WrappedSql (New-ReadOnlyCatalogScript -CatalogQuery $Sql)
    }

    $assertions = Test-SnagListPreflightAssertions -Query $queryFn -BatchId $manifest.batchId
    $readOnlyVerified = $true
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $queryTempDirectory) { Remove-Item -LiteralPath $queryTempDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}

$result = New-SnagListPreflightEvidence -BatchId $manifest.batchId -ProductionFingerprintVerified $productionFingerprintVerified -ReadOnlyVerified $readOnlyVerified -Assertions $assertions

$json = $result | ConvertTo-Json -Depth 10
Assert-NoSecretLeak -Text $json | Out-Null
Write-Host $json
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
$tempOutput = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
Write-Utf8NoBom -Path $tempOutput -Value $json
Move-Item -LiteralPath $tempOutput -Destination $OutputPath -Force
Write-Host "MIGRATION_PREFLIGHT: $($result.status)"
if ($result.status -eq "READY_FOR_$($manifest.batchId)") { exit 0 } else { exit 1 }
