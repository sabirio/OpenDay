# OpenDay security migration 147

This forward-only release hardens five legacy trigger-only functions after the
059–146 database catch-up. It pins their `search_path` and removes direct
execution from all Data API roles. The migration does not modify application
data.

## Required order

1. Apply and certify the 059–146 catch-up on OpenDay Staging.
2. From the repository root run `RUN-STAGING-SECURITY-147.cmd` once.
3. Confirm that the command ends with `STAGING_SECURITY_147=PASS`.
4. Run the read-only schema, advisor, database-security, and application smoke
   checks. On any error, do not rerun or split the package.
5. Before production, take and restore-verify a fresh production backup.
6. Apply the production 059–146 catch-up, certify it, then apply
   `production-security-147.sql` through the owner-only production command.
7. Run the full production postflight and authenticated browser smoke checks.

Both artifacts are target-bound, SHA-256 protected, transactional, and require
an exact migration-146 ledger row before they will run.
