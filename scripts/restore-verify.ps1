[CmdletBinding()]
param(
    [string]$BackupPath,
    [switch]$Latest,
    [string]$BackupRoot,
    [string]$PostgresImage = 'postgres:17',
    [string]$ExpectedSourceCommit,
    [string]$ExpectedReleaseManifestSha256,
    [string]$ExpectedBackupScriptSha256
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Windows PowerShell 5.1 can evaluate parameter default expressions before
# $PSScriptRoot is populated for a -File invocation. Resolve this default in
# the script body so an explicit -BackupPath remains usable on PS 5.1.
if (-not $BackupRoot) {
    $BackupRoot = Join-Path $PSScriptRoot '..\backups\production'
}

$ScriptVersion = '1.0'
$ExpectedManifestStatus = 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND'
$RequiredFiles = @('roles.sql', 'schema.sql', 'data.sql', 'migration_history_schema.sql', 'migration_history_data.sql', 'checksums.sha256', 'backup-manifest.json')
$MinimumBytes = @{
    'roles.sql' = 32
    'schema.sql' = 512
    'data.sql' = 32
    'migration_history_schema.sql' = 64
    'migration_history_data.sql' = 32
    'checksums.sha256' = 10
    'backup-manifest.json' = 10
}
# Supabase-proprietary extensions that cannot install on vanilla postgres:17
# (they ship only in Supabase's own Postgres build). A backup restored here
# is expected to be missing these - that is an environment gap, not a
# restore defect. Filtered from a TEMP copy of schema.sql only; the real
# schema.sql on disk is never modified. Anything not on this explicit list
# still runs under strict ON_ERROR_STOP=1 and fails the run if it errors.
$UnavailableExtensions = @('supabase_vault', 'pgsodium', 'pg_graphql', 'pg_net', 'pgjwt', 'wrappers', 'pg_cron')
# Roles postgres:17's own entrypoint/initdb already creates before roles.sql
# ever runs - a plain `CREATE ROLE postgres;` deterministically conflicts
# with every disposable container regardless of backup quality. See
# New-FilteredRolesFile in lib/RestoreVerifyHelpers.ps1.
$BootstrapRoles = @('postgres')
$ExpectedSchemas = @('public', 'auth', 'storage', 'extensions', 'vault', 'realtime', 'graphql', 'graphql_public', 'pgbouncer')
# Required only if declared in the backup's own schema.sql (see Test-KeyTableDeclared).
$KeyTables = @('projects', 'contractor_reports', 'site_visits', 'progress_history', 'project_gantt_tasks',
    'profiles', 'templates', 'task_groups', 'task_group_members', 'audit_log', 'reports')

# ---------------------------------------------------------------------------
# Parameter validation - fail closed before touching the filesystem or Docker.
# ---------------------------------------------------------------------------
if ($BackupPath -and $Latest) {
    throw "USAGE ERROR: -BackupPath and -Latest cannot be used together. Pass exactly one."
}
if (-not $BackupPath -and -not $Latest) {
    throw "USAGE ERROR: pass either -BackupPath <dir> or -Latest."
}
if (-not $ExpectedSourceCommit -or -not $ExpectedReleaseManifestSha256 -or -not $ExpectedBackupScriptSha256) {
    throw 'USAGE ERROR: release-qualified restore requires ExpectedSourceCommit, ExpectedReleaseManifestSha256 and ExpectedBackupScriptSha256'
}

# ---------------------------------------------------------------------------
# Shared helpers (pure functions, no side effects beyond explicit params) -
# kept in a separate file so offline tests can dot-source just the testable
# logic without executing this script's Docker orchestration below.
# ---------------------------------------------------------------------------
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\BackupReleaseBinding.ps1')

# ---------------------------------------------------------------------------
# -Latest resolution
# ---------------------------------------------------------------------------
if ($Latest) {
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) {
        throw "USAGE ERROR: -Latest given but backup root does not exist: $BackupRoot"
    }
    $candidates = Get-ChildItem -LiteralPath $BackupRoot -Directory | Sort-Object Name -Descending
    $chosen = $null
    foreach ($c in $candidates) {
        $manifestPath = Join-Path $c.FullName 'backup-manifest.json'
        $checksumPath = Join-Path $c.FullName 'checksums.sha256'
        if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { continue }
        if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { continue }
        try {
            $m = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        } catch { continue }
        if ($m.status -eq $ExpectedManifestStatus) { $chosen = $c.FullName; break }
    }
    if (-not $chosen) {
        throw "USAGE ERROR: -Latest found no complete backup (manifest status '$ExpectedManifestStatus') under $BackupRoot"
    }
    $BackupPath = $chosen
}

