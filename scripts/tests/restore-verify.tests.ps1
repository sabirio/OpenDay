# Offline/static tests for scripts/restore-verify.ps1 and its shared helpers.
# No Docker, no production access, no network. Safe to run anywhere.
#
# Plain assertion script (project has no Pester dependency) - run with:
#   powershell -File scripts\tests\restore-verify.tests.ps1
# Exits 0 if every assertion passes, 1 otherwise.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptPath = Join-Path $repoRoot 'scripts\restore-verify.ps1'
$bindingHelperPath = Join-Path $repoRoot 'scripts\lib\BackupReleaseBinding.ps1'
$expectedCommit = (& git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
$expectedManifestHash = (Get-FileHash (Join-Path $repoRoot 'scripts\manifests\snag-list-030-035.psd1') -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedScriptHash = (Get-FileHash (Join-Path $repoRoot 'scripts\production-backup.ps1') -Algorithm SHA256).Hash.ToLowerInvariant()
$releaseArgs = @{ExpectedSourceCommit=$expectedCommit;ExpectedReleaseManifestSha256=$expectedManifestHash;ExpectedBackupScriptSha256=$expectedScriptHash}
$libPath = Join-Path $repoRoot 'scripts\lib\RestoreVerifyHelpers.ps1'

$script:passCount = 0
$script:failCount = 0
$script:failures = @()

$scriptText = Get-Content -LiteralPath $scriptPath -Raw

function Assert-True {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')
    if ($Condition) {
        $script:passCount++
        Write-Host "[PASS] $Name"
    } else {
        $script:failCount++
        $script:failures += $Name
        Write-Host "[FAIL] $Name $(if ($Detail) { "- $Detail" })"
    }
}

function Assert-Throws {
    param([string]$Name, [scriptblock]$Block, [string]$MatchPattern = $null)
    try {
        & $Block
        Assert-True $Name $false 'expected an exception, none was thrown'
    } catch {
        if ($MatchPattern -and $_.Exception.Message -notmatch $MatchPattern) {
            Assert-True $Name $false "threw, but message '$($_.Exception.Message)' did not match /$MatchPattern/"
        } else {
            Assert-True $Name $true
        }
    }
}

Assert-True 'PS5 compatibility: BackupRoot default is not evaluated inside param() using PSScriptRoot' ($scriptText -notmatch '\[string\]\$BackupRoot\s*=\s*\(Join-Path\s+\$PSScriptRoot')
Assert-True 'PS5 compatibility: BackupRoot default is resolved in the script body' ($scriptText -match 'if \(-not \$BackupRoot\)[\s\S]*?\$BackupRoot\s*=\s*Join-Path\s+\$PSScriptRoot')

# ===========================================================================
# 1. PowerShell AST parse
# ===========================================================================
foreach ($p in @($scriptPath, $libPath)) {
    $tokens = $null; $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$tokens, [ref]$parseErrors)
    Assert-True "AST parse: $(Split-Path -Leaf $p)" ($parseErrors.Count -eq 0) (($parseErrors | ForEach-Object { $_.Message }) -join '; ')
}

# ===========================================================================
# 2. No -Encoding utf8NoBOM anywhere (PowerShell 5.1 incompatible)
# ===========================================================================
$scriptText = Get-Content -LiteralPath $scriptPath -Raw
$libText = Get-Content -LiteralPath $libPath -Raw
Assert-True 'no -Encoding utf8NoBOM in restore-verify.ps1' ($scriptText -notmatch 'Encoding\s+utf8NoBOM')
Assert-True 'no -Encoding utf8NoBOM in RestoreVerifyHelpers.ps1' ($libText -notmatch 'Encoding\s+utf8NoBOM')
Assert-True 'no PS7-only ?? operator' ($scriptText -notmatch '(?<!\?)\?\?(?!\?)' -and $libText -notmatch '\?\?')
Assert-True 'no PS7-only ?. operator' ($scriptText -notmatch '\?\.' -and $libText -notmatch '\?\.')
Assert-True 'no reliance on $PSNativeCommandUseErrorActionPreference' ($scriptText -notmatch 'PSNativeCommandUseErrorActionPreference' -and $libText -notmatch 'PSNativeCommandUseErrorActionPreference')

# Load the pure helper functions for direct unit testing. This file has no
# top-level executable side effects (Docker, network, param validation).
. $libPath
. $bindingHelperPath

# ===========================================================================
# 3. UTF-8 no-BOM helper
# ===========================================================================
$tmpFile = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-test-$([guid]::NewGuid().ToString('N')).txt"
try {
    Write-Utf8NoBom -Path $tmpFile -Value "line one`nline two`n"
    $bytes = [System.IO.File]::ReadAllBytes($tmpFile)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    Assert-True 'Write-Utf8NoBom produces no BOM' (-not $hasBom)
    $roundTrip = [System.IO.File]::ReadAllText($tmpFile, [System.Text.Encoding]::UTF8)
    Assert-True 'Write-Utf8NoBom content round-trips exactly' ($roundTrip -eq "line one`nline two`n")
} finally {
    Remove-Item -LiteralPath $tmpFile -ErrorAction SilentlyContinue
}

# ===========================================================================
# 4. COPY row parser
# ===========================================================================
function New-TempSqlFile([string]$Content) {
    $p = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-copytest-$([guid]::NewGuid().ToString('N')).sql"
    [System.IO.File]::WriteAllText($p, $Content, [System.Text.UTF8Encoding]::new($false))
    return $p
}

# 4a. empty COPY block
$p = New-TempSqlFile "COPY public.empty_table (id) FROM stdin;`n\.`n"
try {
    $blocks = Get-CopyBlockInventory -Path $p
    Assert-True 'COPY parser: empty block -> 0 rows' ($blocks.Count -eq 1 -and $blocks[0].Rows -eq 0)
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4b. one block with data
$p = New-TempSqlFile "COPY public.one_table (id, name) FROM stdin;`n1`tAlice`n2`tBob`n3`tCarol`n\.`n"
try {
    $blocks = Get-CopyBlockInventory -Path $p
    Assert-True 'COPY parser: one block with 3 rows' ($blocks.Count -eq 1 -and $blocks[0].Rows -eq 3 -and $blocks[0].Ref -eq 'public.one_table')
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4c. multiple tables
$p = New-TempSqlFile @"
COPY public.a (id) FROM stdin;
1
2
\.
COPY public.b (id) FROM stdin;
\.
COPY auth.users (id) FROM stdin;
u1
u2
u3
u4
\.
"@
try {
    $blocks = Get-CopyBlockInventory -Path $p
    Assert-True 'COPY parser: multiple tables count' ($blocks.Count -eq 3)
    Assert-True 'COPY parser: public.a has 2 rows' (($blocks | Where-Object { $_.Ref -eq 'public.a' }).Rows -eq 2)
    Assert-True 'COPY parser: public.b has 0 rows' (($blocks | Where-Object { $_.Ref -eq 'public.b' }).Rows -eq 0)
    Assert-True 'COPY parser: auth.users has 4 rows' (($blocks | Where-Object { $_.Ref -eq 'auth.users' }).Rows -eq 4)
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4d. quoted schema/table identifiers
$p = New-TempSqlFile "COPY `"public`".`"Weird Table`" (id) FROM stdin;`n1`n2`n\.`n"
try {
    $blocks = Get-CopyBlockInventory -Path $p
    Assert-True 'COPY parser: quoted identifiers parsed' ($blocks.Count -eq 1 -and $blocks[0].Rows -eq 2)
    $ref = ConvertTo-NormalizedTableRef $blocks[0].Ref
    Assert-True 'normalize: quoted table preserves case' ($ref.Schema -eq 'public' -and $ref.Table -eq 'Weird Table')
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4e. rows with escape sequences (tabs/newlines encoded as \t \n, not raw)
$p = New-TempSqlFile "COPY public.esc (id, note) FROM stdin;`n1`tline1\nline2`n2`tcol1\tcol2literal`n\.`n"
try {
    $blocks = Get-CopyBlockInventory -Path $p
    Assert-True 'COPY parser: escaped-content rows still counted as 1 row each' ($blocks[0].Rows -eq 2)
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4f. malformed/incomplete COPY block -> error
$p = New-TempSqlFile "COPY public.incomplete (id) FROM stdin;`n1`n2`n"
try {
    Assert-Throws 'COPY parser: unterminated block throws' { Get-CopyBlockInventory -Path $p } 'unterminated'
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# 4g. unrecognized COPY-like line -> explicit error, not silent skip
$p = New-TempSqlFile "COPY public.bad_format id FROM stdin;`n1`n\.`n"
try {
    Assert-Throws 'COPY parser: unrecognized format throws (not silently skipped)' { Get-CopyBlockInventory -Path $p } 'unrecognized'
} finally { Remove-Item -LiteralPath $p -ErrorAction SilentlyContinue }

# ===========================================================================
# 4h. New-FilteredRolesFile - only the bootstrap-conflicting CREATE ROLE
# line is dropped; ALTER ROLE / GRANT / other CREATE ROLE lines are kept.
# ===========================================================================
$srcRoles = New-TempSqlFile @"
CREATE ROLE anon;
ALTER ROLE anon WITH NOLOGIN;
CREATE ROLE postgres;
ALTER ROLE postgres WITH NOSUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;
GRANT anon TO authenticator WITH INHERIT FALSE GRANTED BY supabase_admin;
GRANT anon TO postgres WITH ADMIN OPTION, INHERIT TRUE GRANTED BY supabase_admin;
"@
$destRoles = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-rolesfiltered-$([guid]::NewGuid().ToString('N')).sql"
try {
    $filtered = New-FilteredRolesFile -SourcePath $srcRoles -DestinationPath $destRoles -BootstrapRoleNames @('postgres')
    Assert-True 'roles filter: four statements filtered (CREATE + NOSUPERUSER ALTER + 2x GRANTED BY)' ($filtered.Count -eq 4)
    $destText = Get-Content -LiteralPath $destRoles -Raw
    Assert-True 'roles filter: CREATE ROLE postgres removed as live statement' ($destText -notmatch '(?m)^CREATE ROLE postgres;\s*$')
    Assert-True 'roles filter: CREATE ROLE anon kept' ($destText -match '(?m)^CREATE ROLE anon;\s*$')
    Assert-True 'roles filter: NOSUPERUSER token stripped from postgres ALTER (as a live statement, not just in the explanatory comment)' ($destText -notmatch '(?m)^ALTER ROLE postgres WITH NOSUPERUSER')
    Assert-True 'roles filter: other attributes on that ALTER line survive' ($destText -match '(?m)^ALTER ROLE postgres WITH INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS;\s*$')
    Assert-True 'roles filter: GRANTED BY clause removed as live statement' ($destText -notmatch '(?m)^GRANT .* GRANTED BY')
    Assert-True 'roles filter: GRANT anon TO authenticator edge + options preserved' ($destText -match '(?m)^GRANT anon TO authenticator WITH INHERIT FALSE;\s*$')
    Assert-True 'roles filter: GRANT anon TO postgres edge + ADMIN OPTION preserved' ($destText -match '(?m)^GRANT anon TO postgres WITH ADMIN OPTION, INHERIT TRUE;\s*$')
} finally {
    Remove-Item -LiteralPath $srcRoles, $destRoles -ErrorAction SilentlyContinue
}

# ===========================================================================
# 4i. Get-RoleMembershipEdges - parses expected edges + WITH options from
# the SOURCE (unfiltered) roles.sql.
# ===========================================================================
$srcRoles2 = New-TempSqlFile @"
GRANT anon TO authenticator WITH INHERIT FALSE GRANTED BY supabase_admin;
GRANT anon TO postgres WITH ADMIN OPTION, INHERIT TRUE GRANTED BY supabase_admin;
GRANT supabase_privileged_role TO postgres WITH INHERIT TRUE GRANTED BY supabase_admin;
"@
try {
    $edges = Get-RoleMembershipEdges -Path $srcRoles2
    Assert-True 'membership edges: 3 edges parsed' ($edges.Count -eq 3)
    $e1 = $edges | Where-Object { $_.Role -eq 'anon' -and $_.Member -eq 'authenticator' }
    Assert-True 'membership edges: anon->authenticator adminOption=false' ($e1.AdminOption -eq $false)
    Assert-True 'membership edges: anon->authenticator inheritOption=false' ($e1.InheritOption -eq $false)
    $e2 = $edges | Where-Object { $_.Role -eq 'anon' -and $_.Member -eq 'postgres' }
    Assert-True 'membership edges: anon->postgres adminOption=true' ($e2.AdminOption -eq $true)
    Assert-True 'membership edges: anon->postgres inheritOption=true' ($e2.InheritOption -eq $true)
} finally {
    Remove-Item -LiteralPath $srcRoles2 -ErrorAction SilentlyContinue
}

# ===========================================================================
# 4j. New-FilteredSchemaFile / New-FilteredDataFile - single-result case
# (regression guard: a 1-element filtered/skipped list must not silently
# unwrap to a scalar and break every .Count caller).
# ===========================================================================
$srcSchema = New-TempSqlFile @"
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';
CREATE TABLE public.projects (id bigint);
"@
$destSchema = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-schemafiltered-$([guid]::NewGuid().ToString('N')).sql"
try {
    $filteredExt = New-FilteredSchemaFile -SourcePath $srcSchema -DestinationPath $destSchema -UnavailableExtensionNames @('supabase_vault')
    Assert-True 'schema filter: .Count usable on result (2 lines, single extension)' ($filteredExt.Count -eq 2)
    $destSchemaText = Get-Content -LiteralPath $destSchema -Raw
    Assert-True 'schema filter: pgcrypto kept' ($destSchemaText -match '(?m)^CREATE EXTENSION IF NOT EXISTS pgcrypto')
    Assert-True 'schema filter: supabase_vault CREATE removed as live statement' ($destSchemaText -notmatch '(?m)^CREATE EXTENSION IF NOT EXISTS supabase_vault')
    Assert-True 'schema filter: unrelated table DDL untouched' ($destSchemaText -match '(?m)^CREATE TABLE public\.projects')
} finally {
    Remove-Item -LiteralPath $srcSchema, $destSchema -ErrorAction SilentlyContinue
}

$srcData = New-TempSqlFile "COPY public.kept (id) FROM stdin;`n1`n\.`nCOPY vault.secrets (id) FROM stdin;`nx`n\.`n"
$destData = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-datafiltered-$([guid]::NewGuid().ToString('N')).sql"
try {
    $tableExists = @{ 'public.kept' = $true; 'vault.secrets' = $false }
    $skipped = New-FilteredDataFile -SourcePath $srcData -DestinationPath $destData -TableExists $tableExists
    Assert-True 'data filter: .Count usable on result (1 skipped table)' ($skipped.Count -eq 1)
    Assert-True 'data filter: correct table name recorded as skipped' ($skipped[0] -eq 'vault.secrets')
    $destDataText = Get-Content -LiteralPath $destData -Raw
    Assert-True 'data filter: existing table COPY block kept' ($destDataText -match '(?m)^COPY public\.kept')
    Assert-True 'data filter: missing table COPY header removed as live statement' ($destDataText -notmatch '(?m)^COPY vault\.secrets \(id\) FROM stdin;\s*$')
} finally {
    Remove-Item -LiteralPath $srcData, $destData -ErrorAction SilentlyContinue
}

$validBoundManifest = [pscustomobject]@{status='DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND';sourceCommit=$expectedCommit;releaseManifestSha256=$expectedManifestHash;manifestSha256=$expectedManifestHash;scriptSha256=$expectedScriptHash;backupScriptPath='scripts/production-backup.ps1'}
Assert-True 'release metadata: exact bound manifest passes' (Assert-BackupManifestReleaseBinding -Manifest $validBoundManifest -ExpectedSourceCommit $expectedCommit -ExpectedReleaseManifestSha256 $expectedManifestHash -ExpectedBackupScriptSha256 $expectedScriptHash)
Assert-Throws 'release metadata: legacy unbound manifest cannot qualify' { Assert-BackupManifestReleaseBinding -Manifest ([pscustomobject]@{status='DUMP_CREATED_STATIC_VALIDATION_PASS'}) -ExpectedSourceCommit $expectedCommit -ExpectedReleaseManifestSha256 $expectedManifestHash -ExpectedBackupScriptSha256 $expectedScriptHash } 'not release-qualified'
Assert-Throws 'release metadata: compatibility hashes must agree' { $bad=$validBoundManifest.PSObject.Copy();$bad.manifestSha256='0'*64;Assert-BackupManifestReleaseBinding -Manifest $bad -ExpectedSourceCommit $expectedCommit -ExpectedReleaseManifestSha256 $expectedManifestHash -ExpectedBackupScriptSha256 $expectedScriptHash } 'manifestSha256 mismatch'

# ===========================================================================
# 5. Parameter validation
# ===========================================================================
Assert-Throws 'param validation: missing path/-Latest' { & $scriptPath } 'USAGE ERROR'
Assert-Throws 'param validation: -BackupPath + -Latest together' { & $scriptPath -BackupPath 'C:\nowhere' -Latest } 'USAGE ERROR'

$missingFilesDir = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-missingfiles-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $missingFilesDir | Out-Null
try {
    & $scriptPath -BackupPath $missingFilesDir @releaseArgs *> $null
    $exitCode = $LASTEXITCODE
    Assert-True 'param validation: missing required files -> non-zero exit' ($exitCode -ne 0)
    # Write-Host output bypasses stream redirection entirely in Windows
    # PowerShell, so console text can't be asserted on via `2>&1`/`*>&1`
    # capture - check the written JSON report instead (also exercises that
    # a report is written even for a pre-Docker failure).
    $reportPath = Join-Path $missingFilesDir 'restore-verification.json'
    $reportExists = Test-Path -LiteralPath $reportPath
    Assert-True 'param validation: missing required files -> report written' $reportExists
    if ($reportExists) {
        $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
        Assert-True 'param validation: missing required files -> report mentions missing file(s)' ($report.failureReason -match 'missing')
        Assert-True 'param validation: missing required files -> report overallStatus is FAIL' ($report.overallStatus -eq 'FAIL')
    }
} finally {
    Remove-Item -LiteralPath $missingFilesDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ===========================================================================
# 6. Checksum mismatch stops before Docker
# ===========================================================================
$fakeBackupDir = Join-Path ([System.IO.Path]::GetTempPath()) "restore-verify-fakebackup-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $fakeBackupDir | Out-Null
try {
    $roles = ('-- roles' + ("`n" * 5)).PadRight(40, ' ')
    $schema = ('-- schema' + ("`n" * 60)).PadRight(600, ' ')
    $data = ('-- data' + ("`n" * 5)).PadRight(40, ' ')
    $mhs = ('-- mhs' + ("`n" * 5)).PadRight(80, ' ')
    $mhd = ('-- mhd' + ("`n" * 5)).PadRight(40, ' ')
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'roles.sql') -Value $roles
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'schema.sql') -Value $schema
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'data.sql') -Value $data
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'migration_history_schema.sql') -Value $mhs
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'migration_history_data.sql') -Value $mhd
    $manifest = @{ status = 'DUMP_CREATED_STATIC_VALIDATION_PASS_RELEASE_BOUND'; sourceCommit=$expectedCommit; releaseManifestSha256=$expectedManifestHash; manifestSha256=$expectedManifestHash; scriptSha256=$expectedScriptHash; backupScriptPath='scripts/production-backup.ps1'; migrationHistory = @{ schema = 'supabase_migrations'; status = 'not_present' } } | ConvertTo-Json
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'backup-manifest.json') -Value $manifest
    # Deliberately wrong checksum for roles.sql.
    $badChecksum = ('0' * 64) + '  roles.sql'
    $realSchemaHash = (Get-FileHash -LiteralPath (Join-Path $fakeBackupDir 'schema.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Utf8NoBom -Path (Join-Path $fakeBackupDir 'checksums.sha256') -Value ($badChecksum + "`n" + "$realSchemaHash  schema.sql`n")

    & $scriptPath -BackupPath $fakeBackupDir @releaseArgs *> $null
    $exitCode = $LASTEXITCODE
    Assert-True 'checksum mismatch: non-zero exit' ($exitCode -ne 0)

    $reportPath = Join-Path $fakeBackupDir 'restore-verification.json'
    $reportExists = Test-Path -LiteralPath $reportPath
    Assert-True 'checksum mismatch: report written' $reportExists
    if ($reportExists) {
        $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
        Assert-True 'checksum mismatch: report overallStatus is FAIL' ($report.overallStatus -eq 'FAIL')
        Assert-True 'checksum mismatch: report reason mentions checksum' ($report.failureReason -match 'checksum')
        $stepNames = @($report.restoreSteps | ForEach-Object { $_.name })
        Assert-True 'checksum mismatch: never reached container_start' ($stepNames -notcontains 'container_start')
    }
} finally {
    Remove-Item -LiteralPath $fakeBackupDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ===========================================================================
# 7. Report schema contains required fields (structural check on source)
# ===========================================================================
$requiredReportFields = @('verificationVersion', 'timestampUtc', 'backupPath', 'backupTimestamp', 'postgresImage',
    'checksumStatus', 'manifestStatus', 'backupManifestSha256', 'releaseBindingStatus', 'migrationHistory', 'roleMemberships', 'restoreSteps', 'schemas', 'tableCount', 'tables',
    'constraints', 'unexpectedInvalidConstraints', 'triggers', 'sessionReplicationRole', 'cleanup', 'overallStatus', 'failureReason')
foreach ($f in $requiredReportFields) {
    Assert-True "report schema: `$diag defines '$f'" ($scriptText -match [regex]::Escape("$f =") -or $scriptText -match [regex]::Escape("`$diag.$f "))
}

# ===========================================================================
# 8. Fail-closed: overallStatus starts FAIL, only flips to PASS at the very
# end of a fully successful try block; any throw path leaves it FAIL.
# ===========================================================================
Assert-True 'fail-closed: overallStatus initialized to FAIL' ($scriptText -match "overallStatus = 'FAIL'")
Assert-True 'fail-closed: overallStatus only set to PASS once, at end of try' (([regex]::Matches($scriptText, "overallStatus = 'PASS'")).Count -eq 1)
Assert-True 'fail-closed: catch block forces overallStatus to FAIL' ($scriptText -match "catch\s*\{[\s\S]{0,300}overallStatus = 'FAIL'")
Assert-True 'fail-closed: cleanup failure downgrades a PASS to FAIL' ($scriptText -match "cleanup -ne 'PASS'[\s\S]{0,400}overallStatus = 'FAIL'")

# ===========================================================================
# 9. Data-load command uses ONE psql process for replica/import/origin
# ===========================================================================
$dataLoadPattern = "'-c', 'SET session_replication_role = replica;'[\s\S]{0,120}'-f', '/verify-temp/data\.filtered\.sql'[\s\S]{0,120}'-c', 'SET session_replication_role = origin;'"
Assert-True 'single psql invocation for replica+import+origin' ($scriptText -match $dataLoadPattern)
# Guard against a regression back to the two-connection bug: no standalone
# `docker exec ... -c 'SET session_replication_role = replica;'` call that
# is NOT immediately followed by the -f/-c chain above.
$standaloneSetPattern = "ArgumentList @\('exec', \`$containerName, 'psql'[^\)]*'-c', 'SET session_replication_role = replica;'\)"
Assert-True 'no standalone (separate-connection) SET session_replication_role call' ($scriptText -notmatch $standaloneSetPattern)

# ===========================================================================
# 10. Cleanup logic cannot delete a foreign container/volume
# ===========================================================================
Assert-True 'cleanup: docker rm targets exact unique container name variable' ($scriptText -match "@\('rm', '-f', \`$containerName\)")
Assert-True 'cleanup: docker volume rm targets exact unique volume name variable' ($scriptText -match "@\('volume', 'rm', \`$volumeName\)")
Assert-True 'cleanup: no broad/prune docker commands' ($scriptText -notmatch 'docker system prune' -and $scriptText -notmatch 'container prune' -and $scriptText -notmatch "'rm',\s*'-f',\s*'-a'")
Assert-True 'unique names: container name includes a random suffix' ($scriptText -match '\$containerName = "restore-verify-\$suffix"')
Assert-True 'unique names: volume name includes a random suffix' ($scriptText -match '\$volumeName = "restore-verify-vol-\$suffix"')
Assert-True 'unique names: suffix derived from a new GUID per run' ($scriptText -match '\[guid\]::NewGuid\(\)')

# ===========================================================================
# 11. Safety invariants (static source checks, cheap and high-signal)
# ===========================================================================
Assert-True 'never reads .env.production.local' ($scriptText -notmatch '\.env\.production\.local')
Assert-True 'no host port publish flag (-p / --publish) for the disposable container' ($scriptText -notmatch "'-p',|'--publish'")
Assert-True 'uses POSTGRES_HOST_AUTH_METHOD=trust (documented, disposable-only)' ($scriptText -match 'POSTGRES_HOST_AUTH_METHOD=trust')
Assert-True 'backup bind mounts are read-only' (([regex]::Matches($scriptText, 'target=/verify-backup,readonly')).Count -ge 1)
Assert-True 'every psql restore call uses -X' ((($scriptText -split "'-f',") | Select-Object -Skip 1 | Where-Object { $_ -match "psql" }).Count -eq 0 -or $scriptText -match "'psql', '-X'")
Assert-True 'strict ON_ERROR_STOP=1 used for roles/schema/migration-history/data' (([regex]::Matches($scriptText, "ON_ERROR_STOP=1")).Count -ge 4)

# ===========================================================================
# Summary
# ===========================================================================
Write-Host ''
Write-Host "TOTAL: $($script:passCount) passed, $($script:failCount) failed"
if ($script:failCount -gt 0) {
    Write-Host "FAILED: $($script:failures -join ', ')"
    exit 1
}
exit 0
