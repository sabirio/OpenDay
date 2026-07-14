[CmdletBinding()]
param(
    [string]$BackupPath,
    [string]$RestorePostgresImage,
    [string]$ExecutorPostgresImage = 'postgres:17'
)

# Disposable-environment certification for the generalized manifest-driven
# migration executor (scripts/production-migration-apply.ps1 and
# scripts/lib/ManifestMigrationExecutor.ps1 / MigrationManifestValidator.ps1
# / SnagListMigrationContract.ps1). NEVER connects to production. Restores
# the same already-verified, owner-created production backup used by the
# prior review's rehearsal (schema/data fidelity, not credentials - the
# restore-verify.ps1 checksums already prove this backup is trustworthy) into
# THREE throwaway disposable Postgres containers in turn:
#
#   1. Happy path: preflight assertions (expect READY), apply the REAL
#      snag-list-030-034 manifest via Invoke-ManifestMigrationSequence
#      (the exact same function scripts/production-migration-apply.ps1
#      calls), postflight assertions (expect PASS), row-count preservation
#      on pre-existing tables, then a REPEAT preflight against the same
#      now-fully-applied database (expect NOT_READY / already applied, no
#      new container needed).
#   2. Failure injection: a fresh restore of the SAME baseline, then a
#      TEST-ONLY 4-file manifest (valid, valid, deliberately broken SQL,
#      valid) applied via the same function - proves the third migration's
#      failure stops the sequence with the third step FAIL, the fourth step
#      reported NOT_ATTEMPTED, AND the fourth migration's own database
#      object genuinely absent (not just missing from the log).
#   3. Partial state: a third fresh restore, only 030+031 applied (a
#      truncated 2-entry manifest), then preflight against the full 5-entry
#      manifest - proves partial presence is classified NOT_READY with a
#      drift/partial reason, never treated as resumable.
#
# Every container/volume/network created here is uniquely named and torn
# down in a `finally` block, success or failure.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $PSScriptRoot) { $PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $BackupPath) { $BackupPath = Join-Path $PSScriptRoot '..\backups\production\20260713T015801Z' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $PSScriptRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $PSScriptRoot 'lib\MigrationManifestValidator.ps1')
. (Join-Path $PSScriptRoot 'lib\ManifestMigrationExecutor.ps1')
. (Join-Path $PSScriptRoot 'lib\SnagListMigrationContract.ps1')

$BackupPath = (Resolve-Path -LiteralPath $BackupPath).Path
$manifestPath = Join-Path $repoRoot 'scripts\manifests\snag-list-030-034.psd1'

# Resolve the Postgres image the same way the prior review's rehearsal did:
# the currently-running local Supabase database container's own image,
# unless the caller pinned a specific one.
if (-not $RestorePostgresImage) {
    $sourceRuntimeInspect = Invoke-NativeTool docker @('inspect', 'supabase_db_weekly-tracker')
    if ($sourceRuntimeInspect.ExitCode -ne 0) { throw 'local Supabase runtime metadata is unavailable - is the local dev stack running?' }
    $sourceRuntime = (($sourceRuntimeInspect.Output -join "`n") | ConvertFrom-Json)[0]
    $RestorePostgresImage = [string]$sourceRuntime.Config.Image
}
$sourceRuntimeInspect2 = Invoke-NativeTool docker @('inspect', 'supabase_db_weekly-tracker')
$bootstrapScript = [string](((($sourceRuntimeInspect2.Output -join "`n") | ConvertFrom-Json)[0]).Config.Entrypoint[2])

$report = [ordered]@{
    startedAtUtc = [DateTime]::UtcNow.ToString('o')
    backupPath = $BackupPath
    restorePostgresImage = $RestorePostgresImage
    happyPath = $null
    failureInjection = $null
    partialState = $null
    overallStatus = 'FAIL'
}

