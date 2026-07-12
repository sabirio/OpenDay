[CmdletBinding()]
param(
    [string]$PostgresImage = 'postgres:17',
    [string]$OutputPath
)

# One-time, read-only investigation of pg_default_acl and the exact ACL
# state of the objects migration 029 will correct. Same safe connection
# pattern as the other production-remediation-*-live.ps1 scripts:
# Get-ProductionConnectionFingerprint, dockerized psql over PG* env vars,
# one bounded READ ONLY REPEATABLE READ transaction per query, forbidden-
# statement guard, secrets never printed. This script issues ONLY SELECT
# statements against catalog views - no DDL, no DML, no GRANT/REVOKE, no
# function invocation.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\ProductionConnection.ps1')
. (Join-Path $PSScriptRoot 'lib\SecurityContractInventory.ps1')

$ExpectedProjectRef = 'szgbkeqornkdngoegyso'
$EnvFile = Join-Path $repoRoot 'weekly-tracker\.env.production.local'
$queryTempDirectory = Join-Path ([IO.Path]::GetTempPath()) "acl-investigation-live-$([guid]::NewGuid().ToString('N').Substring(0,8))"

$result = [ordered]@{ generatedAtUtc = [DateTime]::UtcNow.ToString('o') }

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

    New-Item -ItemType Directory -Path $queryTempDirectory | Out-Null
    $queryMount = "type=bind,source=$queryTempDirectory,target=/inventory,readonly"
    $dockerCommon = @('run', '--rm', '--network', 'bridge', '--mount', $queryMount,
        '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGDATABASE',
        '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGSSLMODE', $PostgresImage)
    $forbiddenPattern = '(?i)^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COPY|SET\s+ROLE)\b'
    $script:querySequence = 0
    $queryFn = {
        param([string]$Sql)
        if ($Sql -match $forbiddenPattern) { throw "refusing to execute a non-read-only statement: $Sql" }
        $script:querySequence++
        $wrapped = New-ReadOnlyCatalogScript -CatalogQuery $Sql
        $hostQueryPath = Join-Path $queryTempDirectory ("query-{0:D3}.sql" -f $script:querySequence)
        Write-Utf8NoBom -Path $hostQueryPath -Value ($wrapped + [Environment]::NewLine)
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList ($dockerCommon + @(
            'psql', '-X', '--quiet', '--tuples-only', '--no-align', '--field-separator', "`t",
            '--file', "/inventory/$(Split-Path -Leaf $hostQueryPath)"))
        Remove-Item -LiteralPath $hostQueryPath -Force -ErrorAction SilentlyContinue
        if ($r.ExitCode -ne 0) { throw "query failed (exit=$($r.ExitCode)): $($r.Output -join ' | ')" }
        return ($r.Output -join "`n")
    }

    # 1. pg_default_acl: any ALTER DEFAULT PRIVILEGES configured for the
    # public schema (or database-wide) that would auto-grant to anon on
    # newly created sequences/functions.
    $defAclSql = @"
SELECT
  CASE d.defaclobjtype WHEN 'r' THEN 'table' WHEN 'S' THEN 'sequence' WHEN 'f' THEN 'function' WHEN 'T' THEN 'type' WHEN 'n' THEN 'schema' ELSE d.defaclobjtype::text END,
  r.rolname AS defacl_owner_role,
  coalesce(n.nspname, '(database-wide)'),
  array_to_string(d.defaclacl, ',')
FROM pg_default_acl d
JOIN pg_roles r ON r.oid = d.defaclrole
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1,2,3
"@
    $result.pg_default_acl = (& $queryFn $defAclSql)

    # 2. aclexplode of the actual sequence ACL (direct grants only, exactly
    # as stored - not "effective" access through role membership).
    $seqAclSql = @"
SELECT
  (aclexplode(c.relacl)).grantee::regrole::text,
  (aclexplode(c.relacl)).privilege_type,
  (aclexplode(c.relacl)).is_grantable
FROM pg_class c
WHERE c.relname = 'write_command_requests_id_seq' AND c.relkind = 'S'
ORDER BY 1,2
"@
    $result.write_command_requests_id_seq_direct_acl = (& $queryFn $seqAclSql)

    # 3. Raw relacl text (includes any NULL/default-acl-not-set marker).
    $seqRawAclSql = "SELECT relacl IS NULL, relacl::text FROM pg_class WHERE relname = 'write_command_requests_id_seq' AND relkind = 'S'"
    $result.write_command_requests_id_seq_raw_acl = (& $queryFn $seqRawAclSql)

    # 4. aclexplode of both atomic RPC functions' direct ACL.
    $fnAclSql = @"
SELECT p.proname,
  (aclexplode(p.proacl)).grantee::regrole::text,
  (aclexplode(p.proacl)).privilege_type
FROM pg_proc p
WHERE p.proname IN ('submit_contractor_report_atomic','submit_site_visit_atomic')
ORDER BY 1,2,3
"@
    $result.atomic_rpc_direct_acl = (& $queryFn $fnAclSql)

    # 5. Does public.write_command_requests (the TABLE) itself show any
    # residual direct ACL for anon/authenticated (should be none - already
    # confirmed matched by composite certification, cross-checking here).
    $tableAclSql = @"
SELECT (aclexplode(c.relacl)).grantee::regrole::text, (aclexplode(c.relacl)).privilege_type
FROM pg_class c WHERE c.relname = 'write_command_requests' AND c.relkind = 'r'
ORDER BY 1,2
"@
    $result.write_command_requests_table_direct_acl = (& $queryFn $tableAclSql)

    # 6. For comparison: a pre-existing sequence's ACL (projects_id_seq),
    # to see whether the same anon/authenticated direct-grant pattern
    # exists there too (platform-wide default vs one-off).
    $existingSeqAclSql = @"
SELECT
  (aclexplode(c.relacl)).grantee::regrole::text,
  (aclexplode(c.relacl)).privilege_type
FROM pg_class c
WHERE c.relname = 'projects_id_seq' AND c.relkind = 'S'
ORDER BY 1,2
"@
    $result.projects_id_seq_direct_acl_for_comparison = (& $queryFn $existingSeqAclSql)

    # 7. Postgres version, for compatibility documentation.
    $result.postgresVersion = (& $queryFn "SELECT version()").Trim()

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
if ($OutputPath) { Write-Utf8NoBom -Path $OutputPath -Value $json }
exit 0
