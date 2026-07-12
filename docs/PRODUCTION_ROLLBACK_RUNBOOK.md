# Production Rollback and Forward-fix Runbook

Current closure (2026-07-12): the verified restore point and frozen database/security baseline are `backups/production/20260712T160441Z/`. Migrations 028 and 029 are applied and composite certification passed with zero differences. Do not roll back additive objects after traffic; use a separately reviewed forward-only migration. No production `ALTER DEFAULT PRIVILEGES` change was made. Core Stabilization is NOT_STARTED. `PRODUCTION_SECURITY_REMEDIATION_RUNBOOK.md` is the canonical security-operations record.

- Frontend rollback reference: Vercel deployment `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr`.
- Database rollback is not assumed. Use transaction rollback before commit, a reviewed down migration, proven backup restore, or staging-tested append-only forward fix.
- Stop on identity mismatch, missing backup, unexpected migration, drift, RLS regression, data anomaly, wrong endpoint or critical route failure.
- Never improvise production SQL that has not passed staging.

## A. Database restore

A verified logical restore point now exists at `backups/production/20260712T160441Z/`. A real recovery may still require a new database/project and controlled cutover; do not promise an instant in-place rollback. Validate manifest/checksums and restore into a disposable target before any recovery decision.

## B. Frontend rollback

Use Vercel deployment `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr` only after confirming its production identity and aliases. Frontend rollback does not roll back database changes.

## C. Storage recovery

Database dumps preserve Storage metadata, not object bytes. The planned release must be reclassified and stopped if it deletes, renames, moves or mass-cleans Storage objects. Long-term object retention is an owner decision.

## D. Auth and sessions

Logical database restoration does not guarantee preservation of active Auth sessions/tokens or external provider state. Plan for reauthentication and verify redirects/providers separately.

## E. Platform limitations

Realtime/publications, Edge Functions, provider configuration and external secrets require separate inventory and recovery procedures. They are not proven by a PostgreSQL dump alone.
