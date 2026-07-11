# Staging Deployment Runbook

1. Prove the target is explicitly named staging; reject production refs/domains and guessed credentials.
2. Capture migration history, schema diff and backup/recovery evidence.
3. Dry-run the expected append-only chain; investigate any unexpected migration before push.
4. Apply migrations only to staging, never use `db reset` unless the staging environment is documented disposable.
5. Seed distinguishable, idempotent staging-only users/projects; never copy production data.
6. Validate Auth redirects, roles, private bucket/RLS, limits and orphan scanner dry-run.
7. Build frontend with staging variables and deploy only to Preview/staging alias.
8. Run critical Auth, Contractor, PM, read-side, mobile, accessibility, Storage and integrity scenarios three times with unique periods and controlled cleanup.
9. Record database rows, audit fields, Storage paths and cross-tenant denials.
10. Stop on production references, unexpected destructive drift, missing backup evidence or unsanitized errors.

No staging environment was discovered locally, so this runbook was prepared but not executed.
