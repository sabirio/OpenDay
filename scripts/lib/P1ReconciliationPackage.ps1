$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-P1Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-P1Migration037ColumnContract {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$MigrationPath)

    if (-not (Test-Path -LiteralPath $MigrationPath -PathType Leaf)) {
        throw "Migration 037 source is missing: $MigrationPath"
    }

    $text = [IO.File]::ReadAllText($MigrationPath, [Text.UTF8Encoding]::new($false, $true))
    $matches = [regex]::Matches(
        $text,
        '(?im)^\s*ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)\s+([^;\r\n]+?)[,;]\s*$'
    )
    $columns = @(
        foreach ($match in $matches) {
            $definition = $match.Groups[2].Value.Trim()
            [pscustomobject][ordered]@{
                Name = $match.Groups[1].Value
                Type = $definition
                Nullable = ($definition -notmatch '(?i)\bNOT\s+NULL\b')
                HasDefault = ($definition -match '(?i)\bDEFAULT\b')
            }
        }
    )

    if ($columns.Count -ne 10) {
        throw "Migration 037 must define exactly ten project-profile columns; found $($columns.Count)."
    }
    if (@($columns | Where-Object { -not $_.Nullable -or $_.HasDefault }).Count -ne 0) {
        throw 'Migration 037 project-profile columns must all be nullable and have no default.'
    }
    if (@($columns.Name | Sort-Object -Unique).Count -ne 10) {
        throw 'Migration 037 project-profile column names must be unique.'
    }

    return $columns
}

function ConvertTo-P1SqlIdentifierList {
    param([Parameter(Mandatory)][object[]]$ColumnContract)
    return (@($ColumnContract | ForEach-Object { "'$($_.Name)'" }) -join ',')
}

function Test-P1Migration037ColumnSet {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$MigrationPath,
        [Parameter(Mandatory)][string[]]$ColumnNames
    )
    $expected = @((Get-P1Migration037ColumnContract -MigrationPath $MigrationPath).Name | Sort-Object)
    $actual = @($ColumnNames | Sort-Object -Unique)
    return ($actual.Count -eq 10 -and ($actual -join "`n") -ceq ($expected -join "`n"))
}

function Get-P1Migration037PostflightSql {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$MigrationPath)

    $columnSql = ConvertTo-P1SqlIdentifierList (Get-P1Migration037ColumnContract -MigrationPath $MigrationPath)
    return @"
SELECT CASE
  WHEN count(*) = 10
   AND count(*) FILTER (WHERE is_nullable = 'YES') = 10
   AND count(*) FILTER (WHERE column_default IS NULL) = 10
    THEN 'MIGRATION_037_POSTFLIGHT=PASS'
  ELSE 'MIGRATION_037_POSTFLIGHT=FAIL'
END
FROM information_schema.columns
WHERE table_schema='public' AND table_name='projects'
  AND column_name IN ($columnSql);
"@
}

function Import-P1ReconciliationContract {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [string]$ManifestPath = 'scripts/manifests/p1-mixed-state-reconciliation.psd1'
    )
    $root = (Resolve-Path -LiteralPath $RepoRoot).Path
    $path = if ([IO.Path]::IsPathRooted($ManifestPath)) { $ManifestPath } else { Join-Path $root $ManifestPath }
    $manifest = Import-PowerShellDataFile -LiteralPath $path
    $expectedOrder = @(41,42,43,44,45,46,49,51,53,54,55,56,57,58)
    $actualOrder = @($manifest.includedMigrations | ForEach-Object { [int]$_.number })
    if (($actualOrder -join ',') -cne ($expectedOrder -join ',')) { throw 'P1 migration order differs from the approved contract.' }
    if ((@($manifest.skippedSupersededMigrations | ForEach-Object { [int]$_.number }) -join ',') -cne '47,48,50,52') {
        throw 'P1 superseded-migration exclusion set differs from the approved contract.'
    }
    foreach ($migration in $manifest.includedMigrations) {
        $source = Join-Path $root (Join-Path $manifest.migrationsDirectory $migration.file)
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing migration: $($migration.file)" }
        $actual = Get-P1Sha256 $source
        if ($actual -cne $migration.sha256) { throw "Migration SHA-256 mismatch: $($migration.file) expected=$($migration.sha256) actual=$actual" }
    }
    $profileRepair = $manifest.explicitForwardReconciliation.projectProfileSchemaRepair
    $profileSource = Join-Path $root (Join-Path $manifest.migrationsDirectory $profileRepair.sourceMigration)
    if (-not (Test-Path -LiteralPath $profileSource -PathType Leaf)) { throw "Missing project-profile repair source: $($profileRepair.sourceMigration)" }
    $profileActual = Get-P1Sha256 $profileSource
    if ($profileActual -cne $profileRepair.sourceSha256) { throw "Project-profile repair SHA-256 mismatch: expected=$($profileRepair.sourceSha256) actual=$profileActual" }
    $profileColumns = Get-P1Migration037ColumnContract -MigrationPath $profileSource
    if ($profileColumns.Count -ne [int]$profileRepair.requiredPostColumnCount) {
        throw 'Migration 037 parsed column count differs from the reconciliation manifest.'
    }
    return [pscustomobject]@{ RepoRoot=$root; ManifestPath=$path; Manifest=$manifest }
}

