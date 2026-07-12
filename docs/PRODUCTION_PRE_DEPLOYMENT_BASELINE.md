# Production Pre-deployment Baseline

Status: **SUPERSEDED — historical pre-deployment baseline**.

Final database/security baseline: **FROZEN** at `backups/production/20260712T160441Z/` after migrations 028 and 029 and a zero-difference composite PASS. Core Stabilization remains NOT_STARTED. See `PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md`; the details below describe the earlier backup-gate state only.

The production identity is confirmed from authenticated read-only discovery. Current frontend deployment is `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr` on `noryxapp`, status Ready, with aliases `openday.fit` and `www.openday.fit`.

Supabase backup discovery returned PITR disabled and zero physical backups. Migration history, schema inventory, row/object counts and migration dry-run were intentionally not collected through a production database connection. No production row data was exported.

Phase 10A status: **PRODUCTION_BACKUP_CREATION_FAILED**. The local production URI passed safe project/port fingerprint checks, but PostgreSQL rejected password authentication. No SQL query, logical backup, Storage inventory, disposable restore or restore verification was possible. Production remains read-only and unchanged.
