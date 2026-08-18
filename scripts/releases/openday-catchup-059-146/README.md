# OpenDay database catch-up 059–146

This release repairs the hosted database lag behind application commit
`c79d45b104a0fe10b30c7b850b35949b615acba1`.

## Safety model

- The staging and production packages are different and bound to the exact
  catalog fingerprints inspected on 2026-08-18.
- Each package performs preflight assertions before its first schema change.
- Every migration and postflight assertion runs in one PostgreSQL transaction.
- Any SQL error aborts the transaction; do not edit, split, or resume a failed
  package.
- The package registers every migration it applies in
  `public.schema_migration_ledger` using the source file's normalized SHA-256.
- Agents prepare and verify these immutable artifacts. The owner runs live
  staging and production database commands.

## Required order

1. In the Supabase Dashboard select **OpenDay Staging** with project ref
   `sdndsekarwhumdbcqxni`.
2. Verify `staging-catchup.sql` against `staging-catchup.sql.sha256`.
3. Open a new SQL Editor query, paste the complete `staging-catchup.sql`, and
   run it once. Do not use production and do not run only part of the file.
4. Run the read-only staging postflight/advisors and application smoke checks.
5. Only after every staging gate passes, select production project ref
   `szgbkeqornkdngoegyso`.
6. Take and restore-verify a fresh production backup using the canonical owner
   runbook.
7. Verify `production-catchup.sql` against
   `production-catchup.sql.sha256`, paste the complete file into a new SQL
   Editor query, and run it once.
8. Run the read-only production postflight/advisors and authenticated browser
   smoke checks. A failed postflight after `COMMIT` requires a new forward-only
   repair; never rerun this package.

## Expected repair

The postflight proves, among other objects, that `profiles.job_role`,
`progress_history.work_ontology_version_id`,
`contractor_report_risk_work_groups`, the Work Ontology, BOQ, Tender, Budget,
Commercial, Project Team, Procurement Strategy, and migration ledger contracts
all exist. It also checks the frozen 12-discipline / 141-work-group /
563-standard-line BOQ ontology and the migration-146 function ACL hardening.
