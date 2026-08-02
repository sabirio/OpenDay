# Staging Live Apply — Migration Batch 046-054 — Owner Runbook

Simplification Phase 3E.4. This is the **live-staging apply** package for
`contractor-managed-rollout-046-054`. `docs/STAGING_MIGRATION_046_054_REHEARSAL_RUNBOOK.md`
only covers the owner backup and the agent's local disposable rehearsal — it
has no live-apply commands and must not be used for that purpose. This
document is the complete, standalone replacement for that specific step.

**This is an owner-executed runbook.** No command below is ever run by an AI
agent — every step is copy/paste PowerShell for a human to run, one at a
time, reading the expected result before moving to the next step. This
mirrors `docs/PRODUCTION_MIGRATION_EXECUTOR.md`'s rule applied identically to
staging.

Prerequisite: Docker Desktop running. Native `psql` is **not** assumed to be
installed on the owner's machine — every database command below runs via
`docker run --rm postgres:17 psql ...`, the same pattern
`scripts/lib/MigrationManifestValidator.ps1`'s `New-ManifestApplyCommandArgs`
already uses for the production/staging executor.

Run every command from a single PowerShell session so `$env:` variables
persist between steps. If you close the terminal, start over from Step 1.

---

## 1. Repository Safety Verification

```powershell
cd C:\Users\skhai\cf-tracker

git rev-parse --show-toplevel
# expect: C:/Users/skhai/cf-tracker

git branch --show-current
# expect: feature/staging-bridge-037-041-preparation

git rev-parse HEAD
# expect: 6e568d836ebdec6ab6bdb0419a859cb0c9d1666d

git status --porcelain
# expect: <empty output>

git diff --stat -- weekly-tracker/src/migrations/
# expect: <empty output> - no modified migration files

Get-FileHash scripts\manifests\contractor-managed-rollout-046-054.psd1 -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: A76D49267B8D5F4BD00E85E4A167E16BFD194D3962C6894CC9B91C90B66A9AEA

Get-FileHash backups\staging\20260802T135704Z\backup-manifest.json -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: CBB3C4A1FBDEFD54ACB16AD727591E151E950E867332A45B4B4771EFC274208F
```

If any value does not match exactly, **stop** — do not continue this
runbook. Investigate the discrepancy first.

---

## 2. Staging Identity Verification

This reuses the existing, already-tested `Get-StagingConnectionFingerprint`
function (`scripts/lib/ProductionConnection.ps1`) rather than re-implementing
identity checks — it already fails closed on: host not ending in
`.pooler.supabase.com`, port other than `5432`, database other than
`postgres`, username not exactly matching `postgres.<expected ref>`, or an
empty password. It never prints the password or the raw URI.

```powershell
. .\scripts\lib\ProductionConnection.ps1

$fingerprint = Get-StagingConnectionFingerprint `
  -EnvFile 'weekly-tracker\.env.staging' `
  -RepoRoot (Get-Location).Path `
  -ExpectedProjectRef 'sdndsekarwhumdbcqxni'

Write-Host "Host: $($fingerprint.Host)"
Write-Host "Port: $($fingerprint.Port)"
Write-Host "Database: $($fingerprint.Database)"
Write-Host "User: $($fingerprint.User)"
Write-Host "SSL mode (fixed, never read from the URL): require"
```

Expect:

```text
Host: aws-0-ap-northeast-1.pooler.supabase.com
Port: 5432
Database: postgres
User: postgres.sdndsekarwhumdbcqxni
SSL mode (fixed, never read from the URL): require
```

If this block throws, **stop** — the connection string is not staging, or is
malformed, or the file is missing/not gitignored. Do not proceed.

---

## 3. Credential Construction

Never prints the password. `sslmode` is a fixed literal (`require`), the
same convention `production-backup.ps1` uses — never trusted from the raw
connection string.

```powershell
$env:PGPASSWORD = $fingerprint.Password

$dbUri = "postgresql://$([Uri]::EscapeDataString($fingerprint.User))@$($fingerprint.Host):$($fingerprint.Port)/$($fingerprint.Database)?sslmode=require"

