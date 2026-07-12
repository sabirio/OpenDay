[CmdletBinding()]
param(
    [string]$PostgresImage = 'postgres:17',
    [Parameter(Mandatory)][string]$VerifiedBackupPath,
    [Parameter(Mandatory)][string]$ExpectedBackupManifestSha256,
    [Parameter(Mandatory)][string]$OutputPath
)

# Read-only production preflight specific to migration 029 (production ACL
# follow-up on migration 028's own new objects). Same safe connection
# pattern as production-remediation-preflight-live.ps1/production-acl-
# investigation-live.ps1: Get-ProductionConnectionFingerprint validation,
# dockerized psql over PG* env vars, one bounded READ ONLY REPEATABLE READ
# transaction per query (New-ReadOnlyCatalogScript), forbidden-statement
# guard, secrets never printed, env vars cleared in finally. Issues ONLY
# SELECT/has_*_privilege/aclexplode catalog reads - no DDL/DML/GRANT/REVOKE,
# no function invocation that can write.
#
# Confirms exactly two things migration 029 cares about:
#   (a) migration 028 is fully applied (its 5 target objects all exist);
#   (b) migration 029 has NOT yet been applied - the exact 8 known ACL
#       differences are still present, and no additional, unexplained
#       ACL difference has appeared on the same 3 objects.
# Does not attempt a full composite certification (that is run separately,
# via the unmodified composite-security-certification.ps1, both before and
# after apply) - this is a fast, targeted, read-only go/no-go gate.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $PSScriptRoot 'lib\RemediationPreflightPostflight.ps1')

$ExpectedProjectRef = 'szgbkeqornkdngoegyso'
$EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local'
$queryTempDirectory = Join-Path ([IO.Path]::GetTempPath()) "migration029-preflight-live-$([guid]::NewGuid().ToString('N').Substring(0,8))"

$backup = (Resolve-Path -LiteralPath $VerifiedBackupPath).Path
$backupManifest = Join-Path $backup 'backup-manifest.json'
if (-not (Test-Path -LiteralPath $backupManifest)) { throw 'verified backup manifest is missing' }
$actualManifestHash = (Get-FileChecksum -Path $backupManifest).ToLowerInvariant()
if ($actualManifestHash -ne $ExpectedBackupManifestSha256.ToLowerInvariant()) { throw 'verified backup manifest checksum mismatch' }

$result = [ordered]@{
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    productionFingerprintVerified = $false
    migration028Preflight = $null
    knownEightDifferences = [ordered]@{}
    additionalUnexpectedDifferences = @()
    blockingLocks = [ordered]@{ conflictingLockCount = -1; safe = $false }
    status = 'NOT_READY'
    reasons = @()
}

