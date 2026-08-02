# Staging Bridge 037 + 041 — Owner Runbook

Simplification Phase 3E.2. Live staging is missing migrations `037` and
`041`, which `contractor-managed-rollout-046-054`
(`scripts/manifests/contractor-managed-rollout-046-054.psd1`) depends on.
This runbook bridges **only** `037` and `041` onto staging. It does **not**
apply `046`-`054` — that remains a separate, later owner package, prepared
only after this bridge is confirmed live and a fresh post-bridge backup
exists.

This is an **owner-executed** runbook. No command in this document is ever
run by an AI agent — agents prepare tooling and exact commands only, per the
same rule `docs/PRODUCTION_MIGRATION_EXECUTOR.md` and
`docs/STAGING_MIGRATION_046_054_REHEARSAL_RUNBOOK.md` already establish for
production and staging respectively.

## Batch identity

- **batchId**: `staging-bridge-037-041`
- **Manifest**: `scripts/manifests/staging-bridge-037-041.psd1`
- **Migrations**: `037_retail_historical_project_profile.sql`,
  `041_versioned_scope_templates.sql` — in that order (file-number
  convention; the two are mutually independent, see Phase 3E.2's own report
  Section 4).
- **Expected target**: `EXPECTED_ENVIRONMENT=STAGING`,
  `EXPECTED_PROJECT_REF=sdndsekarwhumdbcqxni`.
- **Rollback baseline**: `backups/staging/20260802T124552Z`
  (`backup-manifest.json` SHA-256
  `31e00766c36ed54c0e6bbdcd141cc6b2a825a7eea95ca96548f2116afd6b0400`),
  the same verified backup Phase 3E.1 used. It predates this bridge — no
  bridge migration has ever been applied to live staging as of that backup.

## Rollback policy

Forward-only, per `docs/PRODUCTION_ROLLBACK_RUNBOOK.md`'s policy applied
identically to staging. Both `037` and `041` are additive (new nullable
columns, new indexes, new policies, one seed row) — the default recovery
path if something looks wrong after apply is a new corrective migration, not
a `DROP COLUMN`/`DROP TABLE` rollback and not a full restore from the
backup above. The backup is retained as a last-resort restore path only.

## Prerequisites (one-time, already satisfied)

`weekly-tracker/.env.staging` is populated with the real `STAGING_DB_URL`
(gitignored; this is the same file Phase 3E.1's staging backup already used
successfully). Do not commit it. Never paste its contents into chat, a
commit, or this runbook.

## Step 1 — Identity verification (read-only, no schema change)

Confirms the connection string you are about to use really points at
staging, not production, before touching anything.

```powershell
cd C:\Users\skhai\cf-tracker
$envText = Get-Content weekly-tracker\.env.staging -Raw
if ($envText -notmatch '(?m)^STAGING_DB_URL\s*=\s*(.+)$') { throw 'STAGING_DB_URL missing' }
$uri = [Uri]$Matches[1].Trim().Trim('"').Trim("'")
$user = $uri.UserInfo.Split(':')[0]
if ($user -ne 'postgres.sdndsekarwhumdbcqxni') {
    throw "REFUSING: connection user '$user' does not match expected 'postgres.sdndsekarwhumdbcqxni' (staging). Do not proceed."
}
Write-Host "Identity verified: $user (staging)"
```

This must print `Identity verified: postgres.sdndsekarwhumdbcqxni (staging)`
before you continue. If it throws, stop and do not run anything below.

## Step 2 — Backup binding verification (read-only)

```powershell
Get-FileHash backups\staging\20260802T124552Z\backup-manifest.json -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
```

Must print `31E00766C36ED54C0E6BBDCD141CC6B2A825A7EEA95CA96548F2116AFD6B0400`
(case-insensitive match). If it does not, stop — the rollback baseline this
runbook was written against is not the file on disk.

## Step 3 — Migration hash re-verification (read-only, immediately before apply)

```powershell
Get-FileHash weekly-tracker\src\migrations\037_retail_historical_project_profile.sql -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: B9823300CA093EB929E07B63677363DCC7CAD653EAE9611570544E49B601DEFA

Get-FileHash weekly-tracker\src\migrations\041_versioned_scope_templates.sql -Algorithm SHA256 |
  Select-Object -ExpandProperty Hash
# expect: F44E816331B07B494DEF2C1887F867577EAE25CFDFFC05365A73F872B2C2F7BE
```

## Step 4 — Preflight for 037 (read-only)

```powershell
$env:PGPASSWORD = '<the password from STAGING_DB_URL, never typed into a file>'
$dbUri = 'postgresql://postgres.sdndsekarwhumdbcqxni@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require'
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -c "SELECT count(*) AS existing_037_columns FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN ('location_type','store_concept','sales_area_sqm','back_of_house_area_sqm','actual_construction_start_date','actual_construction_completion_date','actual_opening_date','budget','actual_cost','currency_code');"
```

Expect `0`. Any other number means 037 is partially or fully applied already
— stop and investigate before proceeding (do not re-apply).

## Step 5 — Apply 037 (its own transaction)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -f weekly-tracker\src\migrations\037_retail_historical_project_profile.sql
```

Record the exit code and wall-clock start/end (UTC) — you will need both
for the attestation record in Step 12.

## Step 6 — Postflight for 037 (read-only)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -c "SELECT count(*) AS new_037_columns FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name IN ('location_type','store_concept','sales_area_sqm','back_of_house_area_sqm','actual_construction_start_date','actual_construction_completion_date','actual_opening_date','budget','actual_cost','currency_code');"
```

Expect `10`.

## Step 7 — Preflight for 041 (read-only)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -c "SELECT count(*) AS existing_041_columns FROM information_schema.columns WHERE table_schema='public' AND table_name='templates' AND column_name IN ('family','company_id');"
```

Expect `0`.

## Step 8 — Apply 041 (its own transaction)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -f weekly-tracker\src\migrations\041_versioned_scope_templates.sql
```

Record exit code and start/end (UTC).

## Step 9 — Postflight for 041 (read-only)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -c "SELECT id, name, family, company_id, version, is_active FROM public.templates WHERE family='retail-fitout-v2';"
```

Expect exactly one row: `dc92175a-251c-45ab-a4fd-c83c1c668ef4 | Retail
Fit-Out (Zoned) | retail-fitout-v2 | <NULL> | 1 | t`.

## Step 10 — Final bridge integrity check (read-only)

```powershell
psql -X --dbname=$dbUri -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM public.projects) AS project_count, (SELECT count(*) FROM public.templates) AS template_count;"
```

Compare `project_count` against the row count you had before Step 5 (should
be unchanged — 037/041 never delete or insert into `projects`).
`template_count` should be exactly one higher than before Step 8.

## Step 11 — Clear the credential

```powershell
Remove-Item Env:\PGPASSWORD
```

## Step 12 — Fill in the attestation records

Copy `scripts/manifests/staging-bridge-037-041-attestation.template.json`
to two files (`...-037.json`, `...-041.json`), fill in the fields recorded
in Steps 5/6 and 8/9, and hand them back (see the Phase 3E.2 report's
mandatory owner-action pause for the exact list of what to return). Do not
put `STAGING_DB_URL` or any password in these files.

## Explicitly deferred

`046`-`054` are **not** applied by this runbook. That batch requires a
separate, later owner package prepared only after: this bridge is live, a
fresh staging backup is taken and verified, a fresh disposable restore
confirms `037`/`041` present and no other drift, and the `046`-`054`
rehearsal is re-run against that fresh restore (not the local bridge copy
used in this phase).
