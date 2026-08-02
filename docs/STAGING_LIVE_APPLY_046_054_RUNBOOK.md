# Staging Live Apply — Migration Batch 046-054 — Owner Runbook

Simplification Phase 3E.4 (updated for the Contractor-Managed Schedule ACL
hotfix). This is the **live-staging apply** package for
`contractor-managed-rollout-046-054`. `docs/STAGING_MIGRATION_046_054_REHEARSAL_RUNBOOK.md`
only covers the owner backup and the agent's local disposable rehearsal — it
has no live-apply commands and must not be used for that purpose. This
document is the complete, standalone replacement for that specific step.

**Live staging already has migrations 046 through 052 applied.** Only `053`
and `054` remain from this batch. **Migration `055`
(`contractor-schedule-function-acl-055`, its own separate release manifest)
is a mandatory, forward-only security follow-up that must be applied
immediately after `054` and before this runbook's final security inventory**
— it closes a real gap where several Contractor-Managed Schedule RPCs still
carry Supabase's default anon `EXECUTE` grant. Do not skip it, and do not
treat it as optional cleanup. This runbook never re-applies 046-052.

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

The post-bridge backup's `sourceCommit`,
`6e568d836ebdec6ab6bdb0419a859cb0c9d1666d`, is **not** the current branch
HEAD and must never be checked against `git rev-parse HEAD` directly — it is
the commit the backup was *taken from*, one commit before this very runbook
file was added (`734aaf8`). Editing this runbook (including this fix) moves
HEAD again, so a hardcoded "current HEAD equals `<runbook's own commit>`"
check is self-referential and impossible to satisfy: the commit that would
need to be pinned always contains one more edit than the one being pinned.
What must hold is that the frozen backup source commit remains an ancestor of
HEAD, the reviewed implementation commit
`cf5fc00d4028bbb255e4d100a537a6d1575bd81e` is also an ancestor of HEAD,
and there is no migration drift after that reviewed implementation commit.
The only approved migration delta since the backup is the reviewed ACL
hardening: modified `053` and `054`, plus new forward-only migration `055`.

```powershell
cd C:\Users\skhai\cf-tracker

git rev-parse --show-toplevel
# expect: C:/Users/skhai/cf-tracker

git branch --show-current
# expect: fix/contractor-schedule-function-acl

git status --porcelain
# expect: <empty output>

$backupSourceCommit = '6e568d836ebdec6ab6bdb0419a859cb0c9d1666d'
$reviewedImplementationCommit = 'cf5fc00d4028bbb255e4d100a537a6d1575bd81e'

git merge-base --is-ancestor $backupSourceCommit HEAD
if ($LASTEXITCODE -ne 0) {
    throw "REFUSING: $backupSourceCommit is not an ancestor of current HEAD - this branch has diverged from the commit the backup was taken from. Stop."
}
Write-Host "Ancestor check passed: $backupSourceCommit is an ancestor of HEAD ($(git rev-parse HEAD))."

git merge-base --is-ancestor $reviewedImplementationCommit HEAD
if ($LASTEXITCODE -ne 0) {
    throw "REFUSING: reviewed implementation commit $reviewedImplementationCommit is not an ancestor of HEAD. Stop."
}
Write-Host "Reviewed implementation check passed: $reviewedImplementationCommit is an ancestor of HEAD."

git diff --exit-code $reviewedImplementationCommit -- weekly-tracker/src/migrations/
if ($LASTEXITCODE -ne 0) {
    throw "REFUSING: migration drift exists after the reviewed implementation commit. Stop - do not apply."
}
Write-Host "No migration file has changed since the reviewed implementation commit."

$expectedMigrationDelta = @(
    "M`tweekly-tracker/src/migrations/053_contractor_managed_project_scope_sync.sql"
    "M`tweekly-tracker/src/migrations/054_fix_contractor_managed_scope_null_artifact.sql"
    "A`tweekly-tracker/src/migrations/055_restrict_contractor_schedule_function_acl.sql"
)