# The exact 8 known differences, as (label, sql, expectedIfNotYetApplied).
# expectedIfNotYetApplied='t' means: before 029 runs, this SHOULD still be
# true (the unwanted grant is still present) - if any of these is already
# 'f', migration 029 (or an equivalent manual fix) has already partially
# or fully landed.
$eightChecks = @(
    @{ label = 'anon has SELECT on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','SELECT')"; expectedIfNotYetApplied = 't' },
    @{ label = 'anon has UPDATE on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','UPDATE')"; expectedIfNotYetApplied = 't' },
    @{ label = 'anon has USAGE on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','USAGE')"; expectedIfNotYetApplied = 't' },
    @{ label = 'authenticated has SELECT on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','SELECT')"; expectedIfNotYetApplied = 't' },
    @{ label = 'authenticated has UPDATE on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','UPDATE')"; expectedIfNotYetApplied = 't' },
    @{ label = 'authenticated has USAGE on write_command_requests_id_seq (pre-029 expected)'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','USAGE')"; expectedIfNotYetApplied = 't' },
    @{ label = 'anon has EXECUTE on submit_contractor_report_atomic (pre-029 expected)'; sql = "SELECT has_function_privilege('anon','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expectedIfNotYetApplied = 't' },
    @{ label = 'anon has EXECUTE on submit_site_visit_atomic (pre-029 expected)'; sql = "SELECT has_function_privilege('anon','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expectedIfNotYetApplied = 't' }
)

# Additional-difference guard: also confirm the objects this migration does
# NOT touch remain exactly as migration 028 left them (postgres/service_role
# sequence USAGE, authenticated EXECUTE on both RPCs) - if any of these has
# ALREADY changed, something other than the reviewed migration 029 has
# touched these objects and the apply must not proceed blindly.
$unaffectedChecks = @(
    @{ label = 'postgres retains USAGE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('postgres','public.write_command_requests_id_seq','USAGE')"; expected = 't' },
    @{ label = 'service_role retains USAGE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('service_role','public.write_command_requests_id_seq','USAGE')"; expected = 't' },
    @{ label = 'authenticated retains EXECUTE on submit_contractor_report_atomic'; sql = "SELECT has_function_privilege('authenticated','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expected = 't' },
    @{ label = 'authenticated retains EXECUTE on submit_site_visit_atomic'; sql = "SELECT has_function_privilege('authenticated','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expected = 't' },
    @{ label = 'service_role retains EXECUTE on submit_contractor_report_atomic'; sql = "SELECT has_function_privilege('service_role','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expected = 't' },
    @{ label = 'service_role retains EXECUTE on submit_site_visit_atomic'; sql = "SELECT has_function_privilege('service_role','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expected = 't' }
)

try {
    $conn = Get-ProductionConnectionFingerprint -EnvFile $EnvFile -RepoRoot $repoRoot -ExpectedProjectRef $ExpectedProjectRef
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
    $rawQueryFn = { param([string]$WrappedSql) return Invoke-RawWrappedQuery -WrappedSql $WrappedSql }

    $preflight028 = Invoke-RemediationPreflight -Query $rawQueryFn
    $result.migration028Preflight = $preflight028
    if ($preflight028.status -ne 'ALREADY_REMEDIATED') {
        $result.reasons += "migration 028 preflight status is '$($preflight028.status)', expected ALREADY_REMEDIATED (028 must be fully applied before 029 makes sense)"
    }

    $allEightStillPresent = $true
    foreach ($check in $eightChecks) {
        $actual = (& $queryFn $check.sql).Trim()
        $stillPresent = ($actual -eq $check.expectedIfNotYetApplied)
        $result.knownEightDifferences[$check.label] = [ordered]@{ actual = $actual; stillPresent = $stillPresent }
        if (-not $stillPresent) { $allEightStillPresent = $false }
    }
    if (-not $allEightStillPresent) {
        $result.reasons += 'one or more of the 8 known differences is already resolved - migration 029 (or an equivalent manual change) may already be partially or fully applied; refusing to proceed blindly'
    }

    foreach ($check in $unaffectedChecks) {
        $actual = (& $queryFn $check.sql).Trim()
        if ($actual -ne $check.expected) {
            $result.additionalUnexpectedDifferences += "$($check.label): expected=$($check.expected) actual=$actual"
        }
    }
    if ($result.additionalUnexpectedDifferences.Count -gt 0) {
        $result.reasons += 'unexpected drift detected on objects migration 029 does not touch - investigate before applying'
    }

    $lockSql = @"
SELECT count(*) FROM pg_locks l
JOIN pg_class c ON c.oid = l.relation
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('write_command_requests','write_command_requests_id_seq')
  AND l.mode IN ('AccessExclusiveLock','ExclusiveLock','ShareRowExclusiveLock')
"@
    $lockRaw = (& $queryFn $lockSql).Trim()
    $blockingLockCount = if ([string]::IsNullOrWhiteSpace($lockRaw)) { 0 } else { [int]$lockRaw }
    $result.blockingLocks = [ordered]@{ conflictingLockCount = $blockingLockCount; safe = ($blockingLockCount -eq 0) }
    if ($blockingLockCount -ne 0) { $result.reasons += "found $blockingLockCount conflicting lock(s) on the target objects" }

    if ($result.reasons.Count -eq 0) {
        $result.status = 'READY_FOR_029'
    } else {
        $result.status = 'NOT_READY'
    }

} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGHOST, Env:PGPORT, Env:PGDATABASE, Env:PGUSER, Env:PGSSLMODE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $queryTempDirectory) { Remove-Item -LiteralPath $queryTempDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}

$json = $result | ConvertTo-Json -Depth 10
if ($json -match 'PRODUCTION_DB_URL|postgresql://|postgres://|eyJ[A-Za-z0-9_-]{10,}') {
    Write-Host 'REDACTION_CHECK: FAIL - refusing to print output that may contain a secret'
    exit 3
}
Write-Host $json
$outputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }
$tempOutput = "$OutputPath.tmp-$([guid]::NewGuid().ToString('N'))"
Write-Utf8NoBom -Path $tempOutput -Value $json
Move-Item -LiteralPath $tempOutput -Destination $OutputPath -Force
Write-Host "MIGRATION_029_PREFLIGHT: $($result.status)"
if ($result.status -eq 'READY_FOR_029') { exit 0 } else { exit 1 }
