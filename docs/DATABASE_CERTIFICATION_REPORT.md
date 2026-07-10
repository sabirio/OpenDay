# Database Certification Report — Sprint 4.5, Stage 3

Environment: local Supabase CLI stack (Docker), `weekly-tracker` project,
Postgres 17.6, Supabase CLI 2.109.1. See `docs/CERTIFICATION_ENVIRONMENT.md`
for full tool inventory. **Not production** — `postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
local-only, default demo JWT secret. No production credentials, data, or
project were touched.

## Clean deploy result

Started from a genuinely empty `public` schema (verified: `SELECT table_name
FROM information_schema.tables WHERE table_schema='public'` returned 0 rows
before any migration ran). Applied the fresh-install chain in order via
`psql -v ON_ERROR_STOP=1 -f <file>`, one file at a time, stopping immediately
on the first error rather than continuing past a failure.

| Migration range | Result | Errors | Corrective action |
|---|---|---|---|
| `000_baseline.sql` | PASS | none | — |
| `010_rls_by_roles.sql` | PASS | none | — |
| `011_ownership_uuid.sql` | **FAIL** | `ERROR: operator does not exist: uuid ~* unknown` (line 32) | Skipped on fresh path — see DEFECT-02 below. No SQL corrective migration needed. |
| `012_invite_contractor.sql` through `025_atomic_write_commands.sql` (13 files) | PASS | none | — |

**16 of 17 fresh-path files applied cleanly. 1 file (`011`) is not
applicable to a fresh install and was skipped after reproducing and
diagnosing its failure — not guessed from static reading.**

## DEFECT-02 — `011_ownership_uuid.sql` fails on a fresh install (reproduced)

**Reproduction:** applying the documented fresh-path chain (`000, 010, 011,
...`) in order against a genuinely empty database fails at `011` with:
```
psql:011_ownership_uuid.sql:32: ERROR:  operator does not exist: uuid ~* unknown
LINE 5:       WHEN submitted_by ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f...
```

**Root cause:** `011`'s job is to migrate `contractor_reports.submitted_by`
/ `site_visits.visited_by` from a legacy `text` column to `uuid`, using a
regex (`~*`) precheck on the text value before casting (its own header
explicitly targets upgrading an *existing* production database with legacy
text-typed owner columns). But `000_baseline.sql` — the canonical schema
baseline — already declares both columns as `uuid` with the identical FK
inline (`submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL`,
confirmed by reading `000_baseline.sql:167` and `:128`). On a fresh install,
the column is uuid from the moment `000` creates the table, so `011`'s
`~*` regex match — which has no defined operator for the `uuid` type —
fails immediately. `011` is only valid input for a database that predates
it; on the fresh path, its target end-state is already satisfied.

**Classification:** migration-chain-applicability defect (not a SQL syntax
bug, not a logic bug in 011 itself — 011 is correct for its actual intended
target, just not applicable to a fresh install starting from `000`).

**Severity:** blocks the documented fresh-install path from ever
completing — every subsequent migration (`012`–`025`) was unreachable until
this was resolved.

**Fix applied:** none to any migration file (append-only policy honored —
`011` was not edited). Corrected the two places that claimed `011` was part
of the fresh path:
- `weekly-tracker/README.md` — added `011` to the fresh-install skip list
  alongside `001-009`, with the full runtime-reproduced rationale, and
  updated the numbered table + "Existing databases" section.
- `docs/MIGRATION_CHAIN_AUDIT.md` — updated to record this as a real,
  reproduced defect (superseding an earlier draft's incorrect and already-
  retracted defect claim about `017`).

No `026_*.sql` corrective migration was created because there is nothing to
add or change in SQL — `000` already produces `011`'s intended end-state.
Writing a migration that asserts "already uuid, no-op" would add nothing a
schema inspection doesn't already prove. `011` remains necessary and
untouched for its real use case: upgrading a pre-011 production database
that still has legacy `text`-typed owner columns.

**Retest:** re-ran the full corrected chain (`000, 010, 012–025`) against a
second clean database reset — see Stage 13 (repeatability) for the second
run's result.

## Schema/object validation (post-deploy queries, not assumed)

All queries run directly against the deployed local instance.

| Check | Query basis | Result |
|---|---|---|
| Key functions exist, `SECURITY DEFINER` | `pg_proc` | `can_access_project`, `can_write_project`, `get_my_role`, `submit_contractor_report`, `submit_contractor_report_atomic`, `submit_site_visit_atomic` — all present, all `prosecdef=t` |
| Atomic RPC signatures match migration 025 exactly | `pg_get_function_identity_arguments` | `submit_contractor_report_atomic(p_project_id bigint, p_report_date date, p_wp_progress jsonb, p_meta jsonb, p_client_request_id uuid)`; `submit_site_visit_atomic(p_project_id bigint, p_contractor_report_id bigint, p_visit_date date, p_observations jsonb, p_meta jsonb, p_client_request_id uuid)` |
| EXECUTE grants on atomic RPCs | `information_schema.routine_privileges` | Only `authenticated` and `postgres` (owner) — no `anon`, no `PUBLIC` |
| `write_command_requests` RLS enabled | `pg_class.relrowsecurity` | `true` |
| `write_command_requests` has no direct anon/authenticated table grants | `information_schema.table_privileges` | Only `postgres` (owner, full DML) and `service_role` (REFERENCES/TRIGGER/TRUNCATE only — no explicit SELECT/INSERT/UPDATE/DELETE grant; `service_role`'s actual access comes from its `BYPASSRLS` role attribute per Supabase convention, not a table grant) — confirms the ledger is reachable only through the `SECURITY DEFINER` RPCs, not direct API access |
| Unique idempotency constraint | `pg_constraint` | `write_command_requests_actor_id_operation_client_request_id_key` (`UNIQUE`) present, matching migration 025's `UNIQUE (actor_id, operation, client_request_id)` |
| Partial unique indexes (child-row idempotency) | `pg_indexes` | `site_visit_wps_visit_wp_uniq` and `site_visit_discrepancies_visit_wp_uniq`, both `WHERE (discrepancy_version = 1)` |
| RLS enabled on all 16 public tables | `pg_class.relrowsecurity` | All 16 (`audit_log`, `contractor_report_wps`, `contractor_reports`, `pending_invites`, `profiles`, `progress_history`, `project_gantt_tasks`, `projects`, `reports`, `site_visit_discrepancies`, `site_visit_wps`, `site_visits`, `task_group_members`, `task_groups`, `templates`, `write_command_requests`) — `true` |
| Policy count | `pg_policies` | 54 policies across `public` |
| Storage bucket config | `storage.buckets` | `site-photos`: `public=false`, `file_size_limit=5242880` (5 MB), `allowed_mime_types={image/jpeg,image/png,image/webp,image/heic}` — matches migration 017, enforced server-side |
| Triggers | `pg_trigger` | 3 audit triggers (`trg_audit_contractor_reports/projects/site_visits`) + 3 updated_at triggers (`trg_updated_at_contractor_reports/projects/site_visits`) |
| Lookahead columns (023) | `information_schema.columns` | `next_week_top3`, `week_after_top3`, `activities_blocked`, `delay_reason`, `pending_issues`, `final_comments` — all present on `contractor_reports`, type `text` |
| Sprint 4 discrepancy metadata columns (025) | `information_schema.columns` | `gc_progress` (numeric), `discrepancy_sign_convention` (text), `discrepancy_version` (integer) — present on `site_visit_wps` |
| Dead column dropped (024) | `information_schema.columns` | 0 rows matching `%weight_override%` on `projects` — confirmed absent |

## Verdict for Stage 3

**PASS**, with one documented and resolved chain-order defect (DEFECT-02).
The fresh-install path is now: `000, 010, 012, 013, 014, 015, 016, 017,
018, 019, 020, 021, 022, 023, 024, 025` (16 files; `011` excluded, same
treatment as `001-009`). All required objects (functions, grants, RLS,
triggers, constraints, indexes, columns, storage config) confirmed present
by direct query against the deployed schema — not inferred from reading
SQL source.

Not yet covered by this stage (later stages of this report set): actual
RPC execution with real payloads, real authenticated-context RLS behavior,
Storage upload/read/delete behavior, failure injection/rollback proof,
repeatability of a second clean reset.
