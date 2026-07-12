# Phase 10 Pre-deployment Audit

Date: 2026-07-11. Classification: **SUPERSEDED HISTORICAL AUDIT**.

Closure note (2026-07-12): the backup gate was subsequently cleared, migrations 028 and 029 were applied, composite certification passed with zero differences, and the frozen baseline is `backups/production/20260712T160441Z/`. Core Stabilization has not begun. This file preserves the earlier pre-deployment evidence; the canonical final record is `PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md`.

- Staging: Supabase `sdndsekarwhumdbcqxni`; Vercel `openday-staging` / `prj_3fgguj7gxiyfcWRxv0zr2vMhAOOr`.
- Production: Supabase `szgbkeqornkdngoegyso`; Vercel `noryxapp` / `prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3`; domains `openday.fit`, `www.openday.fit`.
- Staging certification: RLS 19/19, Storage 15/15, cloud E2E 4/4, three consecutive clean cycles after the final tooling fix, retries 0 and skips 0.
- Expected fresh migration path: `000`, `010`, `012–027`; migration 011 remains legacy-only.
- Production Vercel deployment `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr` is Ready and is the read-only rollback reference.
- Production Supabase backup inventory: PITR disabled and no physical backups returned.

Stop criterion activated before production migration dry-run. No production resource was modified.

Phase 10A re-audit confirmed PostgreSQL dump/restore clients are installed and approximately 54.6 GiB is free. The required gitignored `weekly-tracker/.env.production.local` exists. Safe in-memory inspection confirmed the production Session Pooler hostname class, project ref in the pooler username, port 5432, and absence of the staging ref. PostgreSQL rejected password authentication during the read-only connection preflight; no SQL query or dump ran. The backup/restore gate remains closed.

A second read-only authentication test after the owner updated and percent-encoded the credential produced the same authentication rejection. The fingerprint again passed before connection. No SQL statement executed.

After the subsequent credential update, authentication was tested both in URI mode and with URI components decoded in memory into process-scoped libpq variables. Both were rejected before SQL execution, ruling out client URI parsing as the cause. No credential value was logged.