$actualMigrationDelta = @(
    git diff --name-status `
      $backupSourceCommit `
      $reviewedImplementationCommit `
      -- weekly-tracker/src/migrations/
)

$migrationDeltaMismatch = Compare-Object `
  -ReferenceObject ($expectedMigrationDelta | Sort-Object) `
  -DifferenceObject ($actualMigrationDelta | Sort-Object)

if ($migrationDeltaMismatch) {
    Write-Host 'Actual migration delta does not match the reviewed 053-055 ACL hardening:'
    $actualMigrationDelta | ForEach-Object { Write-Host "  $_" }
    throw 'REFUSING: unexpected migration delta since the backup source commit. Stop.'
}

Write-Host 'Approved migration delta verified: modified 053/054 and added 055 only.'

# Changes since the backup source commit are restricted to this explicit
# reviewed implementation and rollout-evidence allow-list.
$changedSinceBackup = @(git diff --name-only $backupSourceCommit HEAD)

$allowedChangesSinceBackup = @(
    'docs/STAGING_LIVE_APPLY_046_054_RUNBOOK.md'
    'scripts/manifests/contractor-managed-rollout-046-054.psd1'
    'scripts/manifests/staging-live-046-054-attestation.template.json'
    'scripts/manifests/contractor-schedule-function-acl-055.psd1'
    'scripts/manifests/staging-live-contractor-schedule-function-acl-055-attestation.template.json'
    'scripts/tests/staging-live-046-054-runbook.tests.ps1'
    'weekly-tracker/scripts/certification/applyContractorManagedScopeSyncLocal.mjs'
    'weekly-tracker/src/migrations/053_contractor_managed_project_scope_sync.sql'
    'weekly-tracker/src/migrations/054_fix_contractor_managed_scope_null_artifact.sql'
    'weekly-tracker/src/migrations/055_restrict_contractor_schedule_function_acl.sql'
    'weekly-tracker/src/tests/localCertificationMigrationPath.test.mjs'
)

$disallowed = $changedSinceBackup |
  Where-Object { $_ -notin $allowedChangesSinceBackup }

if ($disallowed) {
    Write-Host 'Files outside the explicit reviewed allow-list changed since the backup source commit:'
    $disallowed | ForEach-Object { Write-Host "  $_" }
    throw 'REFUSING: unexpected file changes since the backup source commit. Stop and investigate.'
}

Write-Host 'All changes since the backup source commit match the explicit reviewed allow-list.'

(Get-Content 'backups\staging\20260802T135704Z\backup-manifest.json' -Raw | ConvertFrom-Json).sourceCommit
# expect: 6e568d836ebdec6ab6bdb0419a859cb0c9d1666d - this is the backup's own
# frozen record and must never change; it is checked again in Step 4.

Get-FileHash scripts\manifests\contractor-managed-rollout-046-054.psd1 -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: 0330668aec1f3335aa98fc8696ad67a8fe624f4184076a69dc0ffab5e4157688

Get-FileHash scripts\manifests\contractor-schedule-function-acl-055.psd1 -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: f5606e44b177c865a916717ddf2ff3e5a918aeaa0424b45a9ca2cff3026de63f

Get-FileHash backups\staging\20260802T135704Z\backup-manifest.json -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: CBB3C4A1FBDEFD54ACB16AD727591E151E950E867332A45B4B4771EFC274208F
```

If any check throws or any value does not match exactly, **stop** — do not
continue this runbook. Investigate the discrepancy first.

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
    '053_contractor_managed_project_scope_sync.sql'       = 'a0b1ea7910d35c18709f40b3535c1303501f5539b824574dd0b73aa577a6d64f'
    '054_fix_contractor_managed_scope_null_artifact.sql'  = 'a84040891bb20262f40a31c94c455465534bf2be4e963ec78558a92b1565d158'
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

Migration `055` belongs to a separate release manifest
(`scripts/manifests/contractor-schedule-function-acl-055.psd1`) and is
verified on its own, immediately before it is applied in Step 9b:

```powershell
$expected055Hash = '8db03764d989e20ee7f47aa9f7e05da8eca32488ae10f1948bef80643618c59c'
$actual055Hash = Get-NormalizedMigrationSha256 -Path (Join-Path 'weekly-tracker\src\migrations' '055_restrict_contractor_schedule_function_acl.sql')
if ($actual055Hash -ne $expected055Hash) {
    throw "REFUSING: migration 055 hash mismatch. expected=$expected055Hash actual=$actual055Hash. Stop, do not apply."
}
Write-Host "MATCH  055_restrict_contractor_schedule_function_acl.sql"
Write-Host "  expected: $expected055Hash"
Write-Host "  actual:   $actual055Hash"
```

---

## 6. Live Read-Only Preflight — Acknowledge 046-052, Confirm Only 053/054 Remain

Every command in this section is read-only (`SELECT`/`information_schema`
only — no `ALTER`/`CREATE`/`INSERT`/`UPDATE`). Each runs as its own
`docker run --rm` invocation.

**Live staging already has 046-052 applied.** This preflight confirms that
fact (rather than requiring their absence, which was the wrong assumption in
an earlier draft of this runbook) and confirms `053`/`054` specifically are
the only ones still missing. **Do not attempt to reapply 046-052.**

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

Write-Host "schedule_ownership_mode ALREADY present from migration 046 (expect 1 - do not reapply 046):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='schedule_ownership_mode';"

Write-Host "project_schedule_versions ALREADY present from migration 049 (expect 1 - do not reapply 049):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_versions';"

Write-Host "project_schedule_version_tasks ALREADY present from migration 049 (expect 1 - do not reapply 049):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='project_schedule_version_tasks';"

Write-Host "create_contractor_managed_project ALREADY present from migration 052 (expect 1 - do not reapply 052):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='create_contractor_managed_project';"

Write-Host "update_contractor_managed_project_scope must be ABSENT (expect 0 - this is 053, the first migration this runbook will apply):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='update_contractor_managed_project_scope';"

Write-Host "Current live projects count (review this number yourself - no fixed expected value; record it, you will compare it again in Step 11):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects;"

Write-Host "046-052 functions all present, confirming no partial/drifted state among what should already be live:"
Invoke-StagingReadOnlyQuery "SELECT proname FROM pg_proc WHERE proname IN ('save_contractor_schedule_draft','contractor_schedule_lifecycle_status','create_contractor_managed_project','submit_contractor_schedule');"

Write-Host "Confirm exactly 053 and 054 (not 055) are what remain from this batch - anon EXECUTE is still granted on create_contractor_managed_project pre-054 (Supabase default, only REVOKE FROM PUBLIC was applied by 052, not FROM PUBLIC, anon):"
Invoke-StagingReadOnlyQuery "SELECT has_function_privilege('anon', 'public.create_contractor_managed_project(jsonb, text[], uuid)', 'EXECUTE') AS anon_can_still_execute_create;"
```

The migration-054 null-artifact predicate (`schedule_ownership_mode =
'CONTRACTOR_MANAGED' AND jsonb_typeof(scope) = 'null'`) is evaluated in
Step 9, immediately before applying 054 (it is valid to evaluate now too,
since `schedule_ownership_mode` already exists from 046 — Step 9 re-runs it
immediately before the apply regardless, as the authoritative pre-count).

**Required result before continuing:** the four "ALREADY present" checks
must each read `1` (or `10`/`2` for the column-count checks), the template
check must return exactly one row, `update_contractor_managed_project_scope`
must read `0`, the 046-052 function-presence query must return all 4 rows,
and `anon_can_still_execute_create` must read `t` (confirming the exposure
this whole rollout exists to close). If every condition holds:

```text
READY_FOR_LIVE_046_054_APPLY
```

If any condition does not hold, **stop** here.

---

## 7. Apply Migrations One At A Time

Only `053` is applied in this step — `046`-`052` are already live and
**must not** be reapplied (Step 6 already confirmed this). `054` is applied
separately in Step 9, after its own preflight/owner-acknowledgement gate;
`055` is applied separately again in Step 9c, after its own preflight
(Step 9a). Each migration is its own `docker run` invocation with
`--single-transaction` (psql's `-1`/`--single-transaction` flag wraps the
whole file in one transaction; for a migration with its own explicit
`BEGIN`/`COMMIT` this is a documented psql no-op — the file's own
transaction control takes effect and `--single-transaction` adds no second,
conflicting transaction). The migrations directory is bind-mounted
**read-only** — the container can read the SQL file but cannot write to the
repository. **Do not** combine multiple migrations into one command, and
**do not** continue past a non-zero exit code.

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

### 7a. Apply 053

```powershell
Invoke-StagingMigrationApply -FileName '053_contractor_managed_project_scope_sync.sql'
```

### 7b. Apply 054 — see Step 9 first

**Do not run 054 yet.** Go to Step 9 (Migration 054 Preflight) before
applying it. After 054, migration `055` is mandatory — see Step 9a-9c.

---

## 8. Intermediate Verification — After 053

`046`-`052` were already live before this runbook ran, so there is nothing
to intermediate-check for them here. Run this block immediately after
applying `053` (Step 7a):

```powershell
Write-Host "update_contractor_managed_project_scope exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='update_contractor_managed_project_scope';"

Write-Host "Grants correct - owner postgres, SECURITY DEFINER, PUBLIC+anon revoked, authenticated granted:"
Invoke-StagingReadOnlyQuery @"
SELECT p.proname, r.rolname AS owner, p.prosecdef,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname='update_contractor_managed_project_scope';
"@
```

Expect `owner=postgres`, `prosecdef=t`, `public_exec=f`, `anon_exec=f`
(053's own `REVOKE ... FROM PUBLIC, anon` already closes this one),
`auth_exec=t`. If this does not match, **stop** and do not apply 054.

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

## 9a. Migration 055 Preflight — Mandatory ACL Hotfix

**055 is not optional.** Run this immediately after 054's postflight above,
before touching anything in Step 10.

The eight user-facing RPCs (exact `regprocedure` signatures):

- `public.save_contractor_schedule_draft(bigint,jsonb,uuid)`
- `public.can_access_schedule_submissions(bigint)`
- `public.contractor_schedule_lifecycle_status(bigint)`
- `public.submit_contractor_schedule(bigint,uuid,text)`
- `public.request_schedule_changes(bigint,text,uuid)`
- `public.approve_schedule_submission(bigint,text,uuid)`
- `public.create_contractor_managed_project(jsonb,text[],uuid)`
- `public.update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)`

The two trigger-only functions:

- `public.prevent_schedule_version_task_mutation()`
- `public.prevent_scope_mutation_during_review()`

```powershell
$userFacingRpcs = @(
    'public.save_contractor_schedule_draft(bigint,jsonb,uuid)',
    'public.can_access_schedule_submissions(bigint)',
    'public.contractor_schedule_lifecycle_status(bigint)',
    'public.submit_contractor_schedule(bigint,uuid,text)',
    'public.request_schedule_changes(bigint,text,uuid)',
    'public.approve_schedule_submission(bigint,text,uuid)',
    'public.create_contractor_managed_project(jsonb,text[],uuid)',
    'public.update_contractor_managed_project_scope(bigint,jsonb,text[],uuid)'
)
$triggerOnlyFunctions = @(
    'public.prevent_schedule_version_task_mutation()',
    'public.prevent_scope_mutation_during_review()'
)

