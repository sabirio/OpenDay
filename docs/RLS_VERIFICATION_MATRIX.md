# RLS and authorization verification matrix

**Update 2026-07-10 (Sprint 4.5):** every scenario below has now been run
for real against a local Supabase stack — real authenticated sessions,
real HTTP calls through PostgREST/RPC, ground-truth `psql` row counts. Full
detail, including the exact commands and DB evidence, lives in
`docs/RLS_RUNTIME_CERTIFICATION.md` (RLS) and
`docs/STORAGE_RUNTIME_CERTIFICATION.md` (Storage). This file's own table is
updated in place below rather than duplicated. A real defect was found and
fixed in the process — DEFECT-03 (missing base `authenticated` table
grants; the fresh-install chain had RLS policies with nothing underneath
them to filter) — see `docs/DATABASE_CERTIFICATION_REPORT.md`.

| Scenario | Expected | Actual | Status |
| --- | --- | --- | --- |
| Admin same company write | allowed | real UPDATE succeeded | PASS (runtime) |
| PM assigned/company project site visit | allowed | real `submit_site_visit_atomic` call succeeded, rows verified | PASS (runtime) |
| Contractor assigned report | allowed only atomic contractor RPC; direct table INSERT denied | confirmed both halves: RPC succeeds, direct `.insert()` denied | PASS (runtime) |
| Viewer write | denied | real direct INSERT/UPDATE denied | PASS (runtime) |
| Other tenant read/write | denied | real cross-tenant SELECT/INSERT/UPDATE/DELETE all denied, 0 side effects | PASS (runtime) |
| Unassigned contractor | denied | real RPC call denied, 0 rows | PASS (runtime) |
| "Unassigned" PM (same company) | *(see finding)* | **allowed** — `can_write_project()` is company-scoped, not per-project; `assigned_projects` only gates the contractor role. Confirmed as the actual current design, not a defect. | PASS (runtime, documented design) |
| Foreign project RPC | denied | real cross-tenant RPC call denied, 0 rows | PASS (runtime) |
| Cross-project Storage path | denied | real cross-tenant upload/read/delete all denied | PASS (runtime) |
| Service role in frontend | absent | source scan, re-confirmed this pass | PASS (static — a bundle/source-map scan for a build artifact, not a runtime scenario, so static evidence is the correct and sufficient method here) |

Required harness: isolated Supabase users for Admin/PM/Contractor/Viewer/two companies, direct REST queries, both RPCs, and Storage upload/read/delete attempts. A documented matrix is not a security execution result.