$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$backupDirName = Split-Path -Leaf $BackupPath

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
$containerName = "restore-verify-$suffix"
$volumeName = "restore-verify-vol-$suffix"
$hostTempDir = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-tmp-$suffix"
$startedAt = [DateTime]::UtcNow

$diag = [ordered]@{
    verificationVersion = $ScriptVersion
    timestampUtc = $startedAt.ToString('o')
    backupPath = $BackupPath
    backupTimestamp = $backupDirName
    postgresImage = $PostgresImage
    checksumStatus = 'UNKNOWN'
    manifestStatus = 'UNKNOWN'
    backupManifestSha256 = $null
    releaseBindingStatus = 'UNKNOWN'
    migrationHistory = [ordered]@{ schema = $null; status = 'UNKNOWN'; action = 'UNKNOWN' }
    roleMemberships = [ordered]@{ status = 'UNKNOWN'; expectedEdges = @(); restoredEdges = @(); match = $false; grantorFidelity = 'normalized' }
    restoreSteps = @()
    schemas = [ordered]@{ expected = $ExpectedSchemas; found = @(); missing = @() }
    tableCount = -1
    tables = @()
    constraints = [ordered]@{ publicForeignKeyCount = -1; liveNotValid = @(); sourceDeclaredNotValid = @(); unexpectedNotValid = @() }
    unexpectedInvalidConstraints = @()
    triggers = [ordered]@{ totalPublic = -1; disabledPublic = -1; disabledNames = @() }
    sessionReplicationRole = 'UNKNOWN'
    cleanup = 'UNKNOWN'
    overallStatus = 'FAIL'
    failureReason = $null
    failedStep = $null
}

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail = '')
    $diag.restoreSteps += [ordered]@{ name = $Name; status = $Status; detail = $Detail }
    Write-Host "[$Status] $Name $(if ($Detail) { "- $Detail" })"
}

function Write-Report {
    $completedAt = [DateTime]::UtcNow
    $diag['completedAtUtc'] = $completedAt.ToString('o')
    $diag['durationSeconds'] = [math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    $json = ($diag | ConvertTo-Json -Depth 12) + [Environment]::NewLine
    $reportPath = Join-Path $BackupPath 'restore-verification.json'
    Write-Utf8NoBom -Path $reportPath -Value $json
    return $reportPath
}

$cleanupDone = $false
function Invoke-Cleanup {
    if ($script:cleanupDone) { return }
    $script:cleanupDone = $true
    $ok = $true
    try {
        Invoke-NativeTool -Command 'docker' -ArgumentList @('rm', '-f', $containerName) | Out-Null
        $stillContainer = (Invoke-NativeTool -Command 'docker' -ArgumentList @('ps', '-a', '--filter', "name=^/$containerName`$", '--format', '{{.Names}}')).Output
        if (-not [string]::IsNullOrWhiteSpace(($stillContainer -join ''))) { $ok = $false }
    } catch { $ok = $false }
    try {
        Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'rm', $volumeName) | Out-Null
        $stillVolume = (Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'ls', '--filter', "name=^$volumeName`$", '--format', '{{.Name}}')).Output
        if (-not [string]::IsNullOrWhiteSpace(($stillVolume -join ''))) { $ok = $false }
    } catch { $ok = $false }
    try {
        if (Test-Path -LiteralPath $hostTempDir) { Remove-Item -LiteralPath $hostTempDir -Recurse -Force -ErrorAction Stop }
    } catch { $ok = $false }
    $diag.cleanup = if ($ok) { 'PASS' } else { 'FAIL' }
    Write-Host "Cleanup: $($diag.cleanup)"
}

function Invoke-PsqlScalar([string]$Sql) {
    $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $containerName, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', $Sql)
    if ($r.ExitCode -ne 0) { throw "query failed (exit=$($r.ExitCode)): $Sql -- $($r.Output -join ' | ')" }
    return ($r.Output -join "`n").Trim()
}

function Invoke-PsqlFileStrict([string]$ContainerFilePath) {
    return Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $containerName, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $ContainerFilePath)
}

$reportWritten = $false

