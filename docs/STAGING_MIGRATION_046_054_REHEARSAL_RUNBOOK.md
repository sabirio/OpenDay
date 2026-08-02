# Staging Backup and Disposable Restore Rehearsal — Migration Batch 046–054

Simplification Phase 3E.1. This is an **owner-executed** runbook. No command
in this document is ever run by an AI agent — agents may prepare tooling and
exact commands only (`docs/PRODUCTION_MIGRATION_EXECUTOR.md`'s rule applies
identically to staging in this program).

## Batch identity

- **batchId**: `contractor-managed-rollout-046-054`
- **Manifest**: `scripts/manifests/contractor-managed-rollout-046-054.psd1`
- **Migrations**: `046_contractor_schedule_draft_foundation.sql` through
  `054_fix_contractor_managed_scope_null_artifact.sql` (9 files, in that exact
  order — 052–054 are not independently promotable; 052 requires 046's
  `schedule_ownership_mode` column, 053 requires 049's
  `contractor_schedule_lifecycle_status()` and 051's
  `projects_scope_lifecycle_lock` trigger).
- **Expected target**: `EXPECTED_ENVIRONMENT=STAGING`,
  `EXPECTED_PROJECT_REF=sdndsekarwhumdbcqxni`.

## Stage B — Owner-executed staging backup

Prerequisite (one-time, local, not a secret): populate
`weekly-tracker/.env.staging` (gitignored — copy from
`weekly-tracker/.env.staging.example` and fill in `STAGING_DB_URL`, the
staging Session Pooler connection string). Never commit this file.

```powershell
cd C:\Users\skhai\cf-tracker
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\production-backup.ps1 `
  -Environment staging `
  -SourceCommit <git rev-parse HEAD, on feature/staging-backup-restore-rehearsal> `
  -ReleaseManifestPath scripts\manifests\contractor-managed-rollout-046-054.psd1 `
  -ExpectedReleaseManifestSha256 <sha256 of that manifest file> `
  -ExpectedBackupScriptSha256 <sha256 of scripts\production-backup.ps1>
```

Exact hash values to substitute are pinned in the Phase 3E.1 final report
(Section B / Section F) — recompute them yourself with `Get-FileHash` before
running; the script independently re-verifies both and fails closed on any
mismatch.

This performs, read-only against staging: `pg_dumpall --roles-only`,
`pg_dump --schema-only` (includes `auth`/`storage` schema DDL, excludes
`supabase_migrations`), `pg_dump --data-only` (same exclusions, plus
`storage.buckets_vectors`/`storage.vector_indexes` row data), and a
migration-history dump if `supabase_migrations` is present. Fails closed if:
the destination directory already exists; the target's Session Pooler
identity does not resolve to `sdndsekarwhumdbcqxni`; `STAGING_DB_URL` is
missing from `weekly-tracker/.env.staging`; the release-binding manifest or
script hash does not match. Output: `backups/staging/<UTC_TIMESTAMP>/` with
`roles.sql`, `schema.sql`, `data.sql`, `migration_history_schema.sql`,
`migration_history_data.sql`, `checksums.sha256`, `backup-manifest.json`.

**After running, provide back:** the output directory path, the UTC
timestamp, `backup-manifest.json`'s own checksum, the command's exit code,
and an explicit attestation that the target was staging (not production).

## Stage C — Disposable restore and rehearsal (agent-performed, local only)

Once the backup artifacts exist locally, the agent:
1. Verifies the backup (checksums, manifest fields, non-empty/non-truncated
   dumps, `environment: staging` recorded).
2. Restores into a disposable, isolated local Postgres 17 container (never
   the normal developer Supabase instance, never staging/production).
3. Runs a read-only preflight against the disposable copy (prerequisite
   objects through 045 present; 046–054 absent; the migration-054 baseline
   count).
4. Applies 046 → 054, one migration at a time, `psql -X -v ON_ERROR_STOP=1`,
   each in its own transaction.
5. Re-runs the migration-054 count (expects 0), verifies AUTO_GENERATED rows
   untouched.
6. Runs the full local DB certification suite against the disposable copy.
7. Runs the integrity queries (Phase 3E's own Section L list).
8. Verifies a second preflight reports the batch already applied
   (`SECOND_APPLY_PREVENTED_BY_INVENTORY_GATE`).

Teardown: the disposable container may be retained until this rehearsal's
report is reviewed; it is never staging or production, and its removal never
touches `backups/staging/<timestamp>/`, which is preserved permanently as
the actual staging backup record.

## Canonical promotion — explicitly deferred

`scripts/contracts/canonical-security-contract.json` is not modified by this
runbook. `canonicalMigrationPath.included` gains `046`–`054` only after: this
staging backup exists → disposable rehearsal passes → **live staging apply**
(owner-executed, separate runbook, not this one) → staging lifecycle smoke
test passes → owner staging attestation is complete → (separately) a full
production backup/disposable-rehearsal cycle passes.