Write-Host "update_contractor_managed_project_scope(bigint,jsonb,text[],uuid) exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='update_contractor_managed_project_scope';"

Write-Host "create_contractor_managed_project(jsonb,text[],uuid) exists (expect 1):"
Invoke-StagingReadOnlyQuery "SELECT count(*) FROM pg_proc WHERE proname='create_contractor_managed_project';"

Write-Host "Total project count BEFORE 055 (record this - compared again in postflight):"
$projectsTotalBefore = Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects;"
Write-Host "projectsTotalBefore: $projectsTotalBefore"

Write-Host "Pre-055 anon EXECUTE count across the 8 user-facing RPCs (expect exactly 6 - 053/054 already closed 2 of the 8):"
$anonRpcRows = $userFacingRpcs | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('anon', '$_', 'EXECUTE');"
}
$anonRpcCount = ($anonRpcRows | Where-Object { $_.Trim() -eq 't' }).Count
Write-Host "pre055AnonUserFacingRpcExecuteCount: $anonRpcCount"
if ($anonRpcCount -ne 6) { throw "REFUSING: expected exactly 6 of 8 user-facing RPCs to still have anon EXECUTE pre-055, found $anonRpcCount. Stop and investigate before applying 055." }

Write-Host "Pre-055 trigger-only function anon/authenticated EXECUTE (expect exactly 1 of 2 for each - prevent_schedule_version_task_mutation was already locked down in 049):"
$anonTriggerRows = $triggerOnlyFunctions | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('anon', '$_', 'EXECUTE');"
}
$authTriggerRows = $triggerOnlyFunctions | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('authenticated', '$_', 'EXECUTE');"
}
$anonTriggerCount = ($anonTriggerRows | Where-Object { $_.Trim() -eq 't' }).Count
$authTriggerCount = ($authTriggerRows | Where-Object { $_.Trim() -eq 't' }).Count
Write-Host "pre055AnonTriggerFunctionExecuteCount: $anonTriggerCount"
Write-Host "pre055AuthenticatedTriggerFunctionExecuteCount: $authTriggerCount"
if ($anonTriggerCount -ne 1) { throw "REFUSING: expected exactly 1 of 2 trigger-only functions to still have anon EXECUTE pre-055, found $anonTriggerCount. Stop." }
if ($authTriggerCount -ne 1) { throw "REFUSING: expected exactly 1 of 2 trigger-only functions to still have authenticated EXECUTE pre-055, found $authTriggerCount. Stop." }