try {
    # =========================================================================
    # PHASE 1: pre-validation - no Docker involved, fail closed before any
    # container/volume is created.
    # =========================================================================
    if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) {
        $diag.failureReason = "backup directory does not exist: $BackupPath"; $diag.failedStep = 'pre_validation'; throw $diag.failureReason
    }

    $missingFiles = @($RequiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $BackupPath $_) -PathType Leaf) })
    if ($missingFiles.Count -gt 0) {
        $diag.failureReason = "required backup file(s) missing: $($missingFiles -join ', ')"; $diag.failedStep = 'pre_validation'; throw $diag.failureReason
    }
    Add-Step 'required_files_present' 'PASS'

    $tooSmall = @()
    foreach ($f in $RequiredFiles) {
        $p = Join-Path $BackupPath $f
        $len = (Get-Item -LiteralPath $p).Length
        if ($len -lt $MinimumBytes[$f]) { $tooSmall += "$f ($len bytes)" }
    }
    if ($tooSmall.Count -gt 0) {
        $diag.failureReason = "backup file(s) below minimum size: $($tooSmall -join ', ')"; $diag.failedStep = 'pre_validation'; throw $diag.failureReason
    }
    Add-Step 'minimum_size_check' 'PASS'

    try {
        $manifestFile = Join-Path $BackupPath 'backup-manifest.json'
        $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
        $diag.backupManifestSha256 = (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()
    } catch {
        $diag.failureReason = "backup-manifest.json is not valid JSON: $($_.Exception.Message)"; $diag.failedStep = 'pre_validation'; throw $diag.failureReason
    }
    Add-Step 'manifest_json_valid' 'PASS'

    $diag.manifestStatus = [string]$manifest.status
    if ($diag.manifestStatus -ne $ExpectedManifestStatus) {
        $diag.failureReason = "manifest status is not a completed backup: '$($diag.manifestStatus)' (expected '$ExpectedManifestStatus') - backup is partial or failed"
        $diag.failedStep = 'pre_validation'
        throw $diag.failureReason
    }
    Add-Step 'manifest_status_complete' 'PASS' $diag.manifestStatus
    Assert-BackupManifestReleaseBinding -Manifest $manifest -ExpectedSourceCommit $ExpectedSourceCommit `
        -ExpectedReleaseManifestSha256 $ExpectedReleaseManifestSha256 `
        -ExpectedBackupScriptSha256 $ExpectedBackupScriptSha256 | Out-Null
    $diag.releaseBindingStatus = 'PASS'
    Add-Step 'manifest_release_binding' 'PASS' 'source commit, release manifest and canonical script hashes match'

    $mhStatus = [string]$manifest.migrationHistory.status
    if ($mhStatus -ne 'present' -and $mhStatus -ne 'not_present') {
        $diag.failureReason = "manifest migrationHistory.status is not recognized: '$mhStatus'"; $diag.failedStep = 'pre_validation'; throw $diag.failureReason
    }
    $diag.migrationHistory.schema = [string]$manifest.migrationHistory.schema
    $diag.migrationHistory.status = $mhStatus
    Add-Step 'manifest_migration_history_status' 'PASS' $mhStatus

    $checksumLines = Get-Content -LiteralPath (Join-Path $BackupPath 'checksums.sha256')
    $checksumOk = $true
    $checksumDetails = @()
    foreach ($line in $checksumLines) {
        if ($line -match '^([0-9a-f]{64})\s+(\S+)$') {
            $expected = $Matches[1]; $file = $Matches[2]
            $actualPath = Join-Path $BackupPath $file
            if (-not (Test-Path -LiteralPath $actualPath -PathType Leaf)) { $checksumOk = $false; $checksumDetails += "$file : MISSING"; continue }
            $actual = Get-FileChecksum $actualPath
            if ($actual -ne $expected) { $checksumOk = $false; $checksumDetails += "$file : MISMATCH" } else { $checksumDetails += "$file : MATCH" }
        }
    }
    $diag.checksumStatus = if ($checksumOk) { 'PASS' } else { 'FAIL' }
    Add-Step 'checksum_verification' $diag.checksumStatus ($checksumDetails -join '; ')
    if (-not $checksumOk) {
        $diag.failureReason = 'checksum mismatch - restore not started'; $diag.failedStep = 'checksum_verification'; throw $diag.failureReason
    }

    # =========================================================================
    # PHASE 2: parse data.sql (source of truth for row counts) and schema.sql
    # (source of truth for pre-existing NOT VALID constraints) before Docker.
    # =========================================================================
    $sourceCopyBlocks = Get-CopyBlockInventory -Path (Join-Path $BackupPath 'data.sql')
    $sourceRowsByTable = [ordered]@{}
    foreach ($b in $sourceCopyBlocks) {
        $ref = ConvertTo-NormalizedTableRef $b.Ref
        $key = "$($ref.Schema).$($ref.Table)"
        if ($sourceRowsByTable.Contains($key)) { $sourceRowsByTable[$key] += $b.Rows } else { $sourceRowsByTable[$key] = $b.Rows }
    }
    Add-Step 'parse_data_sql_copy_blocks' 'PASS' "$($sourceCopyBlocks.Count) COPY block(s), $($sourceRowsByTable.Count) distinct table(s)"

    $schemaSqlText = [System.IO.File]::ReadAllLines((Join-Path $BackupPath 'schema.sql'))
    $sourceNotValidMatches = $schemaSqlText | Select-String -Pattern 'ADD CONSTRAINT (\S+) .*NOT VALID;$'
    $sourceDeclaredNotValid = @($sourceNotValidMatches | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique)
    $diag.constraints.sourceDeclaredNotValid = $sourceDeclaredNotValid

    $keyTablesDeclared = @{}
    foreach ($t in $KeyTables) {
        $keyTablesDeclared[$t] = [bool]($schemaSqlText -match "^CREATE TABLE public\.$t \(")
    }

    # =========================================================================
    # PHASE 3: disposable PostgreSQL 17 - fresh volume, no host port, no
    # attachment to the local Supabase stack, disposable trust-auth only.
    # =========================================================================
    New-Item -ItemType Directory -Path $hostTempDir | Out-Null

    $volCreate = Invoke-NativeTool -Command 'docker' -ArgumentList @('volume', 'create', $volumeName)
    if ($volCreate.ExitCode -ne 0) { $diag.failureReason = "docker volume create failed (exit=$($volCreate.ExitCode))"; $diag.failedStep = 'container_start'; throw $diag.failureReason }

    $backupMount = "type=bind,source=$BackupPath,target=/verify-backup,readonly"
    $tempMount = "type=bind,source=$hostTempDir,target=/verify-temp,readonly"
    $runArgs = @('run', '-d', '--name', $containerName,
        '-v', "${volumeName}:/var/lib/postgresql/data",
        '--mount', $backupMount,
        '--mount', $tempMount,
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
        '-e', 'POSTGRES_DB=postgres',
        $PostgresImage)
    $runResult = Invoke-NativeTool -Command 'docker' -ArgumentList $runArgs
    if ($runResult.ExitCode -ne 0) {
        $diag.failureReason = "docker run failed (exit=$($runResult.ExitCode))"; $diag.failedStep = 'container_start'; throw $diag.failureReason
    }
    Add-Step 'container_start' 'PASS' $containerName

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        $r = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $containerName, 'pg_isready', '-U', 'postgres')
        if ($r.ExitCode -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        $diag.failureReason = 'PostgreSQL did not become ready within the bounded retry window (30s)'; $diag.failedStep = 'container_ready'; throw $diag.failureReason
    }
    Add-Step 'container_ready' 'PASS'

    # =========================================================================
    # PHASE 4: restore in order, -X -v ON_ERROR_STOP=1, no continuation past
    # an unexpected error. The only allowed deviations are narrow, TEMP-
    # copy-only filters for statements that deterministically conflict with
    # postgres:17's own bootstrap regardless of backup quality: the
    # `postgres` role's CREATE/SUPERUSER-strip/GRANTED-BY-grantor conflicts
    # (see New-FilteredRolesFile) and Supabase-proprietary extensions (never
    # available on vanilla postgres:17). Neither real backup file is touched.
    # =========================================================================
    $expectedMembershipEdges = Get-RoleMembershipEdges -Path (Join-Path $BackupPath 'roles.sql')
    $diag.roleMemberships.expectedEdges = @($expectedMembershipEdges | ForEach-Object {
        [ordered]@{ role = $_.Role; member = $_.Member; adminOption = $_.AdminOption; inheritOption = $_.InheritOption; setOption = $_.SetOption }
    })

    $filteredRolesPath = Join-Path $hostTempDir 'roles.filtered.sql'
    $filteredRoles = New-FilteredRolesFile -SourcePath (Join-Path $BackupPath 'roles.sql') -DestinationPath $filteredRolesPath -BootstrapRoleNames $BootstrapRoles
    $rolesResult = Invoke-PsqlFileStrict '/verify-temp/roles.filtered.sql'
    if ($rolesResult.ExitCode -ne 0) {
        $diag.failureReason = "roles.sql restore failed (exit=$($rolesResult.ExitCode)) even after normalizing bootstrap-role statements ($($filteredRoles -join ', '))"
        $diag.failedStep = 'restore_roles'
        throw $diag.failureReason
    }
    Add-Step 'restore_roles' 'PASS' "exit=$($rolesResult.ExitCode); bootstrap-role statements adjusted: $($filteredRoles.Count) ($($filteredRoles -join ' | '))"

    # Independent verification of the role-membership graph: don't trust
    # exit code 0 alone. Every edge roles.sql declared (role/member, plus
    # ADMIN/INHERIT/SET OPTION where the source specified them) must exist
    # in pg_auth_members - the grantor column is deliberately NOT checked,
    # since it was intentionally normalized above (Supabase's real grantor
    # bootstrap is external to what pg_dumpall --roles-only can capture).
    $membershipRaw = Invoke-PsqlScalar "SELECT roleid::regrole::text || '|' || member::regrole::text || '|' || admin_option::text || '|' || inherit_option::text || '|' || set_option::text FROM pg_auth_members ORDER BY roleid::regrole::text, member::regrole::text;"
    $restoredEdges = @()
    if (-not [string]::IsNullOrWhiteSpace($membershipRaw)) {
        foreach ($edgeLine in ($membershipRaw -split "`n")) {
            $parts = $edgeLine -split '\|'
            if ($parts.Count -ge 5) {
                $restoredEdges += [ordered]@{ role = $parts[0]; member = $parts[1]; adminOption = [bool]::Parse($parts[2]); inheritOption = [bool]::Parse($parts[3]); setOption = [bool]::Parse($parts[4]) }
            }
        }
    }
    $diag.roleMemberships.restoredEdges = $restoredEdges

    $missingEdges = @()
    foreach ($expected in $expectedMembershipEdges) {
        $found = $restoredEdges | Where-Object { $_.role -eq $expected.Role -and $_.member -eq $expected.Member }
        if (-not $found) {
            $missingEdges += "$($expected.Role)->$($expected.Member) (missing)"
            continue
        }
        if ($found.adminOption -ne $expected.AdminOption) {
            $missingEdges += "$($expected.Role)->$($expected.Member) (adminOption expected=$($expected.AdminOption) actual=$($found.adminOption))"
            continue
        }
        if ($null -ne $expected.InheritOption -and $found.inheritOption -ne $expected.InheritOption) {
            $missingEdges += "$($expected.Role)->$($expected.Member) (inheritOption expected=$($expected.InheritOption) actual=$($found.inheritOption))"
            continue
        }
        if ($null -ne $expected.SetOption -and $found.setOption -ne $expected.SetOption) {
            $missingEdges += "$($expected.Role)->$($expected.Member) (setOption expected=$($expected.SetOption) actual=$($found.setOption))"
        }
    }
    $diag.roleMemberships.match = ($missingEdges.Count -eq 0)
    $diag.roleMemberships.status = if ($missingEdges.Count -eq 0) { 'restored' } else { 'mismatch' }
    Add-Step 'role_membership_verification' $(if ($missingEdges.Count -eq 0) { 'PASS' } else { 'FAIL' }) `
        "expected=$($expectedMembershipEdges.Count) restored-checked=$($restoredEdges.Count); mismatches: $($missingEdges -join '; ')"
    if ($missingEdges.Count -gt 0) {
        $diag.failureReason = "role membership edge(s) not restored as expected: $($missingEdges -join '; ')"
        $diag.failedStep = 'role_membership_verification'
        throw $diag.failureReason
    }

    $filteredSchemaPath = Join-Path $hostTempDir 'schema.filtered.sql'
    $filteredExtensions = New-FilteredSchemaFile -SourcePath (Join-Path $BackupPath 'schema.sql') -DestinationPath $filteredSchemaPath -UnavailableExtensionNames $UnavailableExtensions
    $schemaResult = Invoke-PsqlFileStrict '/verify-temp/schema.filtered.sql'
    if ($schemaResult.ExitCode -ne 0) {
        $diag.failureReason = "schema.sql restore failed (exit=$($schemaResult.ExitCode)) even after filtering known-unavailable extensions ($($filteredExtensions -join ', '))"
        $diag.failedStep = 'restore_schema'
        throw $diag.failureReason
    }
    Add-Step 'restore_schema' 'PASS' "exit=$($schemaResult.ExitCode); filtered extension statements: $($filteredExtensions.Count) ($($filteredExtensions -join ' | '))"

    $liveMigrationPresent = (Invoke-PsqlScalar "SELECT to_regnamespace('$($diag.migrationHistory.schema)') IS NOT NULL;") -eq 't'
    $liveMigrationStatus = if ($liveMigrationPresent) { 'present' } else { 'not_present' }
    if ($liveMigrationStatus -ne $diag.migrationHistory.status) {
        $diag.failureReason = "migration history status mismatch: live=$liveMigrationStatus manifest=$($diag.migrationHistory.status)"
        $diag.failedStep = 'restore_migration_history'
        throw $diag.failureReason
    }

    $mhSchemaResult = Invoke-PsqlFileStrict '/verify-backup/migration_history_schema.sql'
    if ($mhSchemaResult.ExitCode -ne 0) {
        $diag.failureReason = "migration_history_schema.sql did not execute cleanly (exit=$($mhSchemaResult.ExitCode))"; $diag.failedStep = 'restore_migration_history'; throw $diag.failureReason
    }
    $mhDataResult = Invoke-PsqlFileStrict '/verify-backup/migration_history_data.sql'
    if ($mhDataResult.ExitCode -ne 0) {
        $diag.failureReason = "migration_history_data.sql did not execute cleanly (exit=$($mhDataResult.ExitCode))"; $diag.failedStep = 'restore_migration_history'; throw $diag.failureReason
    }
    $diag.migrationHistory.action = if ($liveMigrationPresent) { 'restored' } else { 'no_op_executed' }
    Add-Step 'restore_migration_history' 'PASS' "status=$liveMigrationStatus action=$($diag.migrationHistory.action)"

    # Which tables from data.sql's COPY blocks actually exist after schema
    # restore? Drives the data.sql filter below so ON_ERROR_STOP=1 can stay
    # strict: only COPY blocks for genuinely-missing (extension-dependent)
    # relations are skipped, never anything unexpected.
    $tableExists = @{}
    foreach ($key in $sourceRowsByTable.Keys) {
        $parts = $key.Split([char]46, 2)
        $qualified = "$($parts[0]).$($parts[1])"
        $exists = (Invoke-PsqlScalar "SELECT to_regclass('$qualified') IS NOT NULL;") -eq 't'
        $tableExists[$key] = $exists
    }

    $filteredDataPath = Join-Path $hostTempDir 'data.filtered.sql'
    $skippedTables = New-FilteredDataFile -SourcePath (Join-Path $BackupPath 'data.sql') -DestinationPath $filteredDataPath -TableExists $tableExists

    # =========================================================================
    # PHASE 5: single-session data load. session_replication_role is a
    # per-CONNECTION setting; SET / \i-equivalent / SET back to origin must
    # all run inside the SAME psql invocation (one `docker exec` = one
    # connection), or the replica-role override silently never applies.
    # =========================================================================
    $dataResult = Invoke-NativeTool -Command 'docker' -ArgumentList @('exec', $containerName, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        '-c', 'SET session_replication_role = replica;',
        '-f', '/verify-temp/data.filtered.sql',
        '-c', 'SET session_replication_role = origin;')
    if ($dataResult.ExitCode -ne 0) {
        $diag.failureReason = "data.sql restore failed (exit=$($dataResult.ExitCode)) even after filtering $($skippedTables.Count) extension-dependent table(s)"
        $diag.failedStep = 'restore_data'
        throw $diag.failureReason
    }
    Add-Step 'restore_data' 'PASS' "exit=$($dataResult.ExitCode); skipped tables (relation absent, extension-dependent): $($skippedTables.Count) ($($skippedTables -join ' | '))"

    # session_replication_role is per-connection; verify on a FRESH connection
    # that nothing leaked a non-default value forward.
    $diag.sessionReplicationRole = Invoke-PsqlScalar "SHOW session_replication_role;"
    if ($diag.sessionReplicationRole -ne 'origin') {
        $diag.failureReason = "session_replication_role is not 'origin' on a fresh connection after restore: got '$($diag.sessionReplicationRole)'"
        $diag.failedStep = 'session_replication_role_check'
        throw $diag.failureReason
    }
    Add-Step 'session_replication_role_check' 'PASS' $diag.sessionReplicationRole

    # =========================================================================
    # PHASE 6: structural verification.
    # =========================================================================
    if ((Invoke-PsqlScalar "SELECT 1;") -ne '1') {
        $diag.failureReason = 'database did not accept a basic connection/query after restore'; $diag.failedStep = 'connectivity'; throw $diag.failureReason
    }
    Add-Step 'connectivity' 'PASS'

    $schemaListSql = "SELECT string_agg(schema_name, ',') FROM information_schema.schemata WHERE schema_name = ANY(ARRAY['$($ExpectedSchemas -join "','")']);"
    $foundSchemasRaw = Invoke-PsqlScalar $schemaListSql
    $foundSchemas = @()
    if (-not [string]::IsNullOrWhiteSpace($foundSchemasRaw)) { $foundSchemas = @($foundSchemasRaw -split ',') }
    $diag.schemas.found = $foundSchemas
    $missingSchemas = @($ExpectedSchemas | Where-Object { $foundSchemas -notcontains $_ })
    $diag.schemas.missing = $missingSchemas
    if ($missingSchemas -notcontains 'public') {
        Add-Step 'schema_presence' 'PASS' "missing (non-public, informational): $($missingSchemas -join ', ')"
    } else {
        $diag.failureReason = "'public' schema is missing after restore"; $diag.failedStep = 'schema_presence'; throw $diag.failureReason
    }

    $publicTableCount = [int](Invoke-PsqlScalar "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';")
    $diag.tableCount = $publicTableCount
    if ($publicTableCount -le 0) {
        $diag.failureReason = 'zero user tables in public schema after restore'; $diag.failedStep = 'table_count'; throw $diag.failureReason
    }
    Add-Step 'table_count' 'PASS' "public base tables: $publicTableCount"

    $missingKeyTables = @()
    foreach ($t in $KeyTables) {
        if (-not $keyTablesDeclared[$t]) { continue }
        $exists = (Invoke-PsqlScalar "SELECT to_regclass('public.$t') IS NOT NULL;") -eq 't'
        if (-not $exists) { $missingKeyTables += $t }
    }
    if ($missingKeyTables.Count -gt 0) {
        $diag.failureReason = "key table(s) declared in source schema.sql but missing after restore: $($missingKeyTables -join ', ')"
        $diag.failedStep = 'key_tables_present'
        throw $diag.failureReason
    }
    Add-Step 'key_tables_present' 'PASS' "checked: $($KeyTables -join ', ')"

    # =========================================================================
    # PHASE 7: row-count verification - the actual proof of restore fidelity.
    # =========================================================================
    $tableResults = @()
    $userTableMismatches = @()
    foreach ($key in $sourceRowsByTable.Keys) {
        $parts = $key.Split([char]46, 2)
        $schemaName = $parts[0]; $tableName = $parts[1]
        $qualified = "$schemaName.$tableName"
        $sourceRows = [int]$sourceRowsByTable[$key]
        $isUserTable = ($schemaName -eq 'public')
        $exists = $tableExists[$key]

        if (-not $exists) {
            $restoredRows = $null
            $match = ($sourceRows -eq 0)  # a nonexistent table with 0 source rows is not a discrepancy
        } else {
            $restoredRows = [int](Invoke-PsqlScalar "SELECT count(*) FROM $qualified;")
            $match = ($sourceRows -eq $restoredRows)
        }

        $tableResults += [ordered]@{
            schema = $schemaName
            table = $tableName
            isUserTable = $isUserTable
            sourceCopyRows = $sourceRows
            restoredRows = $restoredRows
            relationExists = $exists
            match = $match
        }
        if ($isUserTable -and -not $match) { $userTableMismatches += "$qualified (source=$sourceRows restored=$restoredRows exists=$exists)" }
    }
    $diag.tables = $tableResults
    Add-Step 'row_count_verification' $(if ($userTableMismatches.Count -eq 0) { 'PASS' } else { 'FAIL' }) "public-schema mismatches: $($userTableMismatches -join '; ')"
    if ($userTableMismatches.Count -gt 0) {
        $diag.failureReason = "source/restored row count mismatch on user table(s): $($userTableMismatches -join '; ')"
        $diag.failedStep = 'row_count_verification'
        throw $diag.failureReason
    }

    # =========================================================================
    # PHASE 8: constraint verification.
    # =========================================================================
    $fkCount = [int](Invoke-PsqlScalar "SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;")
    $diag.constraints.publicForeignKeyCount = $fkCount
    if ($fkCount -le 0) {
        $diag.failureReason = 'zero foreign key constraints found in public schema after restore'; $diag.failedStep = 'constraint_validation'; throw $diag.failureReason
    }

    $liveNotValidRaw = Invoke-PsqlScalar "SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint WHERE NOT convalidated;"
    $liveNotValid = @()
    if (-not [string]::IsNullOrWhiteSpace($liveNotValidRaw)) { $liveNotValid = @($liveNotValidRaw -split ',') }
    $diag.constraints.liveNotValid = $liveNotValid

    $unexpectedNotValid = @($liveNotValid | Where-Object { $sourceDeclaredNotValid -notcontains $_ })
    $diag.constraints.unexpectedNotValid = $unexpectedNotValid
    $diag.unexpectedInvalidConstraints = $unexpectedNotValid

    Add-Step 'constraint_validation' $(if ($unexpectedNotValid.Count -eq 0) { 'PASS' } else { 'FAIL' }) `
        "public FK count=$fkCount; live NOT VALID=[$($liveNotValid -join ', ')]; source-declared NOT VALID=[$($sourceDeclaredNotValid -join ', ')]; unexpected=[$($unexpectedNotValid -join ', ')]"
    if ($unexpectedNotValid.Count -gt 0) {
        $diag.failureReason = "unexpected NOT VALID constraint(s) not declared as such in source schema.sql: $($unexpectedNotValid -join ', ')"
        $diag.failedStep = 'constraint_validation'
        throw $diag.failureReason
    }

    # =========================================================================
    # PHASE 9: trigger verification.
    # =========================================================================
    $totalTriggers = [int](Invoke-PsqlScalar "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public';")
    $disabledRaw = Invoke-PsqlScalar "SELECT string_agg(t.tgname, ',') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND t.tgenabled='D';"
    $disabledNames = @()
    if (-not [string]::IsNullOrWhiteSpace($disabledRaw)) { $disabledNames = @($disabledRaw -split ',') }
    $diag.triggers.totalPublic = $totalTriggers
    $diag.triggers.disabledPublic = $disabledNames.Count
    $diag.triggers.disabledNames = $disabledNames
    Add-Step 'trigger_state' $(if ($disabledNames.Count -eq 0) { 'PASS' } else { 'FAIL' }) "public triggers total=$totalTriggers disabled=$($disabledNames.Count)"
    if ($disabledNames.Count -gt 0) {
        $diag.failureReason = "trigger(s) left disabled on public schema: $($disabledNames -join ', ')"; $diag.failedStep = 'trigger_state'; throw $diag.failureReason
    }

    # =========================================================================
    # PHASE 10: sample readability - technical query only, no data printed.
    # =========================================================================
    $sampleTables = @($KeyTables | Where-Object { $keyTablesDeclared[$_] })
    if ($sampleTables.Count -gt 0) {
        $unions = ($sampleTables | ForEach-Object { "SELECT (count(*) IS NOT NULL) AS ok FROM public.$_" }) -join ' UNION ALL '
        $sampleReadable = Invoke-PsqlScalar "SELECT bool_and(ok) FROM ($unions) s;"
        Add-Step 'sample_data_readable' $(if ($sampleReadable -eq 't') { 'PASS' } else { 'FAIL' }) "tables checked: $($sampleTables -join ', ')"
        if ($sampleReadable -ne 't') {
            $diag.failureReason = 'sample readability check failed on one or more key tables'; $diag.failedStep = 'sample_data_readable'; throw $diag.failureReason
        }
    }

    # =========================================================================
    # Every required gate explicitly passed - only now is PASS permitted.
    # =========================================================================
    $diag.overallStatus = 'PASS'
} catch {
    if (-not $diag.failureReason) { $diag.failureReason = $_.Exception.Message }
    if (-not $diag.failedStep) { $diag.failedStep = 'unknown' }
    $diag.overallStatus = 'FAIL'
    Write-Host "RESTORE VERIFICATION FAILED at $($diag.failedStep): $($diag.failureReason)"
} finally {
    # Write the report BEFORE cleanup so a report always exists even if
    # cleanup itself fails, then rewrite it after cleanup so the cleanup
    # field reflects what actually happened (per requirement).
    $reportPath = Write-Report
    $reportWritten = $true
    Invoke-Cleanup
    if ($diag.cleanup -ne 'PASS' -and $diag.overallStatus -eq 'PASS') {
        # Cleanup is one of the anti-false-positive gates: a PASS restore
        # with leftover disposable resources must not be reported as PASS.
        $diag.overallStatus = 'FAIL'
        $diag.failureReason = 'cleanup did not complete successfully (disposable container/volume/temp dir not fully removed)'
        $diag.failedStep = 'cleanup'
        Write-Host "RESTORE VERIFICATION FAILED at cleanup: $($diag.failureReason)"
    }
    $reportPath = Write-Report
}

if ($diag.overallStatus -eq 'PASS') {
    Write-Host 'RESTORE_VERIFICATION: PASS'
    Write-Host "Checksums: $($diag.checksumStatus)"
    Write-Host 'Schema restore: PASS'
    Write-Host 'Data restore: PASS'
    Write-Host 'Row counts: PASS'
    Write-Host 'Constraints: PASS'
    Write-Host 'Triggers: PASS'
    Write-Host "Cleanup: $($diag.cleanup)"
    Write-Host "Report: $reportPath"
    exit 0
} else {
    Write-Host 'RESTORE_VERIFICATION: FAIL'
    Write-Host "Failed step: $($diag.failedStep)"
    Write-Host "Reason: $($diag.failureReason)"
    Write-Host "Cleanup: $($diag.cleanup)"
    Write-Host "Report: $(if ($reportWritten) { $reportPath } else { '(not written)' })"
    exit 1
}
