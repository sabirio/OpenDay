[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ManifestPath,
    [string]$PostgresImage = 'postgres:17',
    [Parameter(Mandatory)][string]$VerifiedBackupPath,
    [Parameter(Mandatory)][string]$ExpectedBackupManifestSha256,
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

$manifest = Import-MigrationManifest -Path $ManifestPath
Test-ManifestMigrationOrder -Manifest $manifest | Out-Null
$checksums = Test-ManifestMigrationChecksums -Manifest $manifest -RepoRoot $repoRoot
Test-RepositoryIdentity -RepoRoot $repoRoot -ExpectedCommit $manifest.authoritativeCommit | Out-Null
Write-Host "Manifest/checksum/identity: PASS ($($manifest.batchId))"

if (-not $EnvFile) { $EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local' }
$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifestPath = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifestPath)) { throw 'verified backup manifest is missing' }
if ((Get-FileChecksum -Path $backupManifestPath).ToLowerInvariant() -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'verified backup manifest checksum mismatch' }

$queryTempDirectory = Join-Path ([IO.Path]::GetTempPath()) "migration-preflight-live-$([guid]::NewGuid().ToString('N').Substring(0,8))"
$result = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    batchId = $manifest.batchId
    productionFingerprintVerified = $false
    assertions = $null
    status = 'NOT_READY'
}

try {
    $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $manifest.approvedProjectRef
    $result.productionFingerprintVerified = $true
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

    $result.assertions = Test-SnagListPreflightAssertions -Query $queryFn -BatchId $manifest.batchId
    $result.status = $result.assertions.status
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $queryTempDirectory) { Remove-Item -LiteralPath $queryTempDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}

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
