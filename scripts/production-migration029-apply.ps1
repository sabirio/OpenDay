[CmdletBinding()]
param(
    [string]$PostgresImage = 'postgres:17',
    [Parameter(Mandatory)][string]$VerifiedBackupPath,
    [Parameter(Mandatory)][string]$ExpectedBackupManifestSha256,
    [Parameter(Mandatory)][string]$ApprovedPreflightPath,
    [Parameter(Mandatory)][string]$ExpectedPreflightSha256,
    [Parameter(Mandatory)][string]$ExpectedRepositoryCommit,
    [Parameter(Mandatory)][ValidateSet('APPROVE MIGRATION 029')][string]$Approval,
    [Parameter(Mandatory)][string]$OutputPath
)

# Applies weekly-tracker/src/migrations/029_production_acl_followup.sql
# to real production, exactly once, using the exact reviewed command:
#   psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 --file <migration>
#
# Identical structure and safety properties to production-remediation-
# apply.ps1 (migration 028's own apply script): checksum-gated against the
# approved hash BEFORE connecting, exact reviewed command only, single
# invocation, no retry loop, output redacted before ever being printed or
# written. Applies ONLY this one named migration file - no other SQL, no
# migration runner, no db push.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')

$ExpectedProjectRef = 'szgbkeqornkdngoegyso'
$EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local'
$MigrationPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'weekly-tracker\src\migrations\029_production_acl_followup.sql')).Path
$MigrationChecksum = 'f6d1a69f7821eb206645fa235c48efc568eeafde8d39b9db92c9cee738553464'

$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedRepositoryCommit) { throw 'ABORT: repository commit does not match approved identity' }
$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifest = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifest)) { throw 'ABORT: verified backup manifest is missing' }
if ((Get-FileChecksum -Path $backupManifest).ToLowerInvariant() -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'ABORT: verified backup manifest checksum mismatch' }
$preflightPath = (Resolve-Path -LiteralPath $ApprovedPreflightPath).Path
if ((Get-FileChecksum -Path $preflightPath).ToLowerInvariant() -ne $ExpectedPreflightSha256.ToLowerInvariant()) { throw 'ABORT: approved preflight checksum mismatch' }
$preflight = Get-Content -Raw -LiteralPath $preflightPath | ConvertFrom-Json
if ($preflight.status -ne 'READY_FOR_029' -or -not $preflight.productionFingerprintVerified -or -not $preflight.blockingLocks.safe) { throw 'ABORT: preflight evidence is failed, stale, or incomplete' }

$actualChecksum = (Get-FileChecksum -Path $MigrationPath).ToLowerInvariant()
if ($actualChecksum -ne $MigrationChecksum) {
    throw "ABORT: migration checksum mismatch. expected=$MigrationChecksum actual=$actualChecksum - refusing to apply an unreviewed file"
}

$migrationDir = Split-Path -Parent $MigrationPath
$migrationFile = Split-Path -Leaf $MigrationPath

$result = [ordered]@{
    migrationPath = 'weekly-tracker/src/migrations/029_production_acl_followup.sql'
    migrationChecksum = $actualChecksum
    startedAtUtc = $null
    completedAtUtc = $null
    exitCode = -1
    status = 'NOT_RUN'
    outputRedacted = $null
}

try {
    $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $ExpectedProjectRef
    Write-Host 'Production fingerprint: PASS'

    $env:PGHOST = $conn.Host
    $env:PGPORT = [string]$conn.Port
    $env:PGDATABASE = $conn.Database
    $env:PGUSER = $conn.User
    $env:PGPASSWORD = $conn.Password
    $env:PGSSLMODE = 'require'
    $conn = $null

    $mountMigration = "type=bind,source=$migrationDir,target=/apply,readonly"
    $result.startedAtUtc = [DateTime]::UtcNow.ToString('o')
    Write-Host "APPLY STARTED: $($result.startedAtUtc)"

    $applyResult = Invoke-NativeTool -Command 'docker' -ArgumentList @(
        'run', '--rm', '--network', 'bridge', '--mount', $mountMigration,
        '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
        '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage,
        'psql', '-X', '-U', $env:PGUSER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '--file', "/apply/$migrationFile"
    )

    $result.completedAtUtc = [DateTime]::UtcNow.ToString('o')
    $result.exitCode = $applyResult.ExitCode
    $result.status = if ($applyResult.ExitCode -eq 0) { 'PASS' } else { 'FAIL' }

    $rawOutput = ($applyResult.Output -join "`n")
    $redacted = $rawOutput -replace 'postgresql://[^\s]+', '[REDACTED_URI]' -replace 'PGPASSWORD=\S+', 'PGPASSWORD=[REDACTED]'
    $result.outputRedacted = $redacted

    Write-Host "APPLY COMPLETED: $($result.completedAtUtc)"
    Write-Host "Exit code: $($result.exitCode)"
    Write-Host "Status: $($result.status)"
    Write-Host "Output: $redacted"
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
}

$json = $result | ConvertTo-Json -Depth 10
if ($json -match 'PRODUCTION_DB_URL|postgresql://[a-zA-Z0-9._%+-]+:[^@\s]+@|eyJ[A-Za-z0-9_-]{10,}') {
    Write-Host 'REDACTION_CHECK: FAIL - refusing to write output that may contain a secret'
    exit 3
}
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
$tempOutput = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
Write-Utf8NoBom -Path $tempOutput -Value $json
Move-Item -LiteralPath $tempOutput -Destination $OutputPath -Force

if ($result.status -eq 'PASS') { exit 0 } else { exit 1 }
