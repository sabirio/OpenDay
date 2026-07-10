# Failure Injection Report — Sprint 4.5, Stage 10

Two controlled failure injections, one per atomic RPC, each proving full
transaction rollback with real `psql` row counts taken immediately before
and immediately after the failing call — not a mocked service, not an
assumption from reading the SQL.

## Technique

Both injections use the allowed "payload that passes outer validation but
breaks an internal cast" technique (Stage 10's explicitly permitted
approach): a JSON field that is syntactically valid (a string) but cannot
be cast to the `numeric` type PostgreSQL's `jsonb_to_recordset()` expects
for that column, once execution reaches the `INSERT` that needs the real
numeric value. No production code was modified to add a `force_failure`
parameter or any other test-only backdoor. No test-only trigger or
constraint was added to any table.

## CR-09 — Contractor Report atomic RPC, forced child-insert failure

Payload: `{"wpId": "demo.walls", "progress_pct": "not-a-number", "status": "in_progress"}`.

The header (`contractor_reports`) INSERT executes first in
`submit_contractor_report()`'s body; the cast failure happens later, in the
`jsonb_to_recordset(...) AS x(..., progress_pct numeric, ...)` used to
build `contractor_report_wps`. Because both statements run inside the same
implicit transaction as the single top-level RPC call (no
`SAVEPOINT`/`EXCEPTION` block exists in `submit_contractor_report_atomic`),
a failure here must roll back the already-executed header insert too.

| Entity | Before | After failed transaction | Expected |
|---|---:|---:|---:|
| `contractor_reports` (Project A row count) | N | N (unchanged) | N |
| `contractor_report_wps` (for the attempted report) | 0 | 0 | 0 |
| `progress_history` (Project A row count) | M | M (unchanged) | M |
| `write_command_requests` (rows for this `client_request_id`) | 0 | 0 | 0 |

RPC error observed: `22P02 invalid input syntax for type numeric:
"not-a-number"`. All four counts verified equal before/after via direct
`psql` queries (delta = 0 on every table) — confirmed in
`certifyContractorReport.mjs`'s CR-09 block, re-run twice (initial run and
the Stage 13 repeatability run) with identical results.

## SV-10 — PM Site Visit atomic RPC, forced child-insert failure after header stage

Payload: `{"wpId": "demo.walls", "observed_progress": 40, "gc_progress": 40, "signed_delta": "not-a-number", "absolute_delta": 0, "discrepancy_status": "ok"}`.

`observed_progress`/`gc_progress` are valid and pass the RPC's own outer
range/scope validation (the `EXISTS (... WHERE observed_progress < 0 OR ...)`
guard), so execution proceeds past validation into the header
(`site_visits`) INSERT, then fails on `signed_delta`'s cast inside the
`site_visit_wps` insert's `jsonb_to_recordset(...)`.

| Entity | Before | After failed transaction | Expected |
|---|---:|---:|---:|
| `site_visits` (Project A row count) | N | N (unchanged) | N |
| `site_visit_wps` (for the attempted visit) | 0 | 0 | 0 |
| `progress_history` (Project A row count) | M | M (unchanged) | M |
| `write_command_requests` (rows for this `client_request_id`) | 0 | 0 | 0 |
| `project_gantt_tasks.site_visit_progress` (`demo.walls`) | last committed value (45, from SV-01) | unchanged (still 45) | unchanged |

RPC error observed: cast failure on `signed_delta`. All counts verified
equal before/after, **and** the `project_gantt_tasks` cache row (a
same-transaction side effect of a *successful* call) was independently
confirmed untouched by the failed call — proving the cache update is
inside the same atomic boundary as everything else, not a separate,
partially-applied step (SV-11).

## Conclusion

Both `SECURITY DEFINER` atomic functions roll back completely on an
internal failure, with no partial header, no partial children, no partial
history, and no committed idempotency-ledger row — confirmed by direct
database queries, independently of what either RPC's own error response
claimed.