# Sanity check ONLY - confirms no password ended up in the printable URI.
if ($dbUri -match [regex]::Escape($fingerprint.Password)) {
    throw 'REFUSING: password leaked into the connection URI - stop and investigate before continuing'
}
Write-Host "Canonical URI (password-free): $dbUri"
```

`$env:PGPASSWORD` is forwarded to each `docker run` invocation below via
`--env PGPASSWORD` (inherited from the current process environment, never
passed as a literal argument, never appears in `docker ps`/shell history).

---

## 4. Backup Binding Verification

Already checked in Step 1 above (`backup-manifest.json` SHA-256). This step
confirms the directory itself is the one this runbook is bound to and that
it predates any 046-054 apply:

```powershell
Test-Path 'backups\staging\20260802T135704Z\backup-manifest.json'
# expect: True

(Get-Content 'backups\staging\20260802T135704Z\backup-manifest.json' -Raw | ConvertFrom-Json).sourceCommit
# expect: 6e568d836ebdec6ab6bdb0419a859cb0c9d1666d
```

If either check fails, **stop**. This backup is the rollback baseline for
this apply — do not proceed with a different or unverified backup.

---

## 5. Migration Hash Verification (CRLF-Normalized)

**Do not use raw `Get-FileHash` here.** This repository's migration files
are stored in Git with LF line endings, but `core.autocrlf=true` on Windows
checkouts converts them to CRLF on disk — confirmed this session:
`Get-FileHash` on the working-copy file for migration 046 produces
`9F0B0190A2C98CEE08E2BD71F5461790113AE302E21B3F9BC58828776C3A4645`
(CRLF), while the hash recorded in
`scripts/manifests/contractor-managed-rollout-046-054.psd1` and in every
prior Phase 3E report is
`989D09AF15D4ED2D216CD0D0F51805EA8A080DC789CB3F1149289E0E738B2FA8`
(LF-normalized, matching the Git blob). Using raw `Get-FileHash` here would
report a false mismatch on every migration file. Use this instead:

```powershell
function Get-NormalizedMigrationSha256 {
    param([Parameter(Mandatory)][string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    $text = [Text.Encoding]::UTF8.GetString($bytes)
    $normalized = $text -replace "`r`n", "`n"
    $normalizedBytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        -join ($sha256.ComputeHash($normalizedBytes) | ForEach-Object { $_.ToString('x2') })
    } finally {
        $sha256.Dispose()
    }
}

$expectedHashes = [ordered]@{
    '046_contractor_schedule_draft_foundation.sql'        = '989d09af15d4ed2d216cd0d0f51805ea8a080dc789cb3f1149289e0e738b2fa8'
    '047_contractor_schedule_human_date_semantics.sql'    = '7e3fea282eac83a588b20b76440572402218f7c99f0c001afab43ec9f9213b68'
    '048_contractor_schedule_ownership_enforcement.sql'   = '339862f93bba8d4839b8e4aececb99ed9f0cf95151b6c6a900d3e8b973efc7f0'
    '049_contractor_schedule_submission_lifecycle.sql'    = 'a963cf161009a0ac648ccac93333ec765b729de2cff7232e3b2a64e75010e20e'
    '050_contractor_schedule_draft_lifecycle_lock.sql'    = '1cc114d59219cc1e31f5e4102a46f0446c95196297bc18cd694b4bda60627bb4'
    '051_contractor_schedule_lifecycle_lock_integrity.sql'= '7e6d186b44ca67548b2fdf8e4cb72b7a7303d269b3e13a0b3800f61d75d382c5'
    '052_create_contractor_managed_project.sql'           = '2ccd788db3103e4513a1bd8611687137661e442aab7d8ca444b2899d53522a1b'
    '053_contractor_managed_project_scope_sync.sql'       = '9529be1c323934210a7130d7d35c8fd150ebcd50bdcdaab77e113857478aa8fa'
    '054_fix_contractor_managed_scope_null_artifact.sql'  = '3e69ad0c9b453074d667bc38b0984432ed33f7d0b42043df7f28d87a9569b77b'
}

$migrationsDir = 'weekly-tracker\src\migrations'
$hashMismatch = $false
foreach ($file in $expectedHashes.Keys) {
    $actual = Get-NormalizedMigrationSha256 -Path (Join-Path $migrationsDir $file)
    $expected = $expectedHashes[$file]
    $status = if ($actual -eq $expected) { 'MATCH' } else { 'MISMATCH'; $hashMismatch = $true }
    Write-Host "$status  $file"
    Write-Host "  expected: $expected"
    Write-Host "  actual:   $actual"
}
if ($hashMismatch) { throw 'REFUSING: at least one migration hash does not match the pinned manifest - stop, do not apply' }
Write-Host "`nAll 9 migration hashes verified."
```

**Stop on any `MISMATCH`.**

---

## 6. Live Read-Only Preflight

Every command in this section is read-only (`SELECT`/`information_schema`
only — no `ALTER`/`CREATE`/`INSERT`/`UPDATE`). Each runs as its own
`docker run --rm` invocation.

```powershell
function Invoke-StagingReadOnlyQuery {
    param([Parameter(Mandatory)][string]$Sql)
    docker run --rm --network bridge --env PGPASSWORD `
      postgres:17 psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc $Sql
}

Write-Host "037 columns present (expect 10):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN ('location_type','store_concept','sales_area_sqm','back_of_house_area_sqm','actual_construction_start_date','actual_construction_completion_date','actual_opening_date','budget','actual_cost','currency_code');"

Write-Host "041 columns present (expect 2):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name IN ('family','company_id');"

Write-Host "Active global retail-fitout-v2 template (expect exactly 1 row):"
Invoke-StagingReadOnlyQuery "SELECT id, name, family, company_id, version, is_active FROM public.templates WHERE family='retail-fitout-v2';"

Write-Host "schedule_ownership_mode absent (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='schedule_ownership_mode';"

Write-Host "project_schedule_versions absent (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_versions';"

Write-Host "project_schedule_version_tasks absent (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_version_tasks';"

Write-Host "create_contractor_managed_project absent (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='create_contractor_managed_project';"

Write-Host "update_contractor_managed_project_scope absent (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='update_contractor_managed_project_scope';"

Write-Host "Current live projects count (review this number yourself - no fixed expected value; record it, you will compare it again in Step 11):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects;"

Write-Host "No partial 046-054 application (any one of these functions existing without ALL of them would mean a partial/drifted state - stop and investigate manually rather than applying):"
Invoke-StagingReadOnlyQuery "SELECT proname FROM pg_proc WHERE proname IN ('save_contractor_schedule_draft','contractor_schedule_lifecycle_status','create_contractor_managed_project','update_contractor_managed_project_scope','submit_contractor_schedule');"
```

The migration-054 null-artifact predicate (`schedule_ownership_mode =
'CONTRACTOR_MANAGED' AND jsonb_typeof(scope) = 'null'`) **cannot** be
evaluated yet — `schedule_ownership_mode` does not exist until after
migration 046 runs. It is deferred to Step 9, immediately before applying
054.

**Required result before continuing:** all of the "absent"/"expect 0"
checks above must read `0`, the template check must return exactly one row,
and the "no partial application" query must return **zero rows**. If every
condition holds:

```text
READY_FOR_LIVE_046_054_APPLY
```

If any condition does not hold, **stop** here.

---

## 7. Apply Migrations One At A Time

One block per migration, in exact order. Each is its own `docker run`
invocation with `--single-transaction` (psql's `-1`/`--single-transaction`
flag wraps the whole file in one transaction; for migration 041, which
already has its own explicit `BEGIN`/`COMMIT`, this is a documented psql
no-op — the file's own transaction control takes effect and
`--single-transaction` adds no second, conflicting transaction). The
migrations directory is bind-mounted **read-only** — the container can read
the SQL file but cannot write to the repository. **Do not** combine
multiple migrations into one command, and **do not** continue past a
non-zero exit code.

```powershell
function Invoke-StagingMigrationApply {
    param(
        [Parameter(Mandatory)][string]$FileName
    )
    $migrationsDir = (Resolve-Path 'weekly-tracker\src\migrations').Path
    $startedAtUtc = [DateTime]::UtcNow.ToString('o')
    Write-Host "=== APPLY $FileName ==="
    Write-Host "Start UTC: $startedAtUtc"
    docker run --rm --network bridge `
      --mount "type=bind,source=$migrationsDir,target=/apply,readonly" `
      --env PGPASSWORD `
      postgres:17 psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 --single-transaction --file "/apply/$FileName"
    $exitCode = $LASTEXITCODE
    $completedAtUtc = [DateTime]::UtcNow.ToString('o')
    Write-Host "End UTC: $completedAtUtc"
    Write-Host "Exit code: $exitCode"
    if ($exitCode -ne 0) {
        throw "REFUSING TO CONTINUE: $FileName exited $exitCode. Stop here. Do not apply any later migration in this batch. Investigate before deciding next steps (see docs/PRODUCTION_ROLLBACK_RUNBOOK.md - forward-only recovery)."
    }
    Write-Host ''
}
```

### 7a. Apply 046

```powershell
Invoke-StagingMigrationApply -FileName '046_contractor_schedule_draft_foundation.sql'
```

### 7b. Apply 047

```powershell
Invoke-StagingMigrationApply -FileName '047_contractor_schedule_human_date_semantics.sql'
```

### 7c. Apply 048

```powershell
Invoke-StagingMigrationApply -FileName '048_contractor_schedule_ownership_enforcement.sql'
```

### 7d. Apply 049

```powershell
Invoke-StagingMigrationApply -FileName '049_contractor_schedule_submission_lifecycle.sql'
```

### 7e. Apply 050

```powershell
Invoke-StagingMigrationApply -FileName '050_contractor_schedule_draft_lifecycle_lock.sql'
```

### 7f. Apply 051

```powershell
Invoke-StagingMigrationApply -FileName '051_contractor_schedule_lifecycle_lock_integrity.sql'
```

### 7g. Apply 052

```powershell
Invoke-StagingMigrationApply -FileName '052_create_contractor_managed_project.sql'
```

### 7h. Apply 053

```powershell
Invoke-StagingMigrationApply -FileName '053_contractor_managed_project_scope_sync.sql'
```

### 7i. Apply 054 — see Step 9 first

**Do not run 054 yet.** Go to Step 9 (Migration 054 Preflight) before
applying it.

---

## 8. Intermediate Verification

Run the block for each migration **immediately after** applying it (Step 7),
before moving to the next migration.

### After 046

```powershell
Write-Host "schedule_ownership_mode exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='schedule_ownership_mode';"

Write-Host "All existing projects are AUTO_GENERATED (expect 0 rows NOT AUTO_GENERATED):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode <> 'AUTO_GENERATED';"

Write-Host "save_contractor_schedule_draft exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='save_contractor_schedule_draft';"
```

### After 049

```powershell
Write-Host "project_schedule_versions exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_versions';"

Write-Host "project_schedule_version_tasks exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_version_tasks';"

Write-Host "Lifecycle functions exist (expect 3+):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname IN ('contractor_schedule_lifecycle_status','submit_contractor_schedule','request_contractor_schedule_changes','approve_contractor_schedule');"
```

### After 051

```powershell
Write-Host "Lifecycle lock trigger exists and is enabled (expect one row, tgenabled='O'):"
Invoke-StagingReadOnlyQuery "SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='projects_scope_lifecycle_lock';"
```

### After 052

```powershell
Write-Host "create_contractor_managed_project exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='create_contractor_managed_project';"

Write-Host "Grants correct - owner postgres, SECURITY DEFINER, PUBLIC revoked, authenticated granted:"
Invoke-StagingReadOnlyQuery "SELECT p.proname, r.rolname AS owner, p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE p.proname='create_contractor_managed_project';"
```

### After 053

```powershell
Write-Host "update_contractor_managed_project_scope exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='update_contractor_managed_project_scope';"

Write-Host "Grants correct:"
Invoke-StagingReadOnlyQuery "SELECT p.proname, r.rolname AS owner, p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner WHERE p.proname='update_contractor_managed_project_scope';"
```

If any intermediate check does not match its expectation, **stop** and do
not apply the next migration.

---

## 9. Migration 054 Preflight and Postflight

**Immediately before** applying 054 (after 053's intermediate checks pass):

```powershell
Write-Host "Pre-054 count of CONTRACTOR_MANAGED projects with a JSONB-null scope:"
$preCount = Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND jsonb_typeof(scope) = 'null';"
Write-Host "Pre-count: $preCount"

if ([int]$preCount -gt 0) {
    Write-Host "Exporting affected project id/store_code/company_id to a local audit file (no other columns)..."
    $auditPath = "work\staging-live-046-054-054-audit-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')).csv"
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT id || ',' || store_code || ',' || company_id FROM public.projects WHERE schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND jsonb_typeof(scope) = 'null';" |
      Out-File -FilePath $auditPath -Encoding utf8
    Write-Host "Audit file written to: $auditPath"
    Write-Host ''
    Write-Host "OWNER ACKNOWLEDGEMENT REQUIRED: $preCount row(s) will be corrected by migration 054."
    Write-Host "Review $auditPath before continuing. Do not proceed until you have reviewed it and are ready to accept the correction."
    Read-Host "Type EXACTLY 'I ACKNOWLEDGE THE 054 CORRECTION' to continue, anything else aborts"
    # a human must literally type the phrase above before proceeding to 054
}
```

Only after this (and, if `$preCount -gt 0`, after typing the exact
acknowledgement phrase):

```powershell
Invoke-StagingMigrationApply -FileName '054_fix_contractor_managed_scope_null_artifact.sql'
```

Postflight, immediately after:

```powershell
Write-Host "Post-054 count (expect 0):"
$postCount = Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND jsonb_typeof(scope) = 'null';"
Write-Host "Post-count: $postCount"
if ([int]$postCount -ne 0) { throw 'REFUSING: post-054 count is not zero - stop, do not proceed to Step 10' }

Write-Host "Reconciliation: pre-count $preCount should equal 054's own reported affected-row count from its apply output above."

Write-Host "AUTO_GENERATED projects unchanged (compare this count against Step 6's recorded live projects count and against the AUTO_GENERATED subset):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode = 'AUTO_GENERATED';"
```

---

## 10. Final Security Inventory

```powershell
Write-Host "Function owners / SECURITY DEFINER / search_path (expect owner=postgres, prosecdef=t, proconfig contains search_path=public for all 5):"
Invoke-StagingReadOnlyQuery @"
SELECT p.proname, r.rolname AS owner, p.prosecdef, array_to_string(p.proconfig, ',') AS proconfig
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN ('save_contractor_schedule_draft','contractor_schedule_lifecycle_status','create_contractor_managed_project','update_contractor_managed_project_scope','submit_contractor_schedule')
ORDER BY p.proname;
"@

Write-Host "PUBLIC revoked / authenticated granted / anon denied (expect f/t/f for all 5):"
Invoke-StagingReadOnlyQuery @"
SELECT p.proname,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p
WHERE p.proname IN ('save_contractor_schedule_draft','contractor_schedule_lifecycle_status','create_contractor_managed_project','update_contractor_managed_project_scope','submit_contractor_schedule')
ORDER BY p.proname;
"@

Write-Host "Triggers enabled (expect tgenabled='O' for all rows):"
Invoke-StagingReadOnlyQuery "SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE tgname IN ('projects_scope_lifecycle_lock','project_schedule_version_tasks_immutable') ORDER BY tgname;"

Write-Host "schedule_ownership_mode default + CHECK:"
Invoke-StagingReadOnlyQuery "SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='schedule_ownership_mode';"
Invoke-StagingReadOnlyQuery "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.projects'::regclass AND conname='projects_schedule_ownership_mode_check';"

Write-Host "No authenticated/anon table-level write grants on protected schedule tables (expect zero rows):"
Invoke-StagingReadOnlyQuery @"
SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('projects','project_schedule_versions','project_schedule_version_tasks')
AND grantee IN ('authenticated','anon') AND privilege_type IN ('INSERT','UPDATE','DELETE');
"@
```

---

## 11. Final Integrity Checks

Every query below must return **zero rows / zero count** unless noted.

```powershell
Write-Host "CONTRACTOR_MANAGED projects with zero active tasks (expect 0):"
Invoke-StagingReadOnlyQuery @"
SELECT count(*) FROM public.projects p
WHERE p.schedule_ownership_mode = 'CONTRACTOR_MANAGED'
AND NOT EXISTS (SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id = p.id AND NOT t.is_archived);
"@

Write-Host "Scope WPs missing an active task (expect 0):"
Invoke-StagingReadOnlyQuery @"
SELECT count(*) FROM public.projects p
CROSS JOIN LATERAL jsonb_array_elements_text(p.scope->'workPackages') AS wp(value)
WHERE p.schedule_ownership_mode = 'CONTRACTOR_MANAGED'
AND NOT EXISTS (SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id = p.id AND t.wp_id = wp.value AND NOT t.is_archived);
"@

Write-Host "Active tasks outside Scope (expect 0):"
Invoke-StagingReadOnlyQuery @"
SELECT count(*) FROM public.project_gantt_tasks t
JOIN public.projects p ON p.id = t.project_id
WHERE p.schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND NOT t.is_archived
AND NOT (p.scope->'workPackages' ? t.wp_id);
"@

Write-Host "Duplicate active project/WP rows (expect 0):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM (SELECT project_id, wp_id FROM public.project_gantt_tasks WHERE NOT is_archived GROUP BY project_id, wp_id HAVING count(*) > 1) d;"

Write-Host "Generated dates at initial creation (expect 0 - this batch creates no new projects itself; a CONTRACTOR_MANAGED project's gantt rows must stay unscheduled (NULL planned_start/planned_end) until a Contractor explicitly saves a draft, never auto-populated by this migration batch):"
Invoke-StagingReadOnlyQuery @"
SELECT count(*) FROM public.project_gantt_tasks t
JOIN public.projects p ON p.id = t.project_id
WHERE p.schedule_ownership_mode = 'CONTRACTOR_MANAGED' AND NOT t.is_archived
AND (t.planned_start IS NOT NULL OR t.planned_end IS NOT NULL)
AND NOT EXISTS (SELECT 1 FROM public.project_schedule_versions v WHERE v.project_id = p.id);
"@

Write-Host "JSONB scalar-null Scope (expect 0, re-check after 054):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode='CONTRACTOR_MANAGED' AND jsonb_typeof(scope)='null';"

Write-Host "Partial initialization - CONTRACTOR_MANAGED with scope set but zero gantt rows at all (expect 0):"
Invoke-StagingReadOnlyQuery @"
SELECT count(*) FROM public.projects p
WHERE p.schedule_ownership_mode='CONTRACTOR_MANAGED' AND jsonb_array_length(p.scope->'workPackages') > 0
AND NOT EXISTS (SELECT 1 FROM public.project_gantt_tasks t WHERE t.project_id=p.id);
"@

Write-Host "AUTO_GENERATED project count (record and compare against Step 6's pre-apply count - must be unchanged):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects WHERE schedule_ownership_mode='AUTO_GENERATED';"

Write-Host "Unexpected schedule-version/baseline rows (expect 0 - nothing in this batch itself submits a schedule):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.project_schedule_versions;"
```

If anything above is non-zero where zero is expected, **stop** and
investigate before declaring this apply complete. Do not proceed to Step 12.

---

## 12. Old Frontend Smoke-Test Gate

**Do not deploy the new frontend as part of this runbook.** Before doing
anything else, manually verify the **currently deployed** staging frontend
(the one already live before this migration batch) still behaves correctly
against the now-migrated database:

- [ ] Site loads without a blank page or console error overlay
- [ ] Sign-in / authentication succeeds
- [ ] Project list opens and shows the expected projects
- [ ] An existing project opens (detail view renders)
- [ ] Existing contractor reports open and render
- [ ] Existing site visits open and render
- [ ] No unexpected error banners/toasts appear anywhere in the above

If any box cannot be checked, **stop** — do not proceed to deploying any
new frontend build, and treat this as a rollback-consideration trigger per
`docs/PRODUCTION_ROLLBACK_RUNBOOK.md`'s forward-only policy (a corrective
migration, not a schema rollback, is still the default remedy since 046-054
are additive).

---

## 13. Credential Cleanup

Run this even if an earlier step threw and you are abandoning the runbook.

```powershell
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
$dbUri = $null
$dbPassword = $null
$fullUri = $null
$fingerprint = $null
```

---

## 14. Attestation

Copy `scripts/manifests/staging-live-046-054-attestation.template.json` to
`work/staging-live-046-054-attestation-<UTC timestamp>.json`, fill in every
field from Steps 5-11 above, and hand it back together with the Step 12
checklist. Never put `STAGING_DB_URL` or any password into this file.

---

## Rollback Policy

Forward-only, per `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`. 046-054 are
additive (new columns/tables/functions, one corrective `UPDATE` in 054
scoped to a predicate that is empty on this dataset per the Phase 3E.3
rehearsal). The rollback baseline remains
`backups/staging/20260802T135704Z` — a full restore from it is a last
resort, not the default response to an unexpected result in this runbook.
