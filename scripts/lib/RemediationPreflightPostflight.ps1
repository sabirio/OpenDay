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

    $aclChecks = @(
        @{ label = 'anon has no SELECT on projects (drift removed)'; sql = "SELECT has_table_privilege('anon','public.projects','SELECT')"; expect = 'f' },
        @{ label = 'authenticated retains SELECT on projects (026 grant preserved)'; sql = "SELECT has_table_privilege('authenticated','public.projects','SELECT')"; expect = 't' },
        @{ label = 'authenticated has no TRUNCATE on projects (drift removed)'; sql = "SELECT has_table_privilege('authenticated','public.projects','TRUNCATE')"; expect = 'f' },
        @{ label = 'authenticated retains USAGE on projects_id_seq (runtime-required)'; sql = "SELECT has_sequence_privilege('authenticated','public.projects_id_seq','USAGE')"; expect = 't' },
        @{ label = 'authenticated has no SELECT on projects_id_seq (excess removed)'; sql = "SELECT has_sequence_privilege('authenticated','public.projects_id_seq','SELECT')"; expect = 'f' },
        @{ label = 'anon has no EXECUTE on submit_contractor_report'; sql = "SELECT has_function_privilege('anon','public.submit_contractor_report(bigint,date,jsonb,jsonb)','EXECUTE')"; expect = 'f' },
        @{ label = 'authenticated has EXECUTE on submit_contractor_report_atomic'; sql = "SELECT has_function_privilege('authenticated','public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)','EXECUTE')"; expect = 't' },
        @{ label = 'anon has no EXECUTE on fn_audit_log'; sql = "SELECT has_function_privilege('anon','public.fn_audit_log()','EXECUTE')"; expect = 'f' }
    )
    foreach ($check in $aclChecks) {
        $actual = (& $Query (New-ReadOnlyCatalogScript -CatalogQuery $check.sql)).Trim()
        $pass = ($actual -eq $check.expect)
        $result.aclSpotChecks[$check.label] = $pass
        if (-not $pass) { $result.failures += "$($check.label): expected=$($check.expect) actual=$actual" }
    }

    $result.status = if ($result.failures.Count -eq 0) { 'PASS' } else { 'FAIL' }
    return $result
}
