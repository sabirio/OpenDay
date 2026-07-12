# Remediation Preflight / Postflight
#
# Read-only checks around applying scripts/../weekly-tracker/src/migrations/
# 028_production_security_reconciliation.sql. Both operate purely through a
# $Query callback (same raw-SQL-in, wrapped-by-caller convention used
# throughout this project) so they work identically against a disposable
# rehearsal container today and, unmodified, against a real read-only
# production connection in the reviewed runbook later - this module itself
# never opens a connection or accepts a connection string.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RemediationTargetObjects = @(
    @{ type = 'table'; name = 'write_command_requests' },
    @{ type = 'function'; name = 'submit_contractor_report_atomic'; args = 'bigint, date, jsonb, jsonb, uuid' },
    @{ type = 'function'; name = 'submit_site_visit_atomic'; args = 'bigint, bigint, date, jsonb, jsonb, uuid' },
    @{ type = 'function'; name = 'handle_new_user'; args = '' },
    @{ type = 'function'; name = 'rls_auto_enable'; args = '' }
)

function Invoke-RemediationPreflight {
    param([Parameter(Mandatory)][scriptblock]$Query)

    $result = [ordered]@{
        status = 'UNSAFE_STATE'
        checkedAtUtc = [DateTime]::UtcNow.ToString('o')
        postgresVersion = $null
        migrationHistoryPresent = $false
        objects = [ordered]@{}
        conflicts = @()
        reasons = @()
    }

    $verSql = "SELECT current_setting('server_version_num')"
    $result.postgresVersion = (& $Query (New-ReadOnlyCatalogScript -CatalogQuery $verSql)).Trim()

    $histSql = "SELECT to_regnamespace('supabase_migrations') IS NOT NULL"
    $result.migrationHistoryPresent = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $histSql)).Trim() -eq 't')

    $tableSql = "SELECT to_regclass('public.write_command_requests') IS NOT NULL"
    $tableExists = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $tableSql)).Trim() -eq 't')
    $result.objects['write_command_requests'] = $tableExists

    foreach ($fn in @(
        @{ name = 'submit_contractor_report_atomic'; args = 'bigint,date,jsonb,jsonb,uuid' },
        @{ name = 'submit_site_visit_atomic'; args = 'bigint,bigint,date,jsonb,jsonb,uuid' },
        @{ name = 'handle_new_user'; args = '' },
        @{ name = 'rls_auto_enable'; args = '' }
    )) {
        $fnSql = "SELECT to_regprocedure('public.$($fn.name)($($fn.args))') IS NOT NULL"
        $exists = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $fnSql)).Trim() -eq 't')
        $result.objects[$fn.name] = $exists
    }

    $allPresent = -not ($result.objects.Values -contains $false)
    $nonePresent = -not ($result.objects.Values -contains $true)

    $conflictSql = "SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema='auth' AND event_object_table='users' AND trigger_name = 'on_auth_user_created' AND action_statement NOT LIKE '%handle_new_user%'"
    $conflictRaw = (& $Query (New-ReadOnlyCatalogScript -CatalogQuery $conflictSql)).Trim()
    if (-not [string]::IsNullOrWhiteSpace($conflictRaw)) {
        $result.conflicts += "trigger on_auth_user_created exists but does not call handle_new_user() - manual review required"
    }

    if ($result.conflicts.Count -gt 0) {
        $result.status = 'BLOCKED'
        $result.reasons += 'conflicting object(s) detected that this migration does not know how to reconcile safely'
    } elseif ($allPresent) {
        $result.status = 'ALREADY_REMEDIATED'
        $result.reasons += 'all remediation target objects already present - migration is expected to be a safe no-op'
    } elseif ($nonePresent -or $tableExists -eq $false) {
        $result.status = 'READY'
        $result.reasons += 'target state is a known, handled starting point (fresh, production-like-026-only, or partial)'
    } else {
        $result.status = 'READY'
        $result.reasons += 'partial target state detected; migration statements are individually idempotent and will reconcile it'
    }

    return $result
}