Write-Host "MIGRATION_055_PREFLIGHT_PASS"
```

If any count above does not match exactly, **stop** — this is not the
expected pre-hotfix exposure this runbook was written against.

---

## 9b. Apply Migration 055

Its own separate release manifest
(`scripts/manifests/contractor-schedule-function-acl-055.psd1`), its own
single transaction, applied only after 9a passes:

```powershell
Invoke-StagingMigrationApply -FileName '055_restrict_contractor_schedule_function_acl.sql'
```

---

## 9c. Migration 055 ACL Postflight

```powershell
Write-Host "Post-055 anon EXECUTE count across the 8 user-facing RPCs (expect 0):"
$anonRpcRowsAfter = $userFacingRpcs | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('anon', '$_', 'EXECUTE');"
}
$anonRpcCountAfter = ($anonRpcRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
Write-Host "anonymousUserFacingRpcExecuteCount: $anonRpcCountAfter"
if ($anonRpcCountAfter -ne 0) { throw "REFUSING: expected 0 of 8 user-facing RPCs to have anon EXECUTE post-055, found $anonRpcCountAfter." }

Write-Host "Post-055 authenticated EXECUTE count across the 8 user-facing RPCs (expect 8):"
$authRpcRowsAfter = $userFacingRpcs | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('authenticated', '$_', 'EXECUTE');"
}
$authRpcCountAfter = ($authRpcRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
Write-Host "authenticatedUserFacingRpcChecksPassed: $($authRpcCountAfter -eq 8)"
if ($authRpcCountAfter -ne 8) { throw "REFUSING: expected all 8 user-facing RPCs to keep authenticated EXECUTE post-055, found $authRpcCountAfter." }

Write-Host "Post-055 service_role EXECUTE count across the 8 user-facing RPCs (expect 8 - Supabase platform default, not granted by this migration):"
$serviceRoleRpcRowsAfter = $userFacingRpcs | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('service_role', '$_', 'EXECUTE');"
}
$serviceRoleRpcCountAfter = ($serviceRoleRpcRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
$serviceRoleRpcPassed = $serviceRoleRpcCountAfter -eq 8

Write-Host "Post-055 trigger-only function anon/authenticated/service_role EXECUTE (expect 0/0/2):"
$anonTriggerRowsAfter = $triggerOnlyFunctions | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('anon', '$_', 'EXECUTE');"
}
$authTriggerRowsAfter = $triggerOnlyFunctions | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('authenticated', '$_', 'EXECUTE');"
}
$serviceRoleTriggerRowsAfter = $triggerOnlyFunctions | ForEach-Object {
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc "SELECT has_function_privilege('service_role', '$_', 'EXECUTE');"
}
$anonTriggerCountAfter = ($anonTriggerRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
$authTriggerCountAfter = ($authTriggerRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
$serviceRoleTriggerCountAfter = ($serviceRoleTriggerRowsAfter | Where-Object { $_.Trim() -eq 't' }).Count
Write-Host "anonymousTriggerFunctionExecuteCount: $anonTriggerCountAfter"
Write-Host "authenticatedTriggerFunctionExecuteCount: $authTriggerCountAfter"
if ($anonTriggerCountAfter -ne 0) { throw "REFUSING: expected 0 of 2 trigger-only functions to have anon EXECUTE post-055, found $anonTriggerCountAfter." }
if ($authTriggerCountAfter -ne 0) { throw "REFUSING: expected 0 of 2 trigger-only functions to have authenticated EXECUTE post-055, found $authTriggerCountAfter." }
$serviceRoleTriggerPassed = $serviceRoleTriggerCountAfter -eq 2

Write-Host "Total project count AFTER 055 (must equal projectsTotalBefore from 9a):"
$projectsTotalAfter = Invoke-StagingReadOnlyQuery "SELECT count(*) FROM public.projects;"
Write-Host "projectsTotalAfter: $projectsTotalAfter"
if ($projectsTotalAfter -ne $projectsTotalBefore) { throw "REFUSING: project count changed from $projectsTotalBefore to $projectsTotalAfter - 055 must never touch data. Stop." }

$serviceRoleExecuteChecksPassed = $serviceRoleRpcPassed -and $serviceRoleTriggerPassed
Write-Host "serviceRoleExecuteChecksPassed: $serviceRoleExecuteChecksPassed"
if (-not $serviceRoleExecuteChecksPassed) { throw 'REFUSING: service_role EXECUTE expectations (8 RPCs + 2 trigger functions) not met.' }

Write-Host ''
Write-Host 'MIGRATION_055_ACL_POSTFLIGHT_PASS'
```

If any check above throws, **stop** — do not proceed to Step 10.

---

## 10. Final Security Inventory — All 8 RPCs and Both Trigger-Only Functions

```powershell
$allTenFunctions = $userFacingRpcs + $triggerOnlyFunctions

Write-Host "Function owners / SECURITY DEFINER / search_path (expect owner=postgres, prosecdef=t, proconfig contains search_path=public for all 10):"
Invoke-StagingReadOnlyQuery @"
SELECT p.proname, r.rolname AS owner, p.prosecdef, array_to_string(p.proconfig, ',') AS proconfig
FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname IN ('save_contractor_schedule_draft','can_access_schedule_submissions','contractor_schedule_lifecycle_status','submit_contractor_schedule','request_schedule_changes','approve_schedule_submission','create_contractor_managed_project','update_contractor_managed_project_scope','prevent_schedule_version_task_mutation','prevent_scope_mutation_during_review')
ORDER BY p.proname;
"@

Write-Host "Full ACL matrix for all 10 functions (expect: the 8 RPCs all f(public)/f(anon)/t(authenticated)/t(service_role); the 2 trigger-only functions all f(public)/f(anon)/f(authenticated)/t(service_role)):"
foreach ($fn in $allTenFunctions) {
    Write-Host "-- $fn --"
    docker run --rm --network bridge --env PGPASSWORD postgres:17 `
      psql --dbname=$dbUri -X -v ON_ERROR_STOP=1 -tAc @"
SELECT
  has_function_privilege('public', '$fn', 'EXECUTE') AS public_exec,
  has_function_privilege('anon', '$fn', 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', '$fn', 'EXECUTE') AS authenticated_exec,
  has_function_privilege('service_role', '$fn', 'EXECUTE') AS service_role_exec;
"@
}

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

If any function in this inventory does not match its expected ACL shape,
**stop** and do not declare this rollout complete — investigate before
proceeding to Step 11.

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

## 14. Attestation — Two Separate Records

This rollout produces **two** attestation records, one per release manifest
— never merge them into one file.

1. Copy `scripts/manifests/staging-live-046-054-attestation.template.json`
   to `work/staging-live-046-054-attestation-<UTC timestamp>.json`. Fill in
   every field from Steps 1-8 (the `046`-`054` batch: note `046`-`052` were
   already applied before this runbook ran, so only `053`/`054`'s
   `startedAtUtc`/`completedAtUtc`/`exitCode` come from this session —
   record the others as already-applied with a note, not as freshly timed).
2. Copy `scripts/manifests/staging-live-contractor-schedule-function-acl-055-attestation.template.json`
   to `work/staging-live-contractor-schedule-function-acl-055-attestation-<UTC timestamp>.json`.
   Fill in every field from Steps 9a-9c and 10 (preflight counts, the single
   migration's timing/exit code, all of the postflight count fields, and
   `securityInventoryResult` from Step 10).

Hand both files back together with the Step 12 checklist. Never put
`STAGING_DB_URL` or any password into either file.

---

## Rollback Policy

Forward-only, per `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`. 046-054 are
additive (new columns/tables/functions, one corrective `UPDATE` in 054
scoped to a predicate that is empty on this dataset per the Phase 3E.3
rehearsal). The rollback baseline remains
`backups/staging/20260802T135704Z` — a full restore from it is a last
resort, not the default response to an unexpected result in this runbook.
