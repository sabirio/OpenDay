# OpenDay database catch-up 059–146

This release repairs the hosted database lag behind application commit
`c79d45b104a0fe10b30c7b850b35949b615acba1`.

## Safety model

- The staging and production packages are different and bound to the exact
  catalog fingerprints inspected on 2026-08-18.
- Each package performs preflight assertions before its first schema change.
- The production package verifies and removes the obsolete four-role
  `profiles_role_check` before migration 119 converts `Viewer` to `Executive`;
  postflight rejects any remaining legacy `Viewer` role or constraint.
- Every migration and postflight assertion runs in one PostgreSQL transaction.
- Any SQL error aborts the transaction; do not edit, split, or resume a failed
  package.
- The package preserves the ledger's canonical supported-baseline checkpoint
  through migration 132 and registers migrations 133–146 individually using
  each source file's normalized SHA-256.
- Agents prepare and verify these immutable artifacts. The owner runs live
  staging and production database commands.

## Required order

1. In the Supabase Dashboard select **OpenDay Staging** with project ref
   `sdndsekarwhumdbcqxni`.
2. From the repository root run
   `powershell -ExecutionPolicy Bypass -File scripts/release/Invoke-OwnerStagingCatchup.ps1`.
   The owner command verifies `staging-catchup.sql` against its SHA-256,
   rejects every target except the exact staging project, and executes the
   complete package through `psql`. Use the **Session pooler** URI from the
   Supabase Connect panel when direct IPv6 connectivity is unavailable.
3. Confirm that the command ends with `STAGING_CATCHUP=PASS`. Do not use the
   SQL Editor: the immutable package exceeds its query-size limit. On any
   error, do not rerun or split the package; preserve the output for review.
4. Run the read-only staging postflight/advisors and application smoke checks.
5. Only after every staging gate passes, select production project ref
   `szgbkeqornkdngoegyso`.
6. Take and restore-verify a fresh production backup using the canonical owner
   runbook.
7. Run `TEST-PRODUCTION-CONNECTION.cmd` first. This checks the production
   Session pooler URI and password with `SELECT 1`; it does not execute any
   migration or change database state. Continue only after
   `PRODUCTION_CONNECTION=PASS`.
8. Verify `production-catchup.sql` against
   `production-catchup.sql.sha256` and execute the complete file once through
   a direct PostgreSQL client. Do not use the SQL Editor, split the package,
   or expose the database password in command history.
9. Run the read-only production postflight/advisors and authenticated browser
   smoke checks. A failed postflight after `COMMIT` requires a new forward-only
   repair; never rerun this package.

## Expected repair

The postflight proves, among other objects, that `profiles.job_role`,
`progress_history.work_ontology_version_id`,
`contractor_report_risk_work_groups`, the Work Ontology, BOQ, Tender, Budget,
Commercial, Project Team, Procurement Strategy, and migration ledger contracts
all exist. It also checks the frozen 12-discipline / 141-work-group /
563-standard-line BOQ ontology and the migration-146 function ACL hardening.