function Remove-P1TopLevelTransactionWrapper {
    param([Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][string]$File)
    $lines = $Text.Replace("`r`n","`n") -split "`n"
    $begin = @($lines | Where-Object { $_ -ceq 'BEGIN;' }).Count
    $commit = @($lines | Where-Object { $_ -ceq 'COMMIT;' }).Count
    if ($begin -ne 1 -or $commit -ne 1) { throw "$File must contain exactly one exact top-level BEGIN; and COMMIT; wrapper." }
    return (($lines | Where-Object { $_ -cne 'BEGIN;' -and $_ -cne 'COMMIT;' }) -join "`n")
}

function New-P1ReconciliationSql {
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$OutputPath,
        [string]$ManifestPath = 'scripts/manifests/p1-mixed-state-reconciliation.psd1'
    )
    $contract = Import-P1ReconciliationContract -RepoRoot $RepoRoot -ManifestPath $ManifestPath
    $manifest = $contract.Manifest
    $profileRepair = $manifest.explicitForwardReconciliation.projectProfileSchemaRepair
    $profileSource = Join-Path $contract.RepoRoot (Join-Path $manifest.migrationsDirectory $profileRepair.sourceMigration)
    $profileColumnSql = ConvertTo-P1SqlIdentifierList (Get-P1Migration037ColumnContract -MigrationPath $profileSource)
    $wrapped = @(41,42,43,44,45,58)
    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add("\set ON_ERROR_STOP on`n\echo P1_RECONCILIATION_BEGIN`nBEGIN;")
    $preconditionSql = @'
DO $p1_pre$
DECLARE
  v text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name IN ('family','company_id')) THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: templates family/company_id must both be absent';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN
      (__P1_037_COLUMNS__)) <> 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: project profile columns must all be absent';
  END IF;
  IF (SELECT count(*) FROM public.templates WHERE id IN ('dc92175a-251c-45ab-a4fd-c83c1c668ef4','e4ef4d98-5688-4d12-9fca-2d7cded88d29')) <> 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: 041/043 seed already exists';
  END IF;
  SELECT id::text||'|'||md5(data::text)||'|'||is_active::text INTO v FROM public.templates WHERE id='e330a625-d0fd-48ef-ba5f-e96a75e67e6b';
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|cf63f05ba67c26e027c01c242dcb36f5|true' THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: legacy template fingerprint %', v;
  END IF;
  SELECT template_id::text||'|'||md5(COALESCE(scope::text,'<SQL NULL>')) INTO v FROM public.projects WHERE id=127;
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|aa9facc31307489b1ede47085d2adff9' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: project 127 %',v; END IF;
  SELECT template_id::text||'|'||md5(COALESCE(scope::text,'<SQL NULL>')) INTO v FROM public.projects WHERE id=143;
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|b63330187ce763bf90cf8573a83b28f2' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: project 143 %',v; END IF;
  IF (SELECT count(*) FROM public.projects p LEFT JOIN public.templates t ON t.id=p.template_id WHERE p.template_id IS NOT NULL AND t.id IS NULL) <> 0 THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: orphan template pins';
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid='public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure;
  IF v IS DISTINCT FROM '94ae61e04f32b5917edd78063bf12f5f' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: contractor function %',v; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid='public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)'::regprocedure;
  IF v IS DISTINCT FROM 'd2a510a8c1ce8977987cc69dde48fa4e' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: site function %',v; END IF;
  IF to_regclass('public.project_schedule_versions') IS NOT NULL OR to_regclass('public.project_schedule_version_tasks') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='schedule_ownership_mode')
     OR to_regprocedure('public.save_contractor_schedule_draft(bigint,jsonb,uuid)') IS NOT NULL
     OR to_regprocedure('public.submit_contractor_schedule(bigint,uuid,text)') IS NOT NULL
     OR to_regprocedure('public.request_schedule_changes(bigint,text,uuid)') IS NOT NULL
     OR to_regprocedure('public.approve_schedule_submission(bigint,text,uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: schedule stack is not exactly absent'; END IF;
  SELECT convalidated::text||'|'||confmatchtype::text||'|'||confupdtype::text||'|'||confdeltype::text||'|'||condeferrable::text||'|'||condeferred::text INTO v
    FROM pg_constraint WHERE conname='projects_template_id_fkey' AND conrelid='public.projects'::regclass;
  IF v IS DISTINCT FROM 'true|s|a|a|false|false' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: projects_template_id_fkey %',v; END IF;
  SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='write_command_requests')::text||'|'||
         (SELECT count(*) FROM pg_constraint WHERE conrelid='public.write_command_requests'::regclass)::text||'|'||
         (SELECT count(*) FROM pg_index WHERE indrelid='public.write_command_requests'::regclass)::text||'|'||
         (SELECT relrowsecurity::text FROM pg_class WHERE oid='public.write_command_requests'::regclass)||'|'||
         (SELECT count(*) FROM pg_policy WHERE polrelid='public.write_command_requests'::regclass)::text||'|'||
         (to_regclass('public.write_command_requests_id_seq') IS NOT NULL)::text INTO v;
  IF v IS DISTINCT FROM '9|4|2|true|0|true' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: write_command_requests %',v; END IF;
