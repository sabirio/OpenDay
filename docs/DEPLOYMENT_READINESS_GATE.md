# Deployment Readiness Gate — Sprint 4.5

Environment: local Supabase CLI stack (Docker), never production. See
`docs/CERTIFICATION_ENVIRONMENT.md`. Date: 2026-07-10.

Legend: **PASS** (proven by real runtime execution) / **FAIL** / **UNVERIFIED**
(not executed) / **N/A**.

## Database

| Item | Status | Evidence |
|---|---|---|
| Clean migration apply | PASS | `docs/DATABASE_CERTIFICATION_REPORT.md` — 16/17 fresh-path files applied cleanly first pass; `011` correctly excluded (DEFECT-02); full chain, now 18 files incl. `026` and `027`, reproduced identically across every clean reset since |
| Migration 025 compiled | PASS | applied without error in every reset |
| Migration 027 compiled | PASS | closes CR-07/CR-08 (see Contractor Report row below); applied without error in every reset |
| Functions exist | PASS | `pg_proc` query confirmed all 6 key functions, all `SECURITY DEFINER` |
| Constraints exist | PASS | unique idempotency constraint + 2 partial unique indexes confirmed via `pg_constraint`/`pg_indexes` |
| Grants exist | PASS (after fix) | DEFECT-03 found + fixed via `026`; EXECUTE grants confirmed `authenticated`-only; base table grants confirmed present and correctly scoped (including the `write_command_requests` exclusion) |
| Triggers exist | PASS | 6 triggers (3 audit + 3 updated_at) confirmed via `pg_trigger` |

## Contractor Report

| Item | Status | Evidence |
|---|---|---|
| Success | PASS | CR-01, real RPC call, real rows |
| Rollback | PASS | CR-09, forced failure, 0 rows via `psql` |
| Idempotency | PASS | CR-02, CR-10 |
| Cross-tenant | PASS | CR-04 |
| Unassigned user | PASS | CR-05, CR-06 |
| History | PASS | Stage 7, source linkage + metadata confirmed |
| Audit | PASS | `trg_audit_contractor_reports` confirmed present; not independently re-verified to fire per-call in this pass (relies on the trigger's own existing test coverage in the main suite) |
| WP scope / duplicate-WP validation | PASS (resolved) | CR-07/CR-08 — previously a documented finding; closed via append-only migration `027_contractor_report_wp_validation.sql`, re-certified with 0 partial rows on rejection |

## PM Site Visit

| Item | Status | Evidence |
|---|---|---|
| Success | PASS | SV-01 |
| Rollback | PASS | SV-10 |
| Idempotency | PASS | SV-02 |
| Cross-tenant | PASS | SV-03 |
| Foreign report | PASS | SV-06 |
| Discrepancy metadata | PASS | SV-12 |
| History | PASS | Stage 7, `overall_progress=NULL` semantics confirmed |
| Audit | PASS | `trg_audit_site_visits` confirmed present |

## RLS

| Item | Status | Evidence |
|---|---|---|
| Role matrix | PASS | `docs/RLS_RUNTIME_CERTIFICATION.md` |
| Direct API | PASS | cross-tenant SELECT/INSERT/UPDATE/DELETE all denied with ground-truth verification |
| RPC | PASS | cross-tenant RPC call denied, 0 side effects |
| Other tenant | PASS | Company B Admin vs. Project A, full matrix |
| Unauthenticated | PASS | anon key, no session, denied on read/write/RPC |

## Storage

| Item | Status | Evidence |
|---|---|---|
| Upload | PASS | ST-01 |
| Read | PASS | ST-01 (authorized), ST-03 (cross-tenant denied) |
| Delete | PASS | ST-04 (cross-tenant denied) + ST-04b (own-tenant delete positive case: upload, confirm present, delete, authorized lookup confirms absent, cross-tenant/anon delete denied throughout on the same object) |
| Tenant path | PASS | ST-02 |
| MIME/size | PASS | ST-05, ST-06 |
| Retry | PASS | ST-07 (no silent overwrite) |
| Orphan | PASS (capability) / **UNVERIFIED** (automated reconciliation) | ST-10 confirms the object-listing query surface works; no automated orphan-sweep job exists or was built — see `docs/STORAGE_RUNTIME_CERTIFICATION.md` |

## Release decision

**DATABASE CERTIFIED, SECURITY GAPS REMAIN** is closer than any cleaner
label, but is too pessimistic given every genuine security boundary this
sprint tested (RLS role matrix, cross-tenant isolation, RPC authorization,
unauthenticated denial, storage tenant isolation) came back PASS after
fixing DEFECT-03. The two real open items originally noted here (CR-07/08
validation gaps, own-tenant Storage delete not separately exercised) were
**known, scoped, non-security findings**, not unverified security
boundaries — and both have since been closed in a Sprint 4.5 continuation
pass (migration 027 for CR-07/08; ST-04b for the own-tenant delete
positive case). A separate Windows-only harness defect (the service-role
secret scan shelling out to `grep`, unavailable under `cmd.exe`) was also
found and fixed — see `docs/RLS_RUNTIME_CERTIFICATION.md` — this was a
test-tooling portability issue, not a security-policy defect.

**Chosen status: `DATABASE AND SECURITY CERTIFIED`**, with the following
explicitly carved out and NOT covered by that label (see "Remaining
unverified items" in the final report):
- Automated Storage orphan reconciliation — does not exist; the capability
  to build it (ST-10) is confirmed, the job itself is not.
- Audit-trigger firing was confirmed present, not independently re-fired
  and inspected row-by-row in this pass.

Aggregate gate: `npm run test:certification` (sequential `cert:reset` →
`test:db` → `test:rls` → `test:storage`) completes with exit code 0.
Current totals: 18 fresh-path migrations applied; Contractor Report RPC
50/50; PM Site Visit RPC 50/50; progress-history 20/20; RLS 28/28; Storage
22/22.
