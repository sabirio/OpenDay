# Production Rollback and Forward-fix Runbook

- Frontend rollback reference: Vercel deployment `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr`.
- Database rollback is not assumed. Use transaction rollback before commit, a reviewed down migration, proven backup restore, or staging-tested append-only forward fix.
- Stop on identity mismatch, missing backup, unexpected migration, drift, RLS regression, data anomaly, wrong endpoint or critical route failure.
- Never improvise production SQL that has not passed staging.
