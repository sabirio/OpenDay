# RPC Certification Report — Sprint 4.5, Stages 5-6

All scenarios executed against the local certification stack (see
`docs/CERTIFICATION_ENVIRONMENT.md`) via real `signInWithPassword` sessions
and real `supabase.rpc(...)` calls — never the service-role client, never a
mocked service. DB evidence column is a direct `psql` count/query against
the deployed schema, independent of what the RPC itself returned.

Scripts: `weekly-tracker/scripts/certification/certifyContractorReport.mjs`,
`certifySiteVisit.mjs`. Run via `npm run test:db`.

## Contractor Report RPC (`submit_contractor_report_atomic`) — CR-01..CR-10

| Scenario | Expected | Actual | DB evidence | Status |
|---|---|---|---|---|
| CR-01 successful submit | 1 report, 3 WP children, 1 history row, response has persisted ids, client_request_id saved | matched | `contractor_reports`, `contractor_report_wps`, `progress_history`, `write_command_requests` counts all confirmed | PASS |
| CR-02 idempotent replay | no new rows anywhere, `idempotentReplay=true`, same ids returned | matched | 0 new rows across all 4 tables on replay | PASS |
| CR-03 new request id, same project+date | rejected as business duplicate | rejected, `23505`, no new row, no ledger row for the new id | matched | PASS |
| CR-04 foreign project (Company A contractor -> Project B) | authorization failure, 0 rows everywhere | rejected `42501`/company message, 0 report/history/ledger rows on Project B | matched | PASS |
| CR-05 unassigned contractor | denied per current access model (assignment-scoped for contractors) | denied, 0 rows | matched | PASS |
| CR-06 viewer | denied | denied, role-cannot-submit message, 0 rows | matched | PASS |
| CR-07 WP outside active scope | rejected, full rollback | rejected `22023: WORK_PACKAGE_OUT_OF_SCOPE`, 0 report/child/history/ledger rows | matched | PASS |
| CR-08 duplicate WP item | rejected, full rollback | rejected `22023: DUPLICATE_WORK_PACKAGE`, 0 report/child/history/ledger rows | matched | PASS |
| CR-09 forced child failure (bad numeric cast) | full rollback, 0 rows everywhere | RPC errors `22P02`, 0 report/history/ledger rows | matched | PASS |
| CR-10 timeout/retry simulation | no duplicates on resend | 3rd call with the same request id still 1 report row | matched | PASS |

**50/50 individual checks passed. 10/10 scenarios PASS.** CR-07/CR-08 were
initially findings (see "Resolved finding" below) and are now genuine,
runtime-verified rejections after append-only migration
`027_contractor_report_wp_validation.sql` moved WP-scope and duplicate-WP
validation directly into `submit_contractor_report_atomic` (rather than
the older, unvalidated `submit_contractor_report()`). Re-certification
confirms both the rejection itself and that it leaves zero partial rows in
every affected table (`contractor_report_wps`, `progress_history`,
`write_command_requests`), matching the same all-or-nothing standard
already proven for CR-09/SV-07/SV-08.

## PM Site Visit RPC (`submit_site_visit_atomic`) — SV-01..SV-12

| Scenario | Expected | Actual | DB evidence | Status |
|---|---|---|---|---|
| SV-01 successful submit | 1 visit, observations, discrepancy summary, Gantt cache updated, 1 history row (`overall_progress=NULL`), sign/version metadata, audit trigger fires, response has ids | matched exactly | `site_visits`, `site_visit_wps`, `site_visit_discrepancies`, `project_gantt_tasks`, `progress_history`, `pg_trigger` all confirmed | PASS |
| SV-02 idempotent replay | no duplicates anywhere | matched | 0 new rows on replay | PASS |
| SV-03 foreign project | denied, 0 partial rows | matched | 0 rows on Project B | PASS |
| SV-04 "unassigned" PM (same company, not in `assigned_projects`) | *(task: "per current access model")* | **ALLOWED** — `can_write_project()` (020) is company-scoped, not per-project; `assigned_projects` is only consulted for the contractor role | confirmed by reading + runtime test agreeing | PASS as the verified current access model (not a defect — documented design) |
| SV-05 viewer / contractor | denied (role gate is admin/pm only) | both denied | matched | PASS |
| SV-06 foreign contractor_report_id | denied, full rollback | rejected `23503`/mismatch message, 0 rows, 0 ledger row | matched | PASS |
| SV-07 duplicate WP observations | rejected, rollback | rejected, "Duplicate WP observations", 0 partial rows | matched | PASS |
| SV-08 out-of-scope / nonexistent WP | rejected, no partial rows | rejected for both archived and nonexistent wpId | matched | PASS |
| SV-09 invalid progress (negative, >100, non-numeric) | controlled validation error | all 3 rejected, 0 partial rows each | matched | PASS |
| SV-10 forced discrepancy-child failure | full rollback proven by query | RPC errors on bad cast, 0 site_visits/progress_history rows, 0 ledger row | matched | PASS |
| SV-11 Gantt/cache transactionality | in-transaction, no partial writes | confirmed: SV-01's committed value persists; SV-10's failed call left it untouched | matched | PASS |
| SV-12 historical sign metadata | `discrepancy_sign_convention='pm-minus-contractor'`, `discrepancy_version=1` on new rows, readable by canonical read adapter shape | confirmed on `site_visit_wps`, `site_visit_discrepancies`, and `progress_history.snapshot` | matched | PASS |

**50/50 individual checks passed. 12/12 scenarios PASS**, one (SV-04)
resolved as "confirmed current design, not a defect" rather than a strict
pass/fail, per the task's own phrasing for that scenario.

## Resolved finding — CR-07/CR-08 (previously open, now closed by migration 027)

`submit_contractor_report()` (018, superseded by 023) originally had no
WP-scope or duplicate-WP validation, unlike `submit_site_visit_atomic`
(025), which validates both (SV-07, SV-08). This asymmetry predated
Sprint 4/4.5 and was not a regression introduced by the atomic wrapper; it
was documented as a business-semantics gap rather than fixed unilaterally
during the original Stage 5-6 pass.

A follow-on Sprint 4.5 continuation closed the gap via an append-only
migration, `src/migrations/027_contractor_report_wp_validation.sql`, which
adds the same two checks `submit_site_visit_atomic` already enforced
directly inside `submit_contractor_report_atomic`:
- `WORK_PACKAGE_OUT_OF_SCOPE` (`22023`) — every `wpId` in the payload must
  reference a non-archived `project_gantt_tasks` row belonging to the same
  project.
- `DUPLICATE_WORK_PACKAGE` (`22023`) — no `wpId` may appear more than once
  in a single submission.

No historical migration (000-026) was edited; 027 is purely additive
(`CREATE OR REPLACE FUNCTION`). Re-run against the full fresh-path chain
(now 18 files, `000, 010, 012-027`) and re-certified: CR-07/CR-08 are PASS
above, with zero partial rows confirmed via direct `psql` counts on every
affected table.