END
$p1_pre$;
'@
    $parts.Add($preconditionSql.Replace('__P1_037_COLUMNS__', $profileColumnSql))
    $profileText = [IO.File]::ReadAllText($profileSource, [Text.UTF8Encoding]::new($false, $true)).Replace("`r`n","`n")
    if ($profileText -match '(?m)^(BEGIN;|COMMIT;)$') { throw 'Project-profile repair source must not contain a transaction wrapper.' }
    $parts.Add("\echo P1_FORWARD_REPAIR $($profileRepair.sourceMigration) SHA256=$($profileRepair.sourceSha256)`n$profileText")
    foreach ($migration in $manifest.includedMigrations) {
        $source = Join-Path $contract.RepoRoot (Join-Path $manifest.migrationsDirectory $migration.file)
        $text = [IO.File]::ReadAllText($source, [Text.UTF8Encoding]::new($false, $true)).Replace("`r`n","`n")
        if ($wrapped -contains [int]$migration.number) { $text = Remove-P1TopLevelTransactionWrapper -Text $text -File $migration.file }
        elseif ($text -match '(?m)^(BEGIN;|COMMIT;)$') { throw "Unexpected top-level transaction wrapper in $($migration.file)." }
        $parts.Add("\echo P1_MIGRATION $($migration.file) SHA256=$($migration.sha256)`n$text")
    }
    $postconditionSql = @'
-- Production carries broad default ACLs. Normalize every relation created by
-- this reconciliation without changing pg_default_acl itself.
REVOKE ALL ON TABLE public.project_schedule_versions, public.project_schedule_version_tasks
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_schedule_versions, public.project_schedule_version_tasks
  TO authenticated;
REVOKE ALL ON SEQUENCE public.project_schedule_versions_id_seq, public.project_schedule_version_tasks_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- Trigger-only functions are owner-only. User-facing RPC ACLs remain as
-- defined by 055/058 (authenticated and, where canonical, service_role).
REVOKE ALL ON FUNCTION public.prevent_referenced_template_semantic_change()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_schedule_version_task_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_scope_mutation_during_review()
  FROM PUBLIC, anon, authenticated, service_role;