# ---------------------------------------------------------------------------
# Restores the verified backup into a fresh, uniquely-named disposable
# container with a published (random) host port, so containers started by
# Invoke-ManifestMigrationSequence's own `docker run --network bridge ...`
# psql invocations can reach it via host.docker.internal:<port> - exactly
# the same network shape a real production connection has (host+port, not
# container-name resolution), so this exercises the real code path.
# ---------------------------------------------------------------------------
function New-DisposableRestoredContainer {
    param([string]$Label)

    $suffix = [guid]::NewGuid().ToString('N').Substring(0, 10)
    $container = "migexec-$Label-$suffix"
    $volume = "migexec-$Label-vol-$suffix"
    $temp = Join-Path ([IO.Path]::GetTempPath()) "migexec-$Label-$suffix"
    New-Item -ItemType Directory -Path $temp | Out-Null

    if ((Invoke-NativeTool docker @('volume', 'create', $volume)).ExitCode -ne 0) { throw 'volume create failed' }
    $backupMount = "type=bind,source=$BackupPath,target=/backup,readonly"
    $tempMount = "type=bind,source=$temp,target=/work,readonly"
    $pgPassword = [guid]::NewGuid().ToString('N')
    $env:PGPASSWORD = $pgPassword
    $env:POSTGRES_PASSWORD = $pgPassword
    $env:JWT_SECRET = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    $env:JWT_EXP = '3600'
    $run = Invoke-NativeTool docker @('run', '-d', '--name', $container, '-p', '127.0.0.1::5432', '-v', "${volume}:/var/lib/postgresql/data", '--mount', $backupMount, '--mount', $tempMount, '-e', 'PGPASSWORD', '-e', 'POSTGRES_PASSWORD', '-e', 'JWT_SECRET', '-e', 'JWT_EXP', '--entrypoint', 'sh', $RestorePostgresImage, '-c', $bootstrapScript)
    Remove-Item Env:PGPASSWORD, Env:POSTGRES_PASSWORD, Env:JWT_SECRET, Env:JWT_EXP -ErrorAction SilentlyContinue
    if ($run.ExitCode -ne 0) { throw 'container start failed' }

    $ready = $false; for ($i = 0; $i -lt 30; $i++) { if ((Invoke-NativeTool docker @('exec', $container, 'pg_isready', '-U', 'postgres')).ExitCode -eq 0) { $ready = $true; break }; Start-Sleep 1 }
    if (-not $ready) { throw 'container not ready' }
    $consecutive = 0; $stable = $false
    for ($i = 0; $i -lt 60; $i++) {
        $probe = Invoke-NativeTool docker @('exec', $container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', 'SELECT 1;')
        if ($probe.ExitCode -eq 0 -and ($probe.Output -join '') -match '1') { $consecutive++ } else { $consecutive = 0 }
        if ($consecutive -ge 5) { $stable = $true; break }
        Start-Sleep 1
    }
    if (-not $stable) { throw 'container did not reach a stable connectable state' }

    $portRaw = (Invoke-NativeTool docker @('port', $container, '5432/tcp')).Output -join ''
    if ($portRaw -notmatch ':(\d+)\s*$') { throw "could not resolve published host port from: $portRaw" }
    $hostPort = [int]$Matches[1]

    function Invoke-PsqlCommandWithConnectRetry([string]$Sql, [string]$User = 'postgres', [string[]]$ExtraArgs = @()) {
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $x = Invoke-NativeTool docker (@('exec', $container, 'psql', '-X', '-U', $User, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1') + $ExtraArgs + @('-c', $Sql))
            if ($x.ExitCode -eq 0) { return $x }
            $joined = "$($x.Output -join ' | ')"
            if ($joined -match 'database system is (shutting down|starting up)|connection to server on socket.*(No such file or directory|Connection refused)') { Start-Sleep 1; continue }
            return $x
        }
        return $x
    }
    function Invoke-PsqlFileWithConnectRetry([string]$RelativePath, [string]$User = 'supabase_admin') {
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            $x = Invoke-NativeTool docker @('exec', $container, 'psql', '-X', '-U', $User, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', "/work/$RelativePath")
            if ($x.ExitCode -eq 0) { return $x }
            $joined = $x.Output -join ' | '
            if ($joined -match 'database system is (shutting down|starting up)|connection to server on socket.*(No such file or directory|Connection refused)' -and $joined -notmatch 'ERROR:.*\n.*ERROR:') { Start-Sleep 1; continue }
            return $x
        }
        return $x
    }

    # Restore roles.sql (supabase_admin owns auth/storage; postgres does not -
    # same finding as the prior review's rehearsal).
    $rolesFiltered = Join-Path $temp 'roles.sql'
    $bootstrapRoleQuery = Invoke-PsqlCommandWithConnectRetry 'SELECT rolname FROM pg_roles ORDER BY rolname;' 'supabase_admin' @('-tA')
    if ($bootstrapRoleQuery.ExitCode -ne 0) { throw "bootstrap role inventory failed: $($bootstrapRoleQuery.Output -join ' | ')" }
    $bootstrapRoles = @((($bootstrapRoleQuery.Output -join "`n") -split "`r?`n") | Where-Object { $_ } | ForEach-Object { $_.Trim() })
    New-FilteredRolesFile -SourcePath (Join-Path $BackupPath 'roles.sql') -DestinationPath $rolesFiltered -BootstrapRoleNames $bootstrapRoles | Out-Null
    $bootstrapRoleSet = @{}; foreach ($role in $bootstrapRoles) { $bootstrapRoleSet[$role] = $true }
    $normalizedRoleLines = [IO.File]::ReadAllLines($rolesFiltered) | ForEach-Object {
        if ($_ -match '^ALTER ROLE\s+"?([^" ]+)"?\s+' -and $bootstrapRoleSet.ContainsKey($Matches[1])) { "-- cert: existing bootstrap role attributes retained -- $_" }
        elseif ($_ -match '^GRANT\s+"?([^" ]+)"?\s+TO\s+"?([^" ,;]+)"?' -and $bootstrapRoleSet.ContainsKey($Matches[1]) -and $bootstrapRoleSet.ContainsKey($Matches[2])) { "-- cert: existing bootstrap membership retained -- $_" }
        else { $_ }
    }
    $skipPattern = '^(CREATE ROLE\s+(supabase_[a-z_]+);|ALTER ROLE\s+(supabase_[a-z_]+)\s|GRANT\s+(supabase_[a-z_]+)\s+TO|GRANT\s+\S+\s+TO\s+(supabase_[a-z_]+)\b)'
    $normalizedRoleLines = $normalizedRoleLines | ForEach-Object {
        if ($_ -match $skipPattern) { "-- cert: supabase_* internal service role reserved by this image build -- $_" } else { $_ }
    }
    [IO.File]::WriteAllLines($rolesFiltered, $normalizedRoleLines, [Text.UTF8Encoding]::new($false))
    $rolesResult = Invoke-PsqlFileWithConnectRetry 'roles.sql'
    if ($rolesResult.ExitCode -ne 0) { throw "restore roles.sql failed: $($rolesResult.Output -join ' | ')" }

    # Restore schema.sql: public-schema DDL only trusted to be authoritative;
    # platform-internal schemas (auth/storage/etc.) already carry this
    # image's own bootstrap - tolerated, not fatal, unless the error touches
    # `public.`.
    $schemaFiltered = Join-Path $temp 'schema.sql'
    Copy-Item -LiteralPath (Join-Path $BackupPath 'schema.sql') -Destination $schemaFiltered
    $existingSchemasRaw = Invoke-PsqlCommandWithConnectRetry 'SELECT nspname FROM pg_namespace;' 'supabase_admin' @('-tA')
    $existingSchemas = @{}; foreach ($s in ($existingSchemasRaw.Output -join "`n") -split "`r?`n") { if ($s) { $existingSchemas[$s.Trim()] = $true } }
    $schemaFilteredLines = [IO.File]::ReadAllLines($schemaFiltered) | ForEach-Object {
        $line = $_
        if ($line -match '^CREATE SCHEMA (\S+);' -and $existingSchemas.ContainsKey($Matches[1])) { "-- cert: schema $($Matches[1]) already bootstrapped -- $line" } else { $line }
    }
    [IO.File]::WriteAllLines($schemaFiltered, $schemaFilteredLines, [Text.UTF8Encoding]::new($false))

    $fixAuthUid = Invoke-PsqlCommandWithConnectRetry @"
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS `$`$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
`$`$;
"@ 'supabase_admin'
    # (applied again below, AFTER schema.sql restore, since schema.sql's own
    # plain CREATE FUNCTION for auth.uid() silently no-ops under tolerant
    # restore and would otherwise leave this image's bootstrap version active)

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $schemaResult = Invoke-NativeTool docker @('exec', $container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=0', '--echo-errors', '-f', '/work/schema.sql')
        $joined = $schemaResult.Output -join "`n"
        if ($joined -match 'database system is (shutting down|starting up)|connection to server on socket.*(No such file or directory|Connection refused)' -and $schemaResult.Output.Count -lt 20) { Start-Sleep 1; continue }
        break
    }
    $schemaErrorLines = @($schemaResult.Output | ForEach-Object { "$_" } | Where-Object { $_ -match 'ERROR:' })
    $publicSchemaErrors = @($schemaErrorLines | Where-Object { $_ -match '\bpublic\.' })
    if ($publicSchemaErrors.Count -gt 0) { throw "restore schema.sql produced errors touching the public schema: $($publicSchemaErrors -join ' | ')" }

    $fixAuthUid = Invoke-PsqlCommandWithConnectRetry @"
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS `$`$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
`$`$;
"@ 'supabase_admin'
    if ($fixAuthUid.ExitCode -ne 0) { throw "re-applying production auth.uid() failed: $($fixAuthUid.Output -join ' | ')" }

    # Migrations 033/034 INSERT INTO storage.buckets and CREATE POLICY ON
    # storage.objects as `postgres` - the same role name real production's
    # apply scripts (028/029) already connect as via the pooler username.
    # This bare bootstrap's `postgres` role has narrower default grants than
    # real production's provisioned `postgres` role does (schema-level
    # CREATE covers new objects; storage.buckets/objects already exist from
    # this image's own bootstrap and need their own table-level grant) - a
    # disposable-environment-only gap, not a migration or executor defect.
    $grantStorage = Invoke-PsqlCommandWithConnectRetry 'GRANT ALL PRIVILEGES ON SCHEMA storage TO postgres; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA storage TO postgres; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA storage TO postgres;' 'supabase_admin'
    if ($grantStorage.ExitCode -ne 0) { throw "granting postgres rights on storage schema failed: $($grantStorage.Output -join ' | ')" }

    # Restore data.sql: public-schema row data only.
    $relations = Invoke-NativeTool docker @('exec', $container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', "SELECT n.nspname||'.'||c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p');")
    if ($relations.ExitCode -ne 0) { throw 'restored relation inventory failed' }
    $liveRelations = @{}; foreach ($relation in $relations.Output) { if ($relation) { $liveRelations[$relation.Trim()] = $true } }
    $dataFiltered = Join-Path $temp 'data.sql'
    $existing = @{}
    foreach ($block in (Get-CopyBlockInventory -Path (Join-Path $BackupPath 'data.sql'))) {
        $ref = ConvertTo-NormalizedTableRef $block.Ref
        $key = "$($ref.Schema).$($ref.Table)"
        $existing[$key] = ($ref.Schema -eq 'public') -and $liveRelations.ContainsKey($key)
    }
    New-FilteredDataFile -SourcePath (Join-Path $BackupPath 'data.sql') -DestinationPath $dataFiltered -TableExists $existing | Out-Null
    $dataResult = Invoke-NativeTool docker @('exec', $container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=0', '--echo-errors', '-c', 'SET session_replication_role=replica;', '-f', '/work/data.sql', '-c', 'SET session_replication_role=origin;')
    $dataErrorLines = @($dataResult.Output | ForEach-Object { "$_" } | Where-Object { $_ -match 'ERROR:' })
    $publicDataErrors = @($dataErrorLines | Where-Object { $_ -match '\bpublic\.' })
    if ($publicDataErrors.Count -gt 0) { throw "data restore produced errors touching the public schema: $($publicDataErrors -join ' | ')" }

    return [pscustomobject]@{
        Container = $container
        Volume = $volume
        Temp = $temp
        HostPort = $hostPort
        Connection = [pscustomobject]@{ Host = 'host.docker.internal'; Port = $hostPort; Database = 'postgres'; User = 'postgres'; Password = $pgPassword; SslMode = 'disable' }
    }
}

function Remove-DisposableRestoredContainer {
    param($Disposable)
    try { Invoke-NativeTool docker @('rm', '-f', $Disposable.Container) | Out-Null } catch {}
    try { Invoke-NativeTool docker @('volume', 'rm', $Disposable.Volume) | Out-Null } catch {}
    try { if (Test-Path -LiteralPath $Disposable.Temp) { Remove-Item -LiteralPath $Disposable.Temp -Recurse -Force } } catch {}
    $containerGone = -not ((Invoke-NativeTool docker @('ps', '-a', '--filter', "name=$($Disposable.Container)", '--format', '{{.Names}}')).Output -join '')
    $volumeGone = -not ((Invoke-NativeTool docker @('volume', 'ls', '--filter', "name=$($Disposable.Volume)", '--format', '{{.Name}}')).Output -join '')
    return ($containerGone -and $volumeGone)
}

function Invoke-DockerCatalogQuery {
    param($Disposable, [string]$Sql)
    $x = Invoke-NativeTool docker @('exec', $Disposable.Container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', $Sql)
    if ($x.ExitCode -ne 0) { throw "catalog query failed: $($x.Output -join ' | ')" }
    return ($x.Output -join "`n")
}

# =====================================================================
# 1. HAPPY PATH
# =====================================================================
Write-Host '=== HAPPY PATH: restore -> preflight(READY) -> apply 030-034 -> postflight(PASS) ==='
$happy = [ordered]@{ status = 'FAIL'; preflight = $null; execution = $null; postflight = $null; rowPreservation = $null; repeatState = $null; cleanup = $null }
$disposable1 = $null
try {
    $disposable1 = New-DisposableRestoredContainer -Label 'happy'

    $preRowsRaw = Invoke-DockerCatalogQuery $disposable1 "SELECT relname||'|'||(xpath('/row/c/text()',query_to_xml(format('SELECT count(*) AS c FROM public.%I',relname),false,true,'')))[1]::text FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r' ORDER BY relname;"
    $preRows = [ordered]@{}
    foreach ($line in ($preRowsRaw -split "`r?`n")) { if ($line -and $line.Contains('|')) { $parts = $line.Split('|', 2); $preRows[$parts[0]] = $parts[1] } }

    $queryFn = { param([string]$Sql) return Invoke-DockerCatalogQuery $disposable1 $Sql }
    $preflight = Test-SnagListPreflightAssertions -Query $queryFn -BatchId 'SNAG-LIST-030-034'
    $happy.preflight = $preflight
    if ($preflight.status -ne 'READY_FOR_SNAG-LIST-030-034') { throw "preflight did not report READY: $($preflight | ConvertTo-Json -Depth 5)" }
    Write-Host 'Preflight: READY_FOR_SNAG-LIST-030-034 (PASS)'

    $manifest = Import-MigrationManifest -Path $manifestPath
    $checksums = Test-ManifestMigrationChecksums -Manifest $manifest -RepoRoot $repoRoot
    $execution = Invoke-ManifestMigrationSequence -Manifest $manifest -ChecksumResults $checksums -PgConnection $disposable1.Connection -PostgresImage $ExecutorPostgresImage
    $happy.execution = $execution
    if ($execution.overallStatus -ne 'PASS') { throw "migration sequence did not PASS: $($execution | ConvertTo-Json -Depth 5)" }
    foreach ($step in $execution.steps) { Write-Host "  $($step.file): $($step.status) ($($step.durationSeconds)s)" }

    $postflight = Test-SnagListPostflightAssertions -Query $queryFn
    $happy.postflight = $postflight
    if ($postflight.status -ne 'PASS') { throw "postflight did not PASS: $($postflight | ConvertTo-Json -Depth 5)" }
    Write-Host 'Postflight: PASS'

    $postRowsRaw = Invoke-DockerCatalogQuery $disposable1 ("SELECT relname||'|'||(xpath('/row/c/text()',query_to_xml(format('SELECT count(*) AS c FROM public.%I',relname),false,true,'')))[1]::text FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relkind='r' AND relname IN (" + (($preRows.Keys | ForEach-Object { "'$_'" }) -join ',') + ") ORDER BY relname;")
    $postRows = [ordered]@{}
    foreach ($line in ($postRowsRaw -split "`r?`n")) { if ($line -and $line.Contains('|')) { $parts = $line.Split('|', 2); $postRows[$parts[0]] = $parts[1] } }
    $diffs = @()
    foreach ($k in $preRows.Keys) { if ($postRows[$k] -ne $preRows[$k]) { $diffs += "${k}: before=$($preRows[$k]) after=$($postRows[$k])" } }
    $happy.rowPreservation = [ordered]@{ preRows = $preRows; postRows = $postRows; unexpectedDifferences = $diffs }
    if ($diffs.Count -gt 0) { throw "unexpected row count differences: $($diffs -join '; ')" }
    Write-Host "Row preservation: PASS (0/$($preRows.Count) unexpected differences)"

    # 7.4 Repeat state: re-run preflight against this SAME now-fully-applied
    # disposable database (no new container - proves the live query path,
    # not just the mocked unit test). Expected: NOT_READY, "already exists",
    # no re-execution attempted.
    $repeatPreflight = Test-SnagListPreflightAssertions -Query $queryFn -BatchId 'SNAG-LIST-030-034'
    $happy.repeatState = $repeatPreflight
    $repeatOk = ($repeatPreflight.status -eq 'NOT_READY') -and (@($repeatPreflight.reasons | Where-Object { $_ -match 'already exists' }).Count -gt 0)
    if (-not $repeatOk) { throw "repeat-state preflight did not report the expected blocked/already-applied state: $($repeatPreflight | ConvertTo-Json -Depth 5)" }
    Write-Host 'Repeat state (live): NOT_READY / already exists - PASS (no re-execution attempted)'

    $happy.status = 'PASS'
} catch {
    $happy.status = 'FAIL'
    $happy.error = $_.Exception.Message
    Write-Host "HAPPY PATH FAILED: $($_.Exception.Message)"
} finally {
    if ($disposable1) { $happy.cleanup = if (Remove-DisposableRestoredContainer -Disposable $disposable1) { 'PASS' } else { 'FAIL' } }
}
$report.happyPath = $happy

# =====================================================================
# 2. FAILURE INJECTION: broken SQL mid-sequence, stop-on-first-failure
# =====================================================================
Write-Host ''
Write-Host '=== FAILURE INJECTION: 4-file test-only manifest, 3rd file deliberately broken, 4th file MUST_NOT_RUN ==='
$injection = [ordered]@{ status = 'FAIL'; execution = $null; dbSideEffects = $null; cleanup = $null }
$disposable2 = $null
$testMigrationsDir = Join-Path ([IO.Path]::GetTempPath()) "migexec-failtest-$([guid]::NewGuid().ToString('N').Substring(0,8))"
try {
    New-Item -ItemType Directory -Path $testMigrationsDir | Out-Null
    $file1 = '900_hardening_step_001.sql'; $file2 = '901_hardening_step_002.sql'; $file3 = '902_hardening_step_003_broken.sql'; $file4 = '903_hardening_step_004.sql'
    Set-Content -LiteralPath (Join-Path $testMigrationsDir $file1) -Value "CREATE TABLE public.hardening_step_001(id int);" -Encoding utf8 -NoNewline
    Set-Content -LiteralPath (Join-Path $testMigrationsDir $file2) -Value "CREATE TABLE public.hardening_step_002(id int);" -Encoding utf8 -NoNewline
    Set-Content -LiteralPath (Join-Path $testMigrationsDir $file3) -Value "SELECT this is not valid sql;" -Encoding utf8 -NoNewline
    Set-Content -LiteralPath (Join-Path $testMigrationsDir $file4) -Value "CREATE TABLE public.hardening_step_004(id int);" -Encoding utf8 -NoNewline

    $testManifest = @{
        schemaVersion = 1; batchId = 'TEST-FAILURE-INJECTION'; approvedProjectRef = 'szgbkeqornkdngoegyso'
        authoritativeCommit = (git -C $repoRoot rev-parse HEAD).Trim()
        migrationsDirectory = '.'; contiguousSequence = $true
        migrations = @(
            @{ number = 900; file = $file1; sha256 = (Get-FileHash -LiteralPath (Join-Path $testMigrationsDir $file1) -Algorithm SHA256).Hash.ToLowerInvariant() },
            @{ number = 901; file = $file2; sha256 = (Get-FileHash -LiteralPath (Join-Path $testMigrationsDir $file2) -Algorithm SHA256).Hash.ToLowerInvariant() },
            @{ number = 902; file = $file3; sha256 = (Get-FileHash -LiteralPath (Join-Path $testMigrationsDir $file3) -Algorithm SHA256).Hash.ToLowerInvariant() },
            @{ number = 903; file = $file4; sha256 = (Get-FileHash -LiteralPath (Join-Path $testMigrationsDir $file4) -Algorithm SHA256).Hash.ToLowerInvariant() }
        )
    }
    Test-ManifestMigrationOrder -Manifest $testManifest | Out-Null
    $testChecksums = Test-ManifestMigrationChecksums -Manifest $testManifest -RepoRoot $testMigrationsDir

    $disposable2 = New-DisposableRestoredContainer -Label 'failinj'
    $execution = Invoke-ManifestMigrationSequence -Manifest $testManifest -ChecksumResults $testChecksums -PgConnection $disposable2.Connection -PostgresImage $ExecutorPostgresImage
    $injection.execution = $execution
    foreach ($step in $execution.steps) { Write-Host "  $($step.file): $($step.status)" }

    $step1 = $execution.steps[0]; $step2 = $execution.steps[1]; $step3 = $execution.steps[2]; $step4 = $execution.steps[3]
    $ok = ($execution.overallStatus -eq 'FAIL') -and ($step1.status -eq 'PASS') -and ($step2.status -eq 'PASS') -and ($step3.status -eq 'FAIL') -and ($step4.status -eq 'NOT_ATTEMPTED') -and ($execution.failedAt -eq $file3)
    if (-not $ok) { throw "stop-on-first-failure not proven (H-03): $($execution | ConvertTo-Json -Depth 5)" }
    Write-Host 'H-03 (evidence): PASS - 001 PASS, 002 PASS, 003 FAIL, 004 NOT_ATTEMPTED'

    $marker1 = (Invoke-DockerCatalogQuery $disposable2 "SELECT to_regclass('public.hardening_step_001') IS NOT NULL;").Trim()
    $marker2 = (Invoke-DockerCatalogQuery $disposable2 "SELECT to_regclass('public.hardening_step_002') IS NOT NULL;").Trim()
    $marker4 = (Invoke-DockerCatalogQuery $disposable2 "SELECT to_regclass('public.hardening_step_004') IS NOT NULL;").Trim()
    $injection.dbSideEffects = [ordered]@{ hardening_step_001_exists = $marker1; hardening_step_002_exists = $marker2; hardening_step_004_exists = $marker4 }
    if ($marker1 -ne 't' -or $marker2 -ne 't') { throw "expected the two successful migrations to have applied their tables (step001=$marker1 step002=$marker2)" }
    if ($marker4 -eq 't') { throw "H-04 VIOLATION: hardening_step_004 exists in the database even though its migration was reported NOT_ATTEMPTED - step 4 must never have run" }
    Write-Host "H-04 (DB side effect): PASS - hardening_step_001 exists, hardening_step_002 exists, hardening_step_004 absent (marker4=$marker4)"

    $exitCodeOk = ($execution.overallStatus -eq 'FAIL')
    Write-Host "H-05 (non-zero outcome recorded): $(if ($exitCodeOk) { 'PASS' } else { 'FAIL' })"
    if (-not $exitCodeOk) { throw 'H-05 not proven: overallStatus was not FAIL' }

    Write-Host 'Stop-on-first-failure: PASS (steps 1-2 applied, step 3 failed, step 4 never attempted and has no database side effect)'

    $injection.status = 'PASS'
} catch {
    $injection.status = 'FAIL'
    $injection.error = $_.Exception.Message
    Write-Host "FAILURE INJECTION TEST FAILED: $($_.Exception.Message)"
} finally {
    if ($disposable2) { $injection.cleanup = if (Remove-DisposableRestoredContainer -Disposable $disposable2) { 'PASS' } else { 'FAIL' } }
    if (Test-Path -LiteralPath $testMigrationsDir) { Remove-Item -LiteralPath $testMigrationsDir -Recurse -Force -ErrorAction SilentlyContinue }
}
$report.failureInjection = $injection

# =====================================================================
# 3. PARTIAL STATE: only 030+031 applied, preflight against the full batch
# =====================================================================
Write-Host ''
Write-Host '=== PARTIAL STATE: 030+031 applied, 032-034 absent - preflight must classify as NOT_READY ==='
$partial = [ordered]@{ status = 'FAIL'; preflight = $null; cleanup = $null }
$disposable3 = $null
try {
    $disposable3 = New-DisposableRestoredContainer -Label 'partial'
    $fullManifest = Import-MigrationManifest -Path $manifestPath
    $partialManifest = $fullManifest.Clone()
    $partialManifest.migrations = @($fullManifest.migrations[0], $fullManifest.migrations[1])
    $partialChecksums = Test-ManifestMigrationChecksums -Manifest $partialManifest -RepoRoot $repoRoot
    $partialExecution = Invoke-ManifestMigrationSequence -Manifest $partialManifest -ChecksumResults $partialChecksums -PgConnection $disposable3.Connection -PostgresImage $ExecutorPostgresImage
    if ($partialExecution.overallStatus -ne 'PASS') { throw "could not establish the partial baseline (030+031 apply failed): $($partialExecution | ConvertTo-Json -Depth 5)" }
    Write-Host '030+031 applied (baseline for partial-state test)'

    $partialQueryFn = { param([string]$Sql) return Invoke-DockerCatalogQuery $disposable3 $Sql }
    $partialPreflight = Test-SnagListPreflightAssertions -Query $partialQueryFn -BatchId 'SNAG-LIST-030-034'
    $partial.preflight = $partialPreflight
    $partialOk = ($partialPreflight.status -eq 'NOT_READY') -and (@($partialPreflight.reasons | Where-Object { $_ -match 'partial|drift' }).Count -gt 0)
    if (-not $partialOk) { throw "partial-state preflight did not report the expected blocked/partial-drift state: $($partialPreflight | ConvertTo-Json -Depth 5)" }
    Write-Host "Partial state (live): NOT_READY / partial drift - PASS (forensic review required, no automatic resume)"

    $partial.status = 'PASS'
} catch {
    $partial.status = 'FAIL'
    $partial.error = $_.Exception.Message
    Write-Host "PARTIAL STATE TEST FAILED: $($_.Exception.Message)"
} finally {
    if ($disposable3) { $partial.cleanup = if (Remove-DisposableRestoredContainer -Disposable $disposable3) { 'PASS' } else { 'FAIL' } }
}
$report.partialState = $partial

$report.completedAtUtc = [DateTime]::UtcNow.ToString('o')
$report.overallStatus = if ($happy.status -eq 'PASS' -and $injection.status -eq 'PASS' -and $partial.status -eq 'PASS') { 'PASS' } else { 'FAIL' }

$reportDir = Join-Path $PSScriptRoot '..\work\production-migration-executor-certification'
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
$reportPath = Join-Path $reportDir "certification-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')).json"
$json = $report | ConvertTo-Json -Depth 12
Assert-NoSecretLeak -Text $json | Out-Null
$tempOutput = "$reportPath.tmp-$([guid]::NewGuid().ToString('N'))"
Write-Utf8NoBom -Path $tempOutput -Value $json
Move-Item -LiteralPath $tempOutput -Destination $reportPath -Force

Write-Host ''
Write-Host "DISPOSABLE_CERTIFICATION: $($report.overallStatus)"
Write-Host "Report: $reportPath"
if ($report.overallStatus -eq 'PASS') { exit 0 } else { exit 1 }