function Invoke-RemediationPostflight {
    param([Parameter(Mandatory)][scriptblock]$Query)

    $result = [ordered]@{
        status = 'FAIL'
        checkedAtUtc = [DateTime]::UtcNow.ToString('o')
        objects = [ordered]@{}
        aclSpotChecks = [ordered]@{}
        directAclSpotChecks = [ordered]@{}
        failures = @()
    }

    foreach ($fn in @(
        @{ name = 'submit_contractor_report_atomic'; args = 'bigint,date,jsonb,jsonb,uuid' },
        @{ name = 'submit_site_visit_atomic'; args = 'bigint,bigint,date,jsonb,jsonb,uuid' },
        @{ name = 'handle_new_user'; args = '' },
        @{ name = 'rls_auto_enable'; args = '' }
    )) {
        $fnSql = "SELECT to_regprocedure('public.$($fn.name)($($fn.args))') IS NOT NULL"
        $exists = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $fnSql)).Trim() -eq 't')
        $result.objects[$fn.name] = $exists
        if (-not $exists) { $result.failures += "required function public.$($fn.name)($($fn.args)) is missing" }
    }

    $tableSql = "SELECT to_regclass('public.write_command_requests') IS NOT NULL"
    $tableExists = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $tableSql)).Trim() -eq 't')
    $result.objects['write_command_requests'] = $tableExists
    if (-not $tableExists) { $result.failures += 'required table public.write_command_requests is missing' }

    $triggerSql = "SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal"
    $triggerCount = [int]((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $triggerSql)).Trim())
    $result.objects['on_auth_user_created_trigger'] = ($triggerCount -eq 1)
    if ($triggerCount -ne 1) { $result.failures += "expected exactly 1 on_auth_user_created trigger, found $triggerCount" }

    $eventTriggerSql = "SELECT COUNT(*) FROM pg_event_trigger WHERE evtname = 'ensure_rls'"
    $eventTriggerCount = [int]((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $eventTriggerSql)).Trim())
    $result.objects['ensure_rls_event_trigger'] = ($eventTriggerCount -eq 1)
    if ($eventTriggerCount -ne 1) { $result.failures += "expected exactly 1 ensure_rls event trigger, found $eventTriggerCount" }

    # Effective privilege checks (has_*_privilege - accounts for role
    # membership/inheritance, matching what a real request through
    # PostgREST/the pooler would actually be authorized to do).
    $aclChecks = @(
        @{ label = 'anon has no SELECT on projects (drift removed)'; sql = "SELECT has_table_privilege('anon','public.projects','SELECT')"; expect = 'f' },
        @{ label = 'authenticated retains SELECT on projects (026 grant preserved)'; sql = "SELECT has_table_privilege('authenticated','public.projects','SELECT')"; expect = 't' },
        @{ label = 'authenticated has no TRUNCATE on projects (drift removed)'; sql = "SELECT has_table_privilege('authenticated','public.projects','TRUNCATE')"; expect = 'f' },
        @{ label = 'authenticated retains USAGE on projects_id_seq (runtime-required)'; sql = "SELECT has_sequence_privilege('authenticated','public.projects_id_seq','USAGE')"; expect = 't' },
        @{ label = 'authenticated has no SELECT on projects_id_seq (excess removed)'; sql = "SELECT has_sequence_privilege('authenticated','public.projects_id_seq','SELECT')"; expect = 'f' },
        @{ label = 'anon has no EXECUTE on submit_contractor_report'; sql = "SELECT has_function_privilege('anon','public.submit_contractor_report(bigint,date,jsonb,jsonb)','EXECUTE')"; expect = 'f' },
        @{ label = 'authenticated has EXECUTE on submit_contractor_report_atomic'; sql = "SELECT has_function_privilege('authenticated','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 't' },
        @{ label = 'anon has no EXECUTE on fn_audit_log'; sql = "SELECT has_function_privilege('anon','public.fn_audit_log()','EXECUTE')"; expect = 'f' },
        # --- migration 029 coverage: closes the gap that let migration 028's
        # 8 real production ACL differences (write_command_requests_id_seq,
        # both atomic RPCs' anon EXECUTE) pass postflight undetected. See
        # work/production-029-approval-evidence/acl-analysis.json for the
        # proven desired contract these checks assert.
        @{ label = 'anon has no SELECT on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','SELECT')"; expect = 'f' },
        @{ label = 'anon has no UPDATE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','UPDATE')"; expect = 'f' },
        @{ label = 'anon has no USAGE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('anon','public.write_command_requests_id_seq','USAGE')"; expect = 'f' },
        @{ label = 'authenticated has no SELECT on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','SELECT')"; expect = 'f' },
        @{ label = 'authenticated has no UPDATE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','UPDATE')"; expect = 'f' },
        @{ label = 'authenticated has no USAGE on write_command_requests_id_seq'; sql = "SELECT has_sequence_privilege('authenticated','public.write_command_requests_id_seq','USAGE')"; expect = 'f' },
        @{ label = 'postgres retains USAGE on write_command_requests_id_seq (owner, unaffected)'; sql = "SELECT has_sequence_privilege('postgres','public.write_command_requests_id_seq','USAGE')"; expect = 't' },
        @{ label = 'service_role retains USAGE on write_command_requests_id_seq (platform-managed, unaffected)'; sql = "SELECT has_sequence_privilege('service_role','public.write_command_requests_id_seq','USAGE')"; expect = 't' },
        @{ label = 'anon has no EXECUTE on submit_contractor_report_atomic'; sql = "SELECT has_function_privilege('anon','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 'f' },
        @{ label = 'anon has no EXECUTE on submit_site_visit_atomic'; sql = "SELECT has_function_privilege('anon','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 'f' },
        @{ label = 'authenticated has EXECUTE on submit_site_visit_atomic'; sql = "SELECT has_function_privilege('authenticated','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 't' },
        @{ label = 'service_role has EXECUTE on submit_contractor_report_atomic (platform-managed, unaffected)'; sql = "SELECT has_function_privilege('service_role','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 't' },
        @{ label = 'service_role has EXECUTE on submit_site_visit_atomic (platform-managed, unaffected)'; sql = "SELECT has_function_privilege('service_role','public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 't' }
    )
    foreach ($check in $aclChecks) {
        $actual = (& $Query (New-ReadOnlyCatalogScript -CatalogQuery $check.sql)).Trim()
        $pass = ($actual -eq $check.expect)
        $result.aclSpotChecks[$check.label] = $pass
        if (-not $pass) { $result.failures += "$($check.label): expected=$($check.expect) actual=$actual" }
    }

    # Direct (raw ACL / aclexplode) checks - deliberately independent of
    # has_*_privilege(), which reports EFFECTIVE access through role
    # membership/inheritance and can therefore mask an unwanted direct
    # grant that happens to be shadowed or redundant elsewhere. This is
    # exactly anti-pattern #4 (checking only effective access) - a direct
    # grant to anon is itself a defect even if some other, unrelated
    # control also happens to block the request at runtime, because it
    # is an independent, silently-exploitable privilege escalation path
    # (e.g. a future RLS/policy change or a different client library that
    # does not go through the same runtime guard).
    $directAclChecks = @(
        @{ label = 'anon has no direct SELECT grant on write_command_requests_id_seq'; role = 'anon'; privilege = 'SELECT'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'anon has no direct UPDATE grant on write_command_requests_id_seq'; role = 'anon'; privilege = 'UPDATE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'anon has no direct USAGE grant on write_command_requests_id_seq'; role = 'anon'; privilege = 'USAGE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'authenticated has no direct SELECT grant on write_command_requests_id_seq'; role = 'authenticated'; privilege = 'SELECT'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'authenticated has no direct UPDATE grant on write_command_requests_id_seq'; role = 'authenticated'; privilege = 'UPDATE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'authenticated has no direct USAGE grant on write_command_requests_id_seq'; role = 'authenticated'; privilege = 'USAGE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $false },
        @{ label = 'postgres retains direct USAGE grant on write_command_requests_id_seq'; role = 'postgres'; privilege = 'USAGE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $true },
        @{ label = 'service_role retains direct USAGE grant on write_command_requests_id_seq'; role = 'service_role'; privilege = 'USAGE'; objectType = 'sequence'; objectName = 'write_command_requests_id_seq'; expect = $true },
        @{ label = 'anon has no direct EXECUTE grant on submit_contractor_report_atomic'; role = 'anon'; privilege = 'EXECUTE'; objectType = 'function'; objectName = 'submit_contractor_report_atomic'; expect = $false },
        @{ label = 'anon has no direct EXECUTE grant on submit_site_visit_atomic'; role = 'anon'; privilege = 'EXECUTE'; objectType = 'function'; objectName = 'submit_site_visit_atomic'; expect = $false },
        @{ label = 'authenticated retains direct EXECUTE grant on submit_contractor_report_atomic'; role = 'authenticated'; privilege = 'EXECUTE'; objectType = 'function'; objectName = 'submit_contractor_report_atomic'; expect = $true },
        @{ label = 'authenticated retains direct EXECUTE grant on submit_site_visit_atomic'; role = 'authenticated'; privilege = 'EXECUTE'; objectType = 'function'; objectName = 'submit_site_visit_atomic'; expect = $true }
    )
    foreach ($check in $directAclChecks) {
        $sql = if ($check.objectType -eq 'sequence') {
            "SELECT EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.relname = '$($check.objectName)' AND c.relkind = 'S' AND a.grantee::regrole::text = '$($check.role)' AND a.privilege_type = '$($check.privilege)')"
        } else {
            "SELECT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.proname = '$($check.objectName)' AND a.grantee::regrole::text = '$($check.role)' AND a.privilege_type = '$($check.privilege)')"
        }
        $actual = ((& $Query (New-ReadOnlyCatalogScript -CatalogQuery $sql)).Trim() -eq 't')
        $pass = ($actual -eq $check.expect)
        $result.directAclSpotChecks[$check.label] = $pass
        if (-not $pass) { $result.failures += "$($check.label): expected=$($check.expect) actual=$actual" }
    }

    $result.status = if ($result.failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
    return $result
}