DO $p1_fk$
DECLARE v text;
BEGIN
  SELECT convalidated::text||'|'||confmatchtype::text||'|'||confupdtype::text||'|'||confdeltype::text||'|'||condeferrable::text||'|'||condeferred::text INTO v
    FROM pg_constraint WHERE conname='projects_template_id_fkey' AND conrelid='public.projects'::regclass;
  IF v IS DISTINCT FROM 'true|s|a|a|false|false' THEN RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: FK changed before explicit repair %',v; END IF;
  IF EXISTS (SELECT 1 FROM public.projects p LEFT JOIN public.templates t ON t.id=p.template_id WHERE p.template_id IS NOT NULL AND t.id IS NULL) THEN
    RAISE EXCEPTION 'RECONCILIATION_PRECONDITION_FAIL: orphan pins before FK repair';
  END IF;
  ALTER TABLE public.projects DROP CONSTRAINT projects_template_id_fkey;
  ALTER TABLE public.projects ADD CONSTRAINT projects_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON UPDATE NO ACTION ON DELETE RESTRICT;
END
$p1_fk$;

DO $p1_post$
DECLARE v text;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name IN ('family','company_id')) <> 2 THEN RAISE EXCEPTION 'P1_POST_FAIL: template columns'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN
      (__P1_037_COLUMNS__)) <> 10 THEN RAISE EXCEPTION 'P1_POST_FAIL: project profile columns'; END IF;
  SELECT id::text||'|'||md5(data::text)||'|'||is_active::text INTO v FROM public.templates WHERE id='e330a625-d0fd-48ef-ba5f-e96a75e67e6b';
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|cf63f05ba67c26e027c01c242dcb36f5|true' THEN RAISE EXCEPTION 'P1_POST_FAIL: legacy template %',v; END IF;
  SELECT family||'|'||(data->>'schemaVersion')||'|'||(SELECT count(*) FROM jsonb_path_query(data,'$.zones[*].categories[*].workPackages[*]'))::text||'|'||is_active::text INTO v FROM public.templates WHERE id='dc92175a-251c-45ab-a4fd-c83c1c668ef4';
  IF v IS DISTINCT FROM 'retail-fitout-v2|1|91|true' THEN RAISE EXCEPTION 'P1_POST_FAIL: canonical v1 %',v; END IF;
  SELECT (data->>'schemaVersion')||'|'||(SELECT count(*) FROM jsonb_path_query(data,'$.zones[*].categories[*].workPackages[*]'))::text||'|'||jsonb_array_length(data->'defaultScope'->'workPackageIds')::text||'|'||is_active::text INTO v FROM public.templates WHERE id='e4ef4d98-5688-4d12-9fca-2d7cded88d29';
  IF v IS DISTINCT FROM '2|221|78|false' THEN RAISE EXCEPTION 'P1_POST_FAIL: master catalog %',v; END IF;
  SELECT template_id::text||'|'||md5(COALESCE(scope::text,'<SQL NULL>')) INTO v FROM public.projects WHERE id=127;
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|aa9facc31307489b1ede47085d2adff9' THEN RAISE EXCEPTION 'P1_POST_FAIL: project 127 %',v; END IF;
  SELECT template_id::text||'|'||md5(COALESCE(scope::text,'<SQL NULL>')) INTO v FROM public.projects WHERE id=143;
  IF v IS DISTINCT FROM 'e330a625-d0fd-48ef-ba5f-e96a75e67e6b|b63330187ce763bf90cf8573a83b28f2' THEN RAISE EXCEPTION 'P1_POST_FAIL: project 143 %',v; END IF;
  IF EXISTS (SELECT 1 FROM public.projects p LEFT JOIN public.templates t ON t.id=p.template_id WHERE p.template_id IS NOT NULL AND t.id IS NULL) THEN RAISE EXCEPTION 'P1_POST_FAIL: orphan pins'; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid='public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure;
  IF v IS DISTINCT FROM '53ddc257aaa05053822b30e8c7e8d72f' THEN RAISE EXCEPTION 'P1_POST_FAIL: contractor function %',v; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid='public.submit_site_visit_atomic(bigint,bigint,date,jsonb,jsonb,uuid)'::regprocedure;
  IF v IS DISTINCT FROM 'd2a510a8c1ce8977987cc69dde48fa4e' THEN RAISE EXCEPTION 'P1_POST_FAIL: site function %',v; END IF;
  SELECT convalidated::text||'|'||confdeltype::text INTO v FROM pg_constraint WHERE conname='projects_template_id_fkey' AND conrelid='public.projects'::regclass;
  IF v IS DISTINCT FROM 'true|r' THEN RAISE EXCEPTION 'P1_POST_FAIL: FK %',v; END IF;
  IF to_regclass('public.project_schedule_versions') IS NULL OR to_regclass('public.project_schedule_version_tasks') IS NULL
     OR to_regprocedure('public.save_contractor_schedule_draft(bigint,jsonb,uuid)') IS NULL
     OR to_regprocedure('public.submit_contractor_schedule(bigint,uuid,text)') IS NULL
     OR to_regprocedure('public.request_schedule_changes(bigint,text,uuid)') IS NULL
     OR to_regprocedure('public.approve_schedule_submission(bigint,text,uuid)') IS NULL
     OR to_regprocedure('public.contractor_schedule_lifecycle_status(bigint)') IS NULL
     OR to_regprocedure('public.can_access_schedule_submissions(bigint)') IS NULL
     OR to_regprocedure('public.create_contractor_managed_project(jsonb,text[],uuid)') IS NULL
     OR to_regprocedure('public.update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)') IS NULL
  THEN RAISE EXCEPTION 'P1_POST_FAIL: schedule/RPC stack'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('project_schedule_versions','project_schedule_version_tasks')
      AND grantee IN ('PUBLIC','anon','service_role')
  ) THEN RAISE EXCEPTION 'P1_POST_FAIL: new schedule table ACL leak'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_usage_grants
    WHERE object_schema='public' AND object_name IN ('project_schedule_versions_id_seq','project_schedule_version_tasks_id_seq')
      AND grantee IN ('PUBLIC','anon','authenticated','service_role')
  ) THEN RAISE EXCEPTION 'P1_POST_FAIL: new schedule sequence ACL leak'; END IF;
  IF has_function_privilege('service_role','public.prevent_referenced_template_semantic_change()','EXECUTE')
     OR has_function_privilege('service_role','public.prevent_schedule_version_task_mutation()','EXECUTE')
     OR has_function_privilege('service_role','public.prevent_scope_mutation_during_review()','EXECUTE')
  THEN RAISE EXCEPTION 'P1_POST_FAIL: trigger function ACL leak'; END IF;
