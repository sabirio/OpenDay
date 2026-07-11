# Production Release Rehearsal

Prepared only; not executed against production.

1. Verify current production backup and tested restore owner.
2. Capture production migration history read-only.
3. Compare expected append-only migration list; stop on drift.
4. Perform provider-supported dry-run without writes.
5. Apply database migrations before frontend; 027 is the latest expected migration.
6. Deploy Edge Functions only if the release inventory proves they are used (none added here).
7. Deploy production frontend after DB health/RLS/RPC smoke checks.
8. Smoke-test Auth roles, project reads, Contractor submit, PM submit, private evidence and canonical dashboards.
9. Prefer forward-fix after a data-bearing migration; rollback only with reviewed function restoration and no data-loss risk.
10. Stop on cross-tenant visibility, duplicate writes, broken Auth, unexpected migration, invalid Storage references or canonical mismatch.
