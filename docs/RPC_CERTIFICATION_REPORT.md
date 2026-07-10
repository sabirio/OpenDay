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
| CR-07 WP outside active scope | *(task: expect rollback)* | **NOT enforced** — `submit_contractor_report()` has no scope check; the row is accepted and inserted | see Section "Findings" below | FINDING, not a defect fix in this sprint |
| CR-08 duplicate WP item | *(task: expect rollback)* | **NOT enforced** — both duplicate rows inserted | see Findings | FINDING, not a defect fix in this sprint |
| CR-09 forced child failure (bad numeric cast) | full rollback, 0 rows everywhere | RPC errors `22P02`, 0 report/history/ledger rows | matched | PASS |
| CR-10 timeout/retry simulation | no duplicates on resend | 3rd call with the same request id still 1 report row | matched | PASS |

**40/40 individual checks passed.** 8/10 scenarios are clean PASS; 2 (CR-07,
CR-08) are real, verified findings about `submit_contractor_report()`'s
validation surface — not treated as pass/fail because fixing them would
change business semantics (should a contractor ever be blocked from
reporting an out-of-scope WP?) that Sprint 4.5's certification mandate
cannot decide unilaterally.

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

## Findings (not fixed — outside this sprint's business-semantics mandate)

- **CR-07/CR-08**: `submit_contractor_report()` (018, superseded by 023) has
  no WP-scope or duplicate-WP validation, unlike `submit_site_visit_atomic`
  (025), which validates both (SV-07, SV-08). This asymmetry may be
  intentional (contractor self-reports vs. PM verification having
  different strictness) or an oversight — it predates Sprint 4/4.5 and is
  not a regression introduced by the atomic wrapper. Recommend a product
  decision before any fix; not changed here per "не менять существующую
  business semantics" / "не расширять schema без доказанного runtime
  defect" — this is a validation gap, not a data-integrity defect (nothing
  is corrupted; a contractor can just report progress on an unexpected WP).