END
$p1_post$;
COMMIT;
\echo P1_RECONCILIATION_COMMITTED
'@
    $parts.Add($postconditionSql.Replace('__P1_037_COLUMNS__', $profileColumnSql))
    $sql = ((($parts -join "`n`n").Replace("`r`n", "`n")).TrimEnd() + "`n")
    $dir = Split-Path -Parent $OutputPath
    if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [IO.File]::WriteAllText($OutputPath, $sql, [Text.UTF8Encoding]::new($false))
    return [pscustomobject]@{ Path=(Resolve-Path -LiteralPath $OutputPath).Path; Sha256=(Get-P1Sha256 $OutputPath); Bytes=(Get-Item -LiteralPath $OutputPath).Length; MigrationCount=$manifest.includedMigrations.Count; TransactionStrategy='single-outer-transaction' }
}

function Get-P1ReconciliationStateSql {
    [CmdletBinding()]
    param([string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)

    $migrationPath = Join-Path $RepoRoot 'weekly-tracker\src\migrations\037_retail_historical_project_profile.sql'
    $profileColumnSql = ConvertTo-P1SqlIdentifierList (Get-P1Migration037ColumnContract -MigrationPath $migrationPath)
    $sql = @'
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name='family')
   AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN (__P1_037_COLUMNS__))=10
   AND EXISTS (SELECT 1 FROM public.templates WHERE id='dc92175a-251c-45ab-a4fd-c83c1c668ef4' AND is_active)
   AND EXISTS (SELECT 1 FROM public.templates WHERE id='e4ef4d98-5688-4d12-9fca-2d7cded88d29' AND NOT is_active)
   AND (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure)='53ddc257aaa05053822b30e8c7e8d72f'
   AND (SELECT confdeltype FROM pg_constraint WHERE conname='projects_template_id_fkey' AND conrelid='public.projects'::regclass)='r'
    THEN 'ALREADY_RECONCILED'
  WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name IN ('family','company_id'))
   AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN (__P1_037_COLUMNS__))=0
   AND NOT EXISTS (SELECT 1 FROM public.templates WHERE id IN ('dc92175a-251c-45ab-a4fd-c83c1c668ef4','e4ef4d98-5688-4d12-9fca-2d7cded88d29'))
   AND (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.submit_contractor_report_atomic(bigint,date,jsonb,jsonb,uuid)'::regprocedure)='94ae61e04f32b5917edd78063bf12f5f'
    THEN 'READY'
  ELSE 'NOT_APPLICABLE'
END;
'@
    return $sql.Replace('__P1_037_COLUMNS__', $profileColumnSql)
}
