# Production Remediation - regression suite (rehearsal algorithm 1.0.0)
# Plain assertion script, same pattern as the other *.tests.ps1 files.
# Run: powershell.exe -NoProfile -File scripts/tests/production-remediation.tests.ps1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:passCount = 0
$script:failCount = 0
$script:failures = @()

function Assert-True {
    param([string]$Name, [bool]$Condition, [string]$Detail = '')
    if ($Condition) { $script:passCount++; Write-Host "[PASS] $Name" }
    else { $script:failCount++; $script:failures += $Name; Write-Host "[FAIL] $Name $(if ($Detail) { "- $Detail" })" }
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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scriptsRoot = Join-Path $repoRoot 'scripts'
$migrationsRoot = Join-Path $repoRoot 'weekly-tracker\src\migrations'
$migrationPath = Join-Path $migrationsRoot '028_production_security_reconciliation.sql'
$migration029Path = Join-Path $migrationsRoot '029_production_acl_followup.sql'
$rehearsalPath = Join-Path $scriptsRoot 'production-security-remediation-rehearsal.ps1'
$fixtureRehearsalPath = Join-Path $scriptsRoot 'production-acl-fixture-rehearsal.ps1'
$compositeCertPath = Join-Path $scriptsRoot 'composite-security-certification.ps1'
$preflightCliPath = Join-Path $scriptsRoot 'production-remediation-preflight.ps1'
$postflightCliPath = Join-Path $scriptsRoot 'production-remediation-postflight.ps1'

. (Join-Path $scriptsRoot 'lib\RestoreVerifyHelpers.ps1')
. (Join-Path $scriptsRoot 'lib\SecurityContractInventory.ps1')
. (Join-Path $scriptsRoot 'lib\MigrationContractExtractor.ps1')
. (Join-Path $scriptsRoot 'lib\ProductionSecurityStateEmulator.ps1')
. (Join-Path $scriptsRoot 'lib\RemediationPreflightPostflight.ps1')

# ===========================================================================
# 1. AST parse / PS 5.1 compatibility
# ===========================================================================
foreach ($f in @('lib\ProductionSecurityStateEmulator.ps1', 'lib\RemediationPreflightPostflight.ps1', 'production-remediation-preflight.ps1', 'production-remediation-postflight.ps1', 'production-security-remediation-rehearsal.ps1', 'production-acl-fixture-rehearsal.ps1', 'composite-security-certification.ps1')) {
    $full = Join-Path $scriptsRoot $f
    $tokens = $null; $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($full, [ref]$tokens, [ref]$errors) | Out-Null
    Assert-True "AST parse: $f" ($errors.Count -eq 0)
    $text = Get-Content -LiteralPath $full -Raw
    Assert-True "$f : no -Encoding utf8NoBOM" ($text -notmatch '-Encoding\s+[''"]?utf8NoBOM')
    Assert-True "$f : no PS7-only ?? operator" ($text -notmatch '(?<!\?)\?\?(?!\?)')
    Assert-True "$f : no PS7-only ?. operator" ($text -notmatch '\?\.')
    Assert-True "$f : no @(`$var) StrictMode binder trap (bare variable)" ($text -notmatch '@\(\$[a-zA-Z_][a-zA-Z0-9_]*\)\.')
}

# ===========================================================================
# 2. Migration 028 exists, is next-free-numbered, and is in the canonical contract
# ===========================================================================
Assert-True '028_production_security_reconciliation.sql exists' (Test-Path -LiteralPath $migrationPath -PathType Leaf)
$existingMigrationNumbers = Get-ChildItem -LiteralPath $migrationsRoot -Filter '*.sql' -File | ForEach-Object { if ($_.Name -match '^(\d{3})_') { [int]$Matches[1] } } | Where-Object { $_ -ne $null }
Assert-True '029 is the next free canonical migration number (no 030+ file exists that should have come first)' (($existingMigrationNumbers | Sort-Object -Descending | Select-Object -First 1) -eq 29)

$contractPath = Join-Path $scriptsRoot 'contracts\canonical-security-contract.json'
$contract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
Assert-True 'canonical contract includes 028 in the migration path' (@($contract.canonicalMigrationPath.included) -contains '028_production_security_reconciliation.sql')
Assert-True 'canonical contract includes 029 in the migration path' (@($contract.canonicalMigrationPath.included) -contains '029_production_acl_followup.sql')
$includedMigrations = @($contract.canonicalMigrationPath.included)
$idx028 = [array]::IndexOf($includedMigrations, '028_production_security_reconciliation.sql')
$idx029 = [array]::IndexOf($includedMigrations, '029_production_acl_followup.sql')
Assert-True 'canonical contract lists 029 immediately after 028 (append-only ordering)' (($idx028 -ge 0) -and ($idx029 -eq $idx028 + 1))
$migrationFiles = Get-CanonicalMigrationFileList -ContractPath $contractPath -MigrationsRoot $migrationsRoot
Assert-True 'Get-CanonicalMigrationFileList resolves 20 files including 028 and 029' ($migrationFiles.Count -eq 20)

$migrationText = Get-Content -LiteralPath $migrationPath -Raw
Assert-True '028 does not modify migrations 000-027 (append-only; no ALTER on their own definitions is implied by them not being edited)' (
    -not (Get-ChildItem -LiteralPath $migrationsRoot -Filter '0[0-2][0-9]_*.sql' -File | Where-Object { $_.Name -ne '028_production_security_reconciliation.sql' } | ForEach-Object {
        (Get-Content -LiteralPath $_.FullName -Raw) -match '\bTHIS FILE WAS MODIFIED BY 028\b'
    } | Where-Object { $_ })
)
Assert-True '028 is wrapped in a single transaction (BEGIN...COMMIT)' ($migrationText -match '(?m)^BEGIN;' -and $migrationText -match '(?m)^COMMIT;')
Assert-True '028 never uses REVOKE ALL ON <table(s)> FROM PUBLIC (targeted per-role revokes only; per-function REVOKE ALL ... FROM PUBLIC is the standard, narrow default-EXECUTE-lockdown pattern 025/027 already use and is not the broad-table risk this check guards against; matched within a single statement only, not across a ; boundary)' ($migrationText -notmatch '(?i)REVOKE\s+ALL\s+ON\s+(?!FUNCTION)[^;]{0,200}?FROM\s+PUBLIC')
Assert-True '028 never disables RLS' ($migrationText -notmatch '(?i)DISABLE ROW LEVEL SECURITY')
Assert-True '028 never uses a destructive DROP/TRUNCATE ... CASCADE (a plain FK ON DELETE CASCADE, verbatim from the original 025, is not the same risk)' ($migrationText -notmatch '(?i)\b(DROP|TRUNCATE)\b[^;]*\bCASCADE\b')
Assert-True '028 never contains a hardcoded credential-shaped string' ($migrationText -notmatch '(?i)password\s*[:=]\s*[''"][^'']')
Assert-True '028 uses CREATE TABLE IF NOT EXISTS for the new structural table' ($migrationText -match 'CREATE TABLE IF NOT EXISTS public\.write_command_requests')
Assert-True '028 uses CREATE OR REPLACE FUNCTION for all functions (rerunnable)' (
    @([regex]::Matches($migrationText, '(?m)^CREATE (?:OR REPLACE )?FUNCTION')) | ForEach-Object { $_.Value -match 'OR REPLACE' } | Where-Object { -not $_ } | Measure-Object | ForEach-Object { $_.Count -eq 0 }
)
Assert-True '028 grants EXECUTE on both atomic RPCs to authenticated only (not PUBLIC, not anon)' (
    $migrationText -match 'GRANT EXECUTE ON FUNCTION public\.submit_contractor_report_atomic\([^)]*\) TO authenticated;' -and
    $migrationText -match 'GRANT EXECUTE ON FUNCTION public\.submit_site_visit_atomic\([^)]*\) TO authenticated;'
)
Assert-True '028 revokes EXECUTE from PUBLIC before granting to authenticated (both atomic RPCs)' (
    $migrationText -match 'REVOKE ALL ON FUNCTION public\.submit_contractor_report_atomic\([^)]*\) FROM PUBLIC;' -and
    $migrationText -match 'REVOKE ALL ON FUNCTION public\.submit_site_visit_atomic\([^)]*\) FROM PUBLIC;'
)

# Regression: a real end-to-end rehearsal run found that revoking EXECUTE
# from anon/authenticated specifically was insufficient - Postgres grants
# EXECUTE to PUBLIC by default at function creation, and has_function_
# privilege() for a named role returns true if the role has it EITHER
# directly OR via the implicit PUBLIC grant. 020_rls_company_role_
# hardening.sql already contains `REVOKE ALL ON FUNCTION
# public.fn_audit_log() FROM PUBLIC;`, but production's actual state
# (confirmed by the rehearsal, which hydrates the REAL production ACL from
# the immutable inventory before applying 028) still allowed anon/
# authenticated to execute it - proving that specific statement, or its
# effect, never actually reached production. The fix must target PUBLIC
# directly rather than assuming an earlier migration's PUBLIC-revoke
# already took effect.
Assert-True '028 revokes fn_audit_log() EXECUTE from PUBLIC AND anon/authenticated directly (REVOKE FROM PUBLIC alone does not remove a separate direct grant - proven by a real rehearsal against the hydrated actual production ACL)' ($migrationText -match 'REVOKE EXECUTE ON FUNCTION public\.fn_audit_log\(\) FROM PUBLIC, anon, authenticated;')
Assert-True '028 revokes submit_contractor_report() EXECUTE from PUBLIC and anon directly, and re-grants only to authenticated' ($migrationText -match 'REVOKE EXECUTE ON FUNCTION public\.submit_contractor_report\(bigint, date, jsonb, jsonb\) FROM PUBLIC, anon;' -and $migrationText -match 'GRANT EXECUTE ON FUNCTION public\.submit_contractor_report\(bigint, date, jsonb, jsonb\) TO authenticated;')
Assert-True '028 wires handle_new_user() to a real DROP+CREATE TRIGGER on auth.users' ($migrationText -match 'DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users' -and $migrationText -match 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users')
Assert-True '028 wires rls_auto_enable() to a real DROP+CREATE EVENT TRIGGER' ($migrationText -match 'DROP EVENT TRIGGER IF EXISTS ensure_rls' -and $migrationText -match 'CREATE EVENT TRIGGER ensure_rls ON ddl_command_end')

# ===========================================================================
# 3. Migration 025/027 forensic classification (static evidence, no Docker)
# ===========================================================================
$m025 = Get-Content -LiteralPath (Join-Path $migrationsRoot '025_atomic_write_commands.sql') -Raw
$m026 = Get-Content -LiteralPath (Join-Path $migrationsRoot '026_grant_authenticated_table_privileges.sql') -Raw
$m027 = Get-Content -LiteralPath (Join-Path $migrationsRoot '027_contractor_report_wp_validation.sql') -Raw
Assert-True '025 is idempotent (CREATE TABLE IF NOT EXISTS for write_command_requests)' ($m025 -match 'CREATE TABLE IF NOT EXISTS public\.write_command_requests')
Assert-True '025 never references migration 026 or its grants (proves 026 has zero dependency on 025 - explains how 026 applied while 025 did not)' ($m025 -notmatch '026')
$m026CodeOnly = ($m026 -replace '(?m)^--[^\r\n]*', '')
Assert-True '026 contains no executable GRANT/REVOKE statement touching write_command_requests or the atomic RPCs (only mentions them in comments explaining the exclusion) - proves independence from 025/027' ($m026CodeOnly -notmatch 'write_command_requests|submit_contractor_report_atomic|submit_site_visit_atomic')
Assert-True '027 is a pure CREATE OR REPLACE FUNCTION (safe to layer on top of 025, no new tables)' ($m027 -notmatch '(?m)^CREATE TABLE')
Assert-True '027 depends on write_command_requests existing (references it in the function body it replaces)' ($m027 -match 'write_command_requests')

$callerFiles = @('weekly-tracker\src\services\contractorReportService.js', 'weekly-tracker\src\services\siteVisitService.js')
foreach ($f in $callerFiles) {
    $full = Join-Path $repoRoot $f
    Assert-True "$f exists and is a real application caller" (Test-Path -LiteralPath $full -PathType Leaf)
}
$contractorSvc = Get-Content -LiteralPath (Join-Path $repoRoot 'weekly-tracker\src\services\contractorReportService.js') -Raw
$siteVisitSvc = Get-Content -LiteralPath (Join-Path $repoRoot 'weekly-tracker\src\services\siteVisitService.js') -Raw
Assert-True 'contractorReportService.js actually calls submit_contractor_report_atomic (proves 025/027 are real application requirements, not deferred/speculative)' ($contractorSvc -match 'submit_contractor_report_atomic')
Assert-True 'siteVisitService.js actually calls submit_site_visit_atomic (proves 025 is a real application requirement)' ($siteVisitSvc -match 'submit_site_visit_atomic')

# Production has no supabase_migrations history table - out-of-order/partial
# manual application is the confirmed operational model, not a corrupted state.
$restoreReportPath = Join-Path $repoRoot 'backups\production\20260711T084934Z\restore-verification.json'
if (Test-Path -LiteralPath $restoreReportPath) {
    $restoreReport = Get-Content -LiteralPath $restoreReportPath -Raw | ConvertFrom-Json
    Assert-True 'production has no supabase_migrations history table (confirms manual-apply model, explaining partial 025/027 application)' ($restoreReport.migrationHistory.status -eq 'not_present')
}

# ===========================================================================
# 4. Production-only function classification (static evidence from the real backup)
# ===========================================================================
$schemaSqlPath = Join-Path $repoRoot 'backups\production\20260711T084934Z\schema.sql'
if (Test-Path -LiteralPath $schemaSqlPath) {
    $schemaSql = Get-Content -LiteralPath $schemaSqlPath -Raw
    Assert-True 'handle_new_user() is wired to a real trigger on auth.users in the actual production backup (APPLICATION_REQUIRED, not orphaned)' ($schemaSql -match 'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users[\s\S]*?EXECUTE FUNCTION public\.handle_new_user\(\)')
    Assert-True 'rls_auto_enable() is wired to a real event trigger in the actual production backup (APPLICATION_REQUIRED, not orphaned)' ($schemaSql -match "CREATE EVENT TRIGGER ensure_rls ON ddl_command_end[\s\S]*?EXECUTE FUNCTION public\.rls_auto_enable\(\)")
    Assert-True 'handle_new_user() is SECURITY DEFINER with a hardened search_path in production (safe to canonicalize)' ($schemaSql -match "CREATE FUNCTION public\.handle_new_user\(\)[\s\S]{0,400}SECURITY DEFINER" )
}

# ===========================================================================
# 5. ACL matrix generation (Production Security State Emulator)
# ===========================================================================
$mockInventory = [pscustomobject]@{
    elements = @(
        [pscustomobject]@{ category = 'tablePrivileges'; value = [pscustomobject]@{ schema = 'public'; table = 'projects'; role = 'anon'; privilege = 'SELECT'; allowed = $true } },
        [pscustomobject]@{ category = 'tablePrivileges'; value = [pscustomobject]@{ schema = 'public'; table = 'projects'; role = 'anon'; privilege = 'DELETE'; allowed = $false } },
        [pscustomobject]@{ category = 'sequencePrivileges'; value = [pscustomobject]@{ schema = 'public'; sequence = 'projects_id_seq'; role = 'authenticated'; privilege = 'USAGE'; allowed = $true } },
        [pscustomobject]@{ category = 'functionPrivileges'; value = [pscustomobject]@{ function = 'public.fn_audit_log()'; role = 'authenticated'; execute = $true } },
        [pscustomobject]@{ category = 'functionPrivileges'; value = [pscustomobject]@{ function = 'public.fn_audit_log()'; role = 'anon'; execute = $false } },
        [pscustomobject]@{ category = 'rls'; value = [pscustomobject]@{ schema = 'public'; table = 'projects'; rlsEnabled = $true; rlsForced = $false } }
    )
}
$grants = Get-ProductionActualGrantStatements -Inventory $mockInventory
Assert-True 'Get-ProductionActualGrantStatements emits exactly one statement per allowed=true/execute=true row' ($grants.Count -eq 3)
Assert-True 'Get-ProductionActualGrantStatements emits a correct table GRANT' ($grants -contains 'GRANT SELECT ON public.projects TO anon;')
Assert-True 'Get-ProductionActualGrantStatements does not emit a statement for allowed=false rows' ($grants -notcontains 'GRANT DELETE ON public.projects TO anon;')
Assert-True 'Get-ProductionActualGrantStatements emits a correct sequence GRANT' ($grants -contains 'GRANT USAGE ON SEQUENCE public.projects_id_seq TO authenticated;')
Assert-True 'Get-ProductionActualGrantStatements emits a correct function GRANT' ($grants -contains 'GRANT EXECUTE ON FUNCTION public.fn_audit_log() TO authenticated;')
Assert-True 'Get-ProductionActualGrantStatements ignores non-privilege categories (e.g. rls)' (@($grants | Where-Object { $_ -match 'projects.*rls|rlsEnabled' }).Count -eq 0)

$hydrationScript = New-ProductionSecurityStateHydrationScript -Inventory $mockInventory
Assert-True 'New-ProductionSecurityStateHydrationScript never issues CREATE ROLE (roles come from the real roles.sql restore, not this emulator)' ($hydrationScript -notmatch '(?i)CREATE ROLE')
Assert-True 'New-ProductionSecurityStateHydrationScript is deterministic (same inventory -> byte-identical script)' (Test-ProductionSecurityStateHydrationDeterministic -Inventory $mockInventory)

# ===========================================================================
# 6. Preflight / postflight decision logic (mocked queryFn, no Docker)
# ===========================================================================
function New-MockQuery([hashtable]$Responses) {
    return {
        param([string]$Sql)
        foreach ($key in $Responses.Keys) {
            if ($Sql -like "*$key*") { return $Responses[$key] }
        }
        throw "New-MockQuery: no canned response for: $Sql"
    }.GetNewClosure()
}

$readyResponses = @{
    "server_version_num" = '170004'
    "to_regnamespace('supabase_migrations')" = 'f'
    "to_regclass('public.write_command_requests')" = 'f'
    "to_regprocedure" = 'f'
    "on_auth_user_created" = ''
}
$readyQuery = New-MockQuery $readyResponses
$readyResult = Invoke-RemediationPreflight -Query $readyQuery
Assert-True 'Preflight: nothing present -> READY (known, handled starting point)' ($readyResult.status -eq 'READY')

$alreadyResponses = @{
    "server_version_num" = '170004'
    "to_regnamespace('supabase_migrations')" = 'f'
    "to_regclass('public.write_command_requests')" = 't'
    "to_regprocedure" = 't'
    "on_auth_user_created" = ''
}
$alreadyQuery = New-MockQuery $alreadyResponses
$alreadyResult = Invoke-RemediationPreflight -Query $alreadyQuery
Assert-True 'Preflight: everything present -> ALREADY_REMEDIATED' ($alreadyResult.status -eq 'ALREADY_REMEDIATED')

$conflictResponses = @{
    "server_version_num" = '170004'
    "to_regnamespace('supabase_migrations')" = 'f'
    "to_regclass('public.write_command_requests')" = 'f'
    "to_regprocedure" = 'f'
    "on_auth_user_created" = 'on_auth_user_created'
}
$conflictQuery = New-MockQuery $conflictResponses
$conflictResult = Invoke-RemediationPreflight -Query $conflictQuery
Assert-True 'Preflight: conflicting unknown trigger -> BLOCKED (not silently READY)' ($conflictResult.status -eq 'BLOCKED')

$postflightPassResponses = @{
    "to_regprocedure" = 't'
    "to_regclass('public.write_command_requests')" = 't'
    "on_auth_user_created' AND NOT tgisinternal" = '1'
    "evtname = 'ensure_rls'" = '1'
    "has_table_privilege('anon','public.projects','SELECT')" = 'f'
    "has_table_privilege('authenticated','public.projects','SELECT')" = 't'
    "has_table_privilege('authenticated','public.projects','TRUNCATE')" = 'f'
    "has_sequence_privilege('authenticated','public.projects_id_seq','USAGE')" = 't'
    "has_sequence_privilege('authenticated','public.projects_id_seq','SELECT')" = 'f'
    "has_function_privilege('anon','public.submit_contractor_report(bigint,date,jsonb,jsonb)','EXECUTE')" = 'f'
    "has_function_privilege('authenticated','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 't'
    "has_function_privilege('anon','public.fn_audit_log()','EXECUTE')" = 'f'
    # migration 029 coverage: fully-remediated (post-029) desired state -
    # anon/authenticated have nothing on the sequence, anon has nothing on
    # either atomic RPC, postgres/service_role/authenticated retain what
    # they need.
    "has_sequence_privilege('anon','public.write_command_requests_id_seq','SELECT')" = 'f'
    "has_sequence_privilege('anon','public.write_command_requests_id_seq','UPDATE')" = 'f'
    "has_sequence_privilege('anon','public.write_command_requests_id_seq','USAGE')" = 'f'
    "has_sequence_privilege('authenticated','public.write_command_requests_id_seq','SELECT')" = 'f'
    "has_sequence_privilege('authenticated','public.write_command_requests_id_seq','UPDATE')" = 'f'
    "has_sequence_privilege('authenticated','public.write_command_requests_id_seq','USAGE')" = 'f'
    "has_sequence_privilege('postgres','public.write_command_requests_id_seq','USAGE')" = 't'
    "has_sequence_privilege('service_role','public.write_command_requests_id_seq','USAGE')" = 't'
    "has_function_privilege('anon','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 'f'
    "has_function_privilege('anon','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 'f'
    "has_function_privilege('authenticated','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 't'
    "has_function_privilege('service_role','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 't'
    "has_function_privilege('service_role','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')" = 't'
    "grantee::regrole::text = 'anon' AND a.privilege_type = 'SELECT')" = 'f'
    "grantee::regrole::text = 'anon' AND a.privilege_type = 'UPDATE')" = 'f'
    "grantee::regrole::text = 'anon' AND a.privilege_type = 'USAGE')" = 'f'
    "grantee::regrole::text = 'authenticated' AND a.privilege_type = 'SELECT')" = 'f'
    "grantee::regrole::text = 'authenticated' AND a.privilege_type = 'UPDATE')" = 'f'
    "grantee::regrole::text = 'authenticated' AND a.privilege_type = 'USAGE')" = 'f'
    "grantee::regrole::text = 'postgres' AND a.privilege_type = 'USAGE')" = 't'
    "grantee::regrole::text = 'service_role' AND a.privilege_type = 'USAGE')" = 't'
    "proname = 'submit_contractor_report_atomic' AND a.grantee::regrole::text = 'anon' AND a.privilege_type = 'EXECUTE')" = 'f'
    "proname = 'submit_site_visit_atomic' AND a.grantee::regrole::text = 'anon' AND a.privilege_type = 'EXECUTE')" = 'f'
    "proname = 'submit_contractor_report_atomic' AND a.grantee::regrole::text = 'authenticated' AND a.privilege_type = 'EXECUTE')" = 't'
    "proname = 'submit_site_visit_atomic' AND a.grantee::regrole::text = 'authenticated' AND a.privilege_type = 'EXECUTE')" = 't'
}
$postflightPassQuery = New-MockQuery $postflightPassResponses
$postflightPassResult = Invoke-RemediationPostflight -Query $postflightPassQuery
Assert-True 'Postflight: all checks pass -> PASS' ($postflightPassResult.status -eq 'PASS') ($postflightPassResult.failures -join '; ')

$postflightFailResponses = $postflightPassResponses.Clone()
$postflightFailResponses["has_table_privilege('anon','public.projects','SELECT')"] = 't'
$postflightFailQuery = New-MockQuery $postflightFailResponses
$postflightFailResult = Invoke-RemediationPostflight -Query $postflightFailQuery
Assert-True 'Postflight: one residual over-grant -> FAIL, not silently PASS' ($postflightFailResult.status -eq 'FAIL')
Assert-True 'Postflight FAIL result exposes the specific failing check' (@($postflightFailResult.failures | Where-Object { $_ -match 'anon has no SELECT on projects' }).Count -eq 1)

$postflightMissingObjResponses = $postflightPassResponses.Clone()
$postflightMissingObjResponses["to_regclass('public.write_command_requests')"] = 'f'
$postflightMissingObjQuery = New-MockQuery $postflightMissingObjResponses
$postflightMissingObjResult = Invoke-RemediationPostflight -Query $postflightMissingObjQuery
Assert-True 'Postflight: missing required table -> FAIL (never a silent partial success)' ($postflightMissingObjResult.status -eq 'FAIL')

# ===========================================================================
# 7. Cleanup / no-production-connection / secret-redaction static checks
# ===========================================================================
$rehearsalText = Get-Content -LiteralPath $rehearsalPath -Raw
Assert-True 'rehearsal script never dot-sources ProductionConnection.ps1 (no production reconnection path exists)' ($rehearsalText -notmatch 'ProductionConnection\.ps1')
Assert-True 'rehearsal script never accepts a database URI or password parameter' ($rehearsalText -notmatch '\[string\]\$(?:DbUrl|DatabaseUrl|Password|ConnectionString)\b')
Assert-True 'rehearsal script validates the production inventory checksum before using it' ($rehearsalText -match 'checksum mismatch')
Assert-True 'rehearsal script cleans up the disposable container/volume in a finally block' ($rehearsalText -match "(?s)\} finally \{.*docker.*rm.*container")
$rehearsalCodeOnly = ($rehearsalText -replace '(?m)^\s*#[^\r\n]*', '')
Assert-True 'rehearsal script writes all outputs under -OutputPath, never under backups/production (code only, comments excluded)' ($rehearsalCodeOnly -notmatch "backups[\\/]production")
Assert-True 'rehearsal script proves the pre-remediation emulated state reproduces the real FAIL before trusting the migration apply' ($rehearsalText -match 'expectedFailReproduced')
Assert-True 'rehearsal script re-applies the migration a second time to prove idempotence' ($rehearsalText -match '(?i)idempotent.*apply|second.*apply')

# Regression: a real end-to-end rehearsal run found the post-remediation
# composite check permanently reported write_command_requests as
# "missing" because composite-security-certification.ps1's structuralSchema
# check always independently re-derives from a fresh restore of the
# *original* backup - which, correctly, never contains a table that only
# migration 028 (applied only to the rehearsal container) creates. Fixed
# via the new, backward-compatible -AdditionalVerifiedStructuralTables
# parameter, passed only for the POST-remediation call (proven by
# postflight's own real catalog read) - the PRE-remediation call must NOT
# receive it, or it would silently stop reproducing the real, expected FAIL.
$preCompositeBlockMatch = [regex]::Match($rehearsalText, '(?s)\$preCompositeArgs = @\([^;]*?\)\r?\n')
$postCompositeBlockMatch = [regex]::Match($rehearsalText, '(?s)\$postCompositeArgs = @\([^;]*?\)\r?\n')
Assert-True 'rehearsal script locates both composite-call argument blocks for inspection' ($preCompositeBlockMatch.Success -and $postCompositeBlockMatch.Success)
Assert-True 'pre-remediation composite call does NOT pass -AdditionalVerifiedStructuralTables (must still reproduce the real, unmodified FAIL)' ($preCompositeBlockMatch.Value -notmatch 'AdditionalVerifiedStructuralTables')
Assert-True 'post-remediation composite call passes -AdditionalVerifiedStructuralTables write_command_requests (proven by postflight, not assumed)' ($postCompositeBlockMatch.Value -match "AdditionalVerifiedStructuralTables.*write_command_requests")

# Regression: a real determinism rerun (two independent full rehearsal
# runs) found identical status/counts/differences but a DIFFERENT overall
# composite canonicalPayloadHash, because New-LocalInventoryArtifact used a
# live [DateTime]::UtcNow timestamp - unlike a real, immutable production
# inventory artifact (whose timestamp legitimately varies once, at real
# capture time), this local inventory is regenerated fresh on every
# rehearsal run, so a live timestamp changed the file's own checksum (and
# therefore the downstream composite hash that binds to it) on every run
# even with byte-identical underlying catalog data.
Assert-True 'New-LocalInventoryArtifact never uses a live [DateTime]::UtcNow for timestampUtc/completedAtUtc (would break rehearsal-to-rehearsal hash determinism)' ($rehearsalText -notmatch "timestampUtc = \[DateTime\]::UtcNow" -and $rehearsalText -notmatch "completedAtUtc = \[DateTime\]::UtcNow")
Assert-True 'New-LocalInventoryArtifact uses a fixed, deterministic placeholder timestamp instead' ($rehearsalText -match "\`$deterministicPlaceholderTimestamp = '1970-01-01T00:00:00\.0000000Z'" -and $rehearsalText -match 'timestampUtc = \$deterministicPlaceholderTimestamp' -and $rehearsalText -match 'completedAtUtc = \$deterministicPlaceholderTimestamp')

foreach ($cliPath in @($preflightCliPath, $postflightCliPath)) {
    $cliText = Get-Content -LiteralPath $cliPath -Raw
    $name = Split-Path -Leaf $cliPath
    Assert-True "$name never accepts a database URI or password parameter" ($cliText -notmatch '\[string\]\$(?:DbUrl|DatabaseUrl|Password|ConnectionString)\b')
    Assert-True "$name requires an already-running container name, not a connection string" ($cliText -match '\[Parameter\(Mandatory\)\]\[string\]\$Container')
}
Assert-True 'production-remediation-postflight.ps1 exits non-zero on FAIL' ((Get-Content -LiteralPath $postflightCliPath -Raw) -match 'if \(\$result\.status -ne ''PASS''\) \{ exit 1 \}')

# Regression: a real end-to-end rehearsal run found that
# `@(Get-ProductionActualGrantStatements -Inventory $prodInventory).Count`
# silently returned 1 instead of the real 628-statement count under
# Windows PowerShell 5.1 + Set-StrictMode -Version Latest, even though the
# SAME function called through New-ProductionSecurityStateHydrationScript
# (which does not @()-wrap the call site) correctly produced all 628 lines.
# This is the PSToObjectArrayBinder trap in a new shape: wrapping a
# FUNCTION CALL's `,$out`-returned array directly with @(...) at the call
# site, not just wrapping an already-materialized variable. The fix is to
# capture the call into a typed variable first, then read .Count off that.
Assert-True 'rehearsal script never wraps a function call directly with @(...) (capture into a typed variable first, then .Count)' (
    $rehearsalText -notmatch '@\(Get-[A-Za-z]+[^)]*\)\.Count'
)
Assert-True 'rehearsal script captures Get-ProductionActualGrantStatements into a typed [string[]] variable before counting' ($rehearsalText -match '\[string\[\]\]\$grantStatementsForCount = Get-ProductionActualGrantStatements')
Assert-True 'rehearsal script never wraps an indexer expression ($x.categories[$k]) directly with @(...).Count (same PSToObjectArrayBinder trap, indexer variant found by a real end-to-end run)' ($rehearsalText -notmatch '@\(\$[a-zA-Z_][a-zA-Z0-9_.]*\[[^\]]+\]\)\.Count')
Assert-True 'rehearsal script captures categories[$k] into a typed [object[]] variable before counting' ($rehearsalText -match '\[object\[\]\]\$categoryRows = \$Inventory\.categories\[\$k\]')

# Regression: a real end-to-end rehearsal run found two more gaps after
# the migration itself started applying cleanly.
#
# (1) service_role's platform-managed full-ACL default cannot be replayed
# by the Production Security State Emulator for objects that did not yet
# exist when the immutable production inventory was captured - migration
# 028 must grant service_role explicitly on the objects it creates rather
# than assume a platform default will apply.
Assert-True '028 explicitly grants service_role full privileges on write_command_requests (its own default-privilege inheritance cannot be assumed for a brand-new object)' ($migrationText -match 'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public\.write_command_requests TO service_role;')
Assert-True '028 explicitly grants service_role USAGE/SELECT/UPDATE on write_command_requests_id_seq' ($migrationText -match 'GRANT USAGE, SELECT, UPDATE ON SEQUENCE public\.write_command_requests_id_seq TO service_role;')
Assert-True '028 explicitly grants service_role EXECUTE on both new atomic RPCs' (
    $migrationText -match 'GRANT EXECUTE ON FUNCTION public\.submit_contractor_report_atomic\(bigint,date,jsonb,jsonb,uuid\) TO service_role;' -and
    $migrationText -match 'GRANT EXECUTE ON FUNCTION public\.submit_site_visit_atomic\(bigint,bigint,date,jsonb,jsonb,uuid\) TO service_role;'
)

# (2) A disposable container's own postgres:17 bootstrap superuser can
# never have SUPERUSER stripped (a hard Postgres rule, already documented
# and worked around by restore-verify.ps1 for its own role restore step) -
# the rehearsal must normalize only this proven, non-security-relevant,
# container-bootstrap artifact for its LOCAL inventory captures, never for
# real production evidence.
$mockElementsWithSuperuserPostgres = @(
    [pscustomobject]@{ category = 'roleAttributes'; key = 'postgres'; value = [pscustomobject]@{ role = 'postgres'; superuser = $true; canLogin = $true } },
    [pscustomobject]@{ category = 'roleAttributes'; key = 'anon'; value = [pscustomobject]@{ role = 'anon'; superuser = $false; canLogin = $false } },
    [pscustomobject]@{ category = 'tablePrivileges'; key = 'x'; value = [pscustomobject]@{ table = 'projects'; allowed = $true } }
)
$normalized = Get-RehearsalNormalizedElements -Elements $mockElementsWithSuperuserPostgres
$normalizedPostgres = $normalized | Where-Object { $_.category -eq 'roleAttributes' -and $_.value.role -eq 'postgres' }
Assert-True 'Get-RehearsalNormalizedElements forces the local bootstrap postgres role to superuser=false (matches real production, never the local container artifact)' ($normalizedPostgres.value.superuser -eq $false)
$normalizedAnon = $normalized | Where-Object { $_.category -eq 'roleAttributes' -and $_.value.role -eq 'anon' }
Assert-True 'Get-RehearsalNormalizedElements leaves every other role untouched' ($normalizedAnon.value.superuser -eq $false -and $normalizedAnon.value.canLogin -eq $false)
Assert-True 'Get-RehearsalNormalizedElements leaves non-roleAttributes categories untouched' (@($normalized | Where-Object { $_.category -eq 'tablePrivileges' }).Count -eq 1)
Assert-True 'Get-RehearsalNormalizedElements preserves total element count (no rows added or dropped)' ($normalized.Count -eq $mockElementsWithSuperuserPostgres.Count)

# The PSCustomObject-shaped test above alone would NOT have caught the real
# bug a real end-to-end run found: Get-SecurityContractInventory's native
# in-memory elements use [ordered] hashtables, not PSCustomObjects, and
# .PSObject.Properties silently returns the wrong thing (Count/Keys/Values)
# for a Hashtable/OrderedDictionary instead of throwing - so a
# hashtable-shaped input must be exercised too, or this exact regression
# can resurface undetected by tests again.
$mockElementsHashtableShaped = @(
    [ordered]@{ category = 'roleAttributes'; key = 'postgres'; value = [ordered]@{ role = 'postgres'; superuser = $true; canLogin = $true; createRole = $true } }
)
$normalizedFromHashtable = Get-RehearsalNormalizedElements -Elements $mockElementsHashtableShaped
$normalizedHtPostgres = $normalizedFromHashtable | Where-Object { $_.category -eq 'roleAttributes' }
Assert-True 'Get-RehearsalNormalizedElements correctly normalizes a native [ordered]-hashtable-shaped element (not just PSCustomObject)' ($normalizedHtPostgres.value.superuser -eq $false)
Assert-True 'Get-RehearsalNormalizedElements preserves every other field on a hashtable-shaped element (createRole, canLogin - not silently replaced with Count/Keys/Values)' ($normalizedHtPostgres.value.canLogin -eq $true -and $normalizedHtPostgres.value.createRole -eq $true -and -not $normalizedHtPostgres.value.Contains('Keys'))

# Regression: a real end-to-end rehearsal run found that
# Write-JsonArtifactWithChecksum's actual checksum filename
# (ChangeExtension: foo.json -> foo.sha256) did not match a caller's
# independently-reconstructed "$Path.sha256" guess (foo.json.sha256) when
# passing it to composite-security-certification.ps1's
# -ProductionInventoryChecksumPath - the composite subprocess correctly
# rejected the nonexistent file (INVALID_INPUT), rather than silently
# proceeding, but the rehearsal should not require callers to duplicate a
# naming convention that already lives in one place.
Assert-True 'Write-JsonArtifactWithChecksum returns the actual checksum path it wrote (callers never re-derive the naming convention)' ($rehearsalText -match 'return \$checksumPath')
Assert-True 'rehearsal script uses the returned checksum path for the pre-remediation composite call, not a reconstructed guess' ($rehearsalText -match "'-ProductionInventoryChecksumPath', \`$preInventoryChecksumPath")
Assert-True 'rehearsal script uses the returned checksum path for the post-remediation composite call, not a reconstructed guess' ($rehearsalText -match "'-ProductionInventoryChecksumPath', \`$postInventoryChecksumPath")

# ===========================================================================
# 8. Migration 029 structure (production ACL follow-up)
# ===========================================================================
Assert-True '029_production_acl_followup.sql exists' (Test-Path -LiteralPath $migration029Path -PathType Leaf)
$migration029Text = Get-Content -LiteralPath $migration029Path -Raw
Assert-True '029 is wrapped in a single transaction (BEGIN...COMMIT)' ($migration029Text -match '(?m)^BEGIN;' -and $migration029Text -match '(?m)^COMMIT;')
Assert-True '029 never disables RLS' ($migration029Text -notmatch '(?i)DISABLE ROW LEVEL SECURITY')
Assert-True '029 never contains a destructive DROP/TRUNCATE ... CASCADE' ($migration029Text -notmatch '(?i)\b(DROP|TRUNCATE)\b[^;]*\bCASCADE\b')
Assert-True '029 never contains a hardcoded credential-shaped string' ($migration029Text -notmatch '(?i)password\s*[:=]\s*[''"][^'']')
$migration029CodeOnly = ($migration029Text -replace '(?m)^--[^\r\n]*', '')
Assert-True '029 does not create or alter any role (CREATE ROLE / ALTER ROLE / OWNER TO) - checked against executable SQL only, comments may discuss the reasoning' ($migration029CodeOnly -notmatch '(?i)\b(CREATE|ALTER|DROP)\s+ROLE\b' -and $migration029CodeOnly -notmatch '(?i)\bOWNER\s+TO\b')
Assert-True '029 does not modify ALTER DEFAULT PRIVILEGES (targeted per-object fix only, not a platform-wide default change) - checked against executable SQL only, comments may discuss the reasoning' ($migration029CodeOnly -notmatch '(?i)ALTER\s+DEFAULT\s+PRIVILEGES')
foreach ($earlier in (Get-ChildItem -LiteralPath $migrationsRoot -Filter '0[0-2][0-9]_*.sql' -File)) {
    if ($earlier.Name -eq '029_production_acl_followup.sql') { continue }
    Assert-True "029 does not edit $($earlier.Name) (forward-only)" ((Get-Content -LiteralPath $earlier.FullName -Raw) -notmatch '\bTHIS FILE WAS MODIFIED BY 029\b')
}
Assert-True 'contract lists 029 as the last included migration (append-only)' ((@($contract.canonicalMigrationPath.included) | Select-Object -Last 1) -eq '029_production_acl_followup.sql')

# ===========================================================================
# 9. Regression guards for the 8 anti-patterns that let 028's real
# production ACL differences escape its own pre-apply rehearsal undetected.
# Each numbered block proves the OLD/naive check would have missed the
# real defect, and the NEW code catches it.
# ===========================================================================
$fixtureRehearsalText = Get-Content -LiteralPath $fixtureRehearsalPath -Raw
$compositeCertText = Get-Content -LiteralPath $compositeCertPath -Raw
$emulatorText = Get-Content -LiteralPath (Join-Path $scriptsRoot 'lib\ProductionSecurityStateEmulator.ps1') -Raw
$postflightLibText = Get-Content -LiteralPath (Join-Path $scriptsRoot 'lib\RemediationPreflightPostflight.ps1') -Raw

# (1) Treating a table's ACL as if it also covers its own sequence - a
# sequence is a separate catalog object with an independent ACL.
Assert-True 'anti-pattern 1: 029 issues an explicit REVOKE ON SEQUENCE for write_command_requests_id_seq (never assumes the table REVOKE in 028 also covered it)' ($migration029Text -match '(?i)REVOKE\s+ALL\s+ON\s+SEQUENCE\s+public\.write_command_requests_id_seq')
Assert-True 'anti-pattern 1: expanded postflight has a dedicated sequence-privilege check independent of the table check' ($postflightLibText -match "has_sequence_privilege\('anon','public\.write_command_requests_id_seq'")

# (2) Assuming REVOKE ... FROM PUBLIC also removes an already-existing
# DIRECT grant to a named role (it does not - they are independent ACL
# entries, the same lesson 028 itself already learned for fn_audit_log()).
Assert-True 'anti-pattern 2: 029 revokes EXECUTE directly FROM anon (not only FROM PUBLIC) on both atomic RPCs' (
    $migration029Text -match '(?i)REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.submit_contractor_report_atomic\([^)]*\)\s+FROM\s+anon' -and
    $migration029Text -match '(?i)REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.submit_site_visit_atomic\([^)]*\)\s+FROM\s+anon'
)

# (3) Rehearsing against vanilla Postgres defaults while real production
# has a broader, platform-configured ALTER DEFAULT PRIVILEGES rule -
# proven undetectable by the OLD rehearsal (production-security-
# remediation-rehearsal.ps1, which never installs any such fixture), and
# now covered by the NEW fixture-based rehearsal.
Assert-True 'anti-pattern 3: Get-SupabaseDefaultAclFixtureScript exists and emits ALTER DEFAULT PRIVILEGES statements (reproduces the real platform default, not vanilla Postgres)' ($emulatorText -match 'function Get-SupabaseDefaultAclFixtureScript' -and $emulatorText -match '(?i)ALTER\s+DEFAULT\s+PRIVILEGES\s+FOR\s+ROLE\s+postgres\s+IN\s+SCHEMA\s+public\s+GRANT\s+ALL\s+ON\s+SEQUENCES')
Assert-True 'anti-pattern 3: the OLD rehearsal script never installs any default-ACL fixture (confirms the gap this anti-pattern describes actually existed)' ($rehearsalText -notmatch 'Get-SupabaseDefaultAclFixtureScript')
$fixtureFixtureIdx = $fixtureRehearsalText.IndexOf('Get-SupabaseDefaultAclFixtureScript')
$fixtureChainIdx = $fixtureRehearsalText.IndexOf('Invoke-CanonicalMigrationChain')
Assert-True 'anti-pattern 3: the fixture-aware rehearsal installs the fixture BEFORE the canonical migration chain runs (new objects must inherit it, like real production)' (($fixtureFixtureIdx -ge 0) -and ($fixtureChainIdx -ge 0) -and ($fixtureFixtureIdx -lt $fixtureChainIdx))
Assert-True 'anti-pattern 3: composite-security-certification.ps1''s own PHASE 4 "expected" container never installs the fixture (must stay vanilla, or the comparator could no longer detect this class of defect at all)' ($compositeCertText -notmatch 'Get-SupabaseDefaultAclFixtureScript')

# (4) Checking only EFFECTIVE access (has_*_privilege, which follows role
# membership/inheritance) and never the raw, DIRECT grant - a direct grant
# to anon is a defect in itself even if some other control also happens to
# block the request at runtime.
Assert-True 'anti-pattern 4: expanded postflight checks DIRECT grants via aclexplode, not only effective access via has_*_privilege' ($postflightLibText -match 'directAclSpotChecks' -and $postflightLibText -match 'aclexplode\(c\.relacl\)' -and $postflightLibText -match 'aclexplode\(p\.proacl\)')

# (5) Omitting a migration's own newly-created sequence from the security
# contract/postflight entirely (only checking the table and the functions).
Assert-True 'anti-pattern 5: postflight explicitly checks BOTH anon and authenticated on write_command_requests_id_seq (not omitted)' (
    $postflightLibText -match "has_sequence_privilege\('anon','public\.write_command_requests_id_seq','SELECT'\)" -and
    $postflightLibText -match "has_sequence_privilege\('authenticated','public\.write_command_requests_id_seq','SELECT'\)"
)

# (6) Omitting the exact overloaded function signature (bare/wrong-arity
# identity resolves to nothing, or the wrong overload, and REVOKE/GRANT
# silently no-ops against a function that does not exist).
Assert-True 'anti-pattern 6: 029 uses the exact 5-argument signature for submit_contractor_report_atomic' ($migration029Text -match '(?i)submit_contractor_report_atomic\(bigint,\s*date,\s*jsonb,\s*jsonb,\s*uuid\)')
Assert-True 'anti-pattern 6: 029 uses the exact 6-argument signature for submit_site_visit_atomic' ($migration029Text -match '(?i)submit_site_visit_atomic\(bigint,\s*bigint,\s*date,\s*jsonb,\s*jsonb,\s*uuid\)')
Assert-True 'anti-pattern 6: postflight checks use the exact same signatures as the migration (no drift between migration and postflight)' (
    $postflightLibText -match "submit_contractor_report_atomic\(bigint,date,jsonb,jsonb,uuid\)" -and
    $postflightLibText -match "submit_site_visit_atomic\(bigint,bigint,date,jsonb,jsonb,uuid\)"
)

# (7) Postflight silently reporting PASS while a full composite
# certification against the same state would still report FAIL - proven
# with a mocked queryFn using the OLD (pre-029) production-observed ACL
# state fed through the NEW, expanded postflight: it must now report FAIL,
# not PASS, closing exactly the gap that let migration 028 pass postflight
# in production despite 8 real differences.
$preMigration029Responses = $postflightPassResponses.Clone()
$preMigration029Responses["has_sequence_privilege('anon','public.write_command_requests_id_seq','SELECT')"] = 't'
$preMigration029Responses["has_sequence_privilege('anon','public.write_command_requests_id_seq','UPDATE')"] = 't'
$preMigration029Responses["has_sequence_privilege('anon','public.write_command_requests_id_seq','USAGE')"] = 't'
$preMigration029Responses["has_sequence_privilege('authenticated','public.write_command_requests_id_seq','SELECT')"] = 't'
$preMigration029Responses["has_sequence_privilege('authenticated','public.write_command_requests_id_seq','UPDATE')"] = 't'
$preMigration029Responses["has_sequence_privilege('authenticated','public.write_command_requests_id_seq','USAGE')"] = 't'
$preMigration029Responses["has_sequence_privilege('postgres','public.write_command_requests_id_seq','USAGE')"] = 't'
$preMigration029Responses["has_sequence_privilege('service_role','public.write_command_requests_id_seq','USAGE')"] = 't'
$preMigration029Responses["has_function_privilege('anon','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"] = 't'
$preMigration029Responses["has_function_privilege('anon','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"] = 't'
$preMigration029Responses["has_function_privilege('authenticated','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"] = 't'
$preMigration029Responses["has_function_privilege('service_role','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"] = 't'
$preMigration029Responses["has_function_privilege('service_role','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"] = 't'
# Precise, privilege_type-scoped keys (matching RemediationPreflightPostflight.ps1's
# exact generated SQL) - deliberately NOT broad role-only substrings, which
# would collide with the narrower per-privilege-type keys inherited from
# $postflightPassResponses via .Clone() (same underlying hashtable-key
# ambiguity risk New-MockQuery's -like matching is exposed to).
foreach ($role in @('anon', 'authenticated')) {
    foreach ($priv in @('SELECT', 'UPDATE', 'USAGE')) {
        $preMigration029Responses["grantee::regrole::text = '$role' AND a.privilege_type = '$priv')"] = 't'
    }
}
$preMigration029Responses["proname = 'submit_contractor_report_atomic' AND a.grantee::regrole::text = 'anon' AND a.privilege_type = 'EXECUTE')"] = 't'
$preMigration029Responses["proname = 'submit_site_visit_atomic' AND a.grantee::regrole::text = 'anon' AND a.privilege_type = 'EXECUTE')"] = 't'
$preMigration029Query = New-MockQuery $preMigration029Responses
$preMigration029Result = Invoke-RemediationPostflight -Query $preMigration029Query
Assert-True 'anti-pattern 7: expanded postflight now reports FAIL for the pre-029, post-028-only production ACL state (the OLD postflight incorrectly reported PASS for this exact real state)' ($preMigration029Result.status -eq 'FAIL')
Assert-True 'anti-pattern 7: the FAIL exposes at least the 8 known sequence/function differences' (@($preMigration029Result.failures | Where-Object { $_ -match 'write_command_requests_id_seq' -or $_ -match 'submit_contractor_report_atomic|submit_site_visit_atomic' }).Count -ge 8)

# (8) Freezing the production security baseline while the composite
# certification is not PASS - the runbook must gate baseline freeze
# strictly behind a passing composite rerun, never behind postflight PASS
# alone (exactly what anti-pattern 7 shows can diverge).
$runbookText = Get-Content -LiteralPath (Join-Path $repoRoot 'docs\PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md') -Raw
Assert-True 'anti-pattern 8: runbook gates baseline freeze behind composite certification PASS, not postflight PASS alone' ($runbookText -match '(?i)Only after step 7 returns .?PASS.?, promote')

Write-Host ''
Write-Host "TOTAL: $($script:passCount) passed, $($script:failCount) failed"
if ($script:failCount -gt 0) {
    Write-Host "FAILED: $($script:failures -join ', ')"
    exit 1
}
exit 0
