# Migration Chain Audit — Sprint 4.5, Stage 2

Static analysis only — no database was connected to or modified while
producing this document (see `docs/CERTIFICATION_ENVIRONMENT.md`). "Applied"
and "Result" are marked `NOT YET APPLIED` throughout; they will be filled in
during Stage 3 once a certification environment is available (see that same
document for the current blocker).

## Authoritative fresh-install chain

`weekly-tracker/README.md` already documents an authoritative 17-step fresh
path, independently cross-checked against the actual migration files below.
Migrations `001_initial_schema.sql` through `009_gantt_engine_version.sql`
are **excluded from the fresh path** — they target an older UUID-keyed
project schema, are superseded in full by `000_baseline.sql`, and README
explicitly says not to replay them on a new database. This also resolves an
apparent numbering collision (`001_gantt_system.sql` and
`001_initial_schema.sql` both exist): both are historical and neither is
part of the fresh chain, so the collision has no runtime consequence.

`019_primary_key_defaults.sql` has no `CREATE`/`ALTER`/`GRANT` DDL matched by
the object-scan below — it only sets sequence `DEFAULT`s (`nextval(...)`) on
existing bigint id columns for fresh-install inserts; confirmed by reading
the file, not just the grep miss.

| Order | Migration | Objects created/changed | Depends on | Applied | Result |
|---:|---|---|---|---|---|
| 1 | `000_baseline.sql` | 14 tables (`profiles`, `pending_invites`, `templates`, `projects`, `reports`, `site_visits`, `project_gantt_tasks`, `contractor_reports`, `contractor_report_wps`, `site_visit_wps`, `site_visit_discrepancies`, `progress_history`, `task_groups`, `task_group_members`); 9 indexes; RLS enabled on all 14 tables (no policies yet — deny-all until 010) | none (schema root) | NOT YET APPLIED | UNVERIFIED |
| 2 | `010_rls_by_roles.sql` | `get_my_role()`; re-asserts RLS enabled on the 14 tables (redundant with 000, harmless — `ENABLE ROW LEVEL SECURITY` is idempotent) | 000 (tables) | NOT YET APPLIED | UNVERIFIED |
| 3 | `011_ownership_uuid.sql` | Adds `contractor_reports.submitted_by` / `site_visits.visited_by` as `uuid` FKs to `auth.users` | 000 (`contractor_reports`, `site_visits`) | NOT YET APPLIED | UNVERIFIED |
| 4 | `012_invite_contractor.sql` | `invite_contractor(text)` v1 | 000 (`profiles`, `pending_invites`) | NOT YET APPLIED | UNVERIFIED — **superseded** by 020 and again by 021 (see below) |
| 5 | `013_auth_user_role.sql` | `auth_user_role()` v1 | 000 (`profiles`) | NOT YET APPLIED | UNVERIFIED — **superseded** by 020 (identical redefinition, confirmed by diff below) |
| 6 | `014_site_photos_storage.sql` | `storage.buckets` row `site-photos` (`ON CONFLICT DO NOTHING`, public=false); 2 storage policies (per-user-folder upload/read) | Supabase `storage` schema (platform-provided, not in this repo) | NOT YET APPLIED | UNVERIFIED — bucket row and both policies **superseded** by 017 |
| 7 | `015_audit_log.sql` | `audit_log` table; 2 indexes; RLS enabled; `fn_audit_log()`; 3 triggers (`contractor_reports`, `site_visits`, `projects`) | 000 (`contractor_reports`, `site_visits`, `projects`) | NOT YET APPLIED | UNVERIFIED — `fn_audit_log()`'s `EXECUTE` grant is revoked from `PUBLIC` in 020 (trigger functions don't need direct `EXECUTE` grants to fire, so this is a hardening no-op for the trigger path, not a break) |
| 8 | `016_updated_at.sql` | Adds `updated_at` to `projects`/`contractor_reports`/`site_visits`; `fn_set_updated_at()`; 3 triggers | 000 | NOT YET APPLIED | UNVERIFIED |
| 9 | `017_site_photos_bucket_v2.sql` | Replaces `site-photos` bucket row (`ON CONFLICT DO UPDATE` — adds `file_size_limit=5242880`, `allowed_mime_types`); drops 014's 2 policies + drops 2 differently-named legacy policies defensively; creates 3 new storage policies (`authenticated can upload/read/delete site photos`) scoped by filename ownership only (`split_part(storage.filename(name), '_', 1) = auth.uid()::text`) — **not** project-scoped yet, read is open to any authenticated user | 014 (bucket must exist to update) | NOT YET APPLIED | UNVERIFIED — these 3 policies are later dropped and redefined by 020 (see redefinition table) with the same names but project-scoped via `can_access_project()`; no forward reference, no ordering defect |
| 10 | `018_submit_contractor_report_rpc.sql` | Adds a column to `contractor_reports`; `submit_contractor_report(bigint,date,jsonb,jsonb)` v1; grants | 000, 011 (`submitted_by`) | NOT YET APPLIED | UNVERIFIED — **superseded** by 023 (`CREATE OR REPLACE`, same signature — intentional evolution, not a conflict) |
| 11 | `019_primary_key_defaults.sql` | Sequence `DEFAULT`s only (no new objects) | 000 | NOT YET APPLIED | UNVERIFIED |
| 12 | `020_rls_company_role_hardening.sql` | Redefines `get_my_role()`, `auth_user_role()`; new `current_company_id()`, `can_admin_company()`, `can_create_project()`, `can_access_project()`, `can_write_project()`, `can_admin_project()`, `can_access_audit_log()`; redefines `invite_contractor()`; drops+recreates every RLS policy on all 12 write-relevant tables + `audit_log` + `storage.objects` (3 policies, now project-scoped via the new `can_access_project()`) | 000, 010, 012, 013, 015 (`audit_log`), 017 (drops its 3 storage policy names, defined in-order so no forward reference) | NOT YET APPLIED | UNVERIFIED |
| 13 | `021_multi_tenant_hardening.sql` | `is_global_admin()`; redefines `invite_contractor()` (closes a company-scoping gap left by 020's version, per its own header); redefines 3 `templates_*` policies | 020 (`can_admin_company` referenced in rollback notes context) | NOT YET APPLIED | UNVERIFIED |
| 14 | `022_fix_projects_select_self_reference.sql` | `can_view_own_project_row(bigint,text)`; drops+recreates `projects_select` policy | 020 (`can_access_project`, which it replaces for this one policy only) | NOT YET APPLIED | UNVERIFIED — fixes a real documented defect (self-referencing RLS subquery breaking `INSERT ... RETURNING`); already explained in its own header, not re-litigated here |
| 15 | `023_contractor_report_lookahead_fields.sql` | Adds 6 columns to `contractor_reports`; redefines `submit_contractor_report(bigint,date,jsonb,jsonb)` to populate them; regrants | 018 (function being replaced), 000 | NOT YET APPLIED | UNVERIFIED |
| 16 | `024_drop_dead_weight_overrides_column.sql` | Drops one dead column from `projects` | 000 | NOT YET APPLIED | UNVERIFIED |
| 17 | `025_atomic_write_commands.sql` | `write_command_requests` table (RLS enabled, `REVOKE ALL` from anon/authenticated — access only via `SECURITY DEFINER` RPCs); adds 3 columns to `site_visit_wps`, 3 to `site_visit_discrepancies`; 2 partial unique indexes (`discrepancy_version = 1`); `submit_contractor_report_atomic(...)` (wraps 023's `submit_contractor_report`); `submit_site_visit_atomic(...)` (self-contained, not wrapping an older function); grants | 000, 011 (`auth.users` FK), 020 (`can_write_project`, `profiles.role` lookup), 023 (`submit_contractor_report`, called directly inside the atomic wrapper) | NOT YET APPLIED | UNVERIFIED — this is Sprint 4.5's primary certification subject |

## Redefinition audit (not defects — documented supersessions)

Postgres's `CREATE OR REPLACE FUNCTION` / `DROP POLICY IF EXISTS` + `CREATE
POLICY` idiom means several objects are legitimately redefined multiple
times along the chain. Confirmed each is an intentional, in-order
supersession, not a conflicting duplicate:

| Object | Defined in | Final authoritative version |
|---|---|---|
| `get_my_role()` | 010, 020 | 020 — diffed against 010: both `SET search_path = public`, both `lower(role) ... WHERE id = auth.uid()`; 020 adds a redundant `AND auth.uid() IS NOT NULL` (already implied — `id` is `NOT NULL uuid`, so `id = NULL` is never true). Behaviorally equivalent. |
| `auth_user_role()` | 013, 020 | 020 — diffed against 013: **not identical**. 013 has no `SET search_path = public`; 020 adds it (a real hardening, prevents search-path hijack of unqualified references, even though this function already qualifies `public.profiles`). 020 also adds the same redundant null-guard as above. Corrected here after actually diffing — do not repeat the earlier "identical logic" claim this table used to make before verification. |
| `invite_contractor(text)` | 012, 020, 021 | 021 (020 added company-context checks; 021's header states it closes a cross-company gap 020 left open) |
| `submit_contractor_report(bigint,date,jsonb,jsonb)` | 018, 023 | 023 (adds lookahead-field persistence; 025's atomic wrapper calls this final version by fixed signature) |
| `projects_select` policy | 020, 022 | 022 (fixes the self-referencing-subquery defect documented in 022's own header) |
| `site-photos` bucket config | 014, 017 | 017 (`ON CONFLICT DO UPDATE`, confirmed safe — see below) |
| storage upload/read policies | 014 (2), 017 (3, +delete) | 020 (redefines the same 3 policy names 017 created, adding `can_access_project()` project-scoping; 017's own versions are filename-ownership-only, never call `can_access_project`) |

## Defects found by this static audit

None. An earlier draft of this document incorrectly claimed `017` forward-
references `can_access_project()` (a function actually first defined in
`020`). Re-reading `017` in full showed its policies use
`split_part(storage.filename(name), '_', 1) = auth.uid()::text` for
upload/delete ownership and a bare `bucket_id = 'site-photos'` check for
read — no call to `can_access_project()` anywhere in `017`. The confusion
was with `020`'s later policies, which reuse the same 3 policy names (via
`DROP POLICY` + `CREATE POLICY`) and *do* call `can_access_project()`. That
redefinition is in-order and correct, not a defect. Corrected immediately
upon re-verification rather than left standing — recorded here so the
correction itself is auditable, not silently dropped.

No other cross-migration ordering problems were found by this static pass.
Static reading did not find any defect in this chain; that is a weaker
claim than "the chain applies cleanly," which can only be established by
actually running it (Stage 3).

## Duplicate-object scan

No unintentional duplicate `CREATE TABLE` (non-`IF NOT EXISTS`), duplicate
non-`OR REPLACE` `CREATE FUNCTION`, or `CREATE POLICY` without a preceding
`DROP POLICY IF EXISTS` were found across the 17-file fresh chain. All table
DDL uses `IF NOT EXISTS`; all function DDL uses `CREATE OR REPLACE`; every
policy redefinition is preceded by `DROP POLICY IF EXISTS` for the same
name. This is a static consistency finding, not proof the chain applies
cleanly — only Stage 3 (actually running it) can establish that.

## Storage bucket configuration (relevant to Stage 9)

- `file_size_limit = 5242880` (5 MB) and `allowed_mime_types = ['image/jpeg',
  'image/png', 'image/webp', 'image/heic']` are both set on the `storage.buckets`
  row itself (017), which Supabase Storage enforces server-side on upload —
  not merely a client-side check. Confirms this is a legitimate answer to
  Stage 9 / ST-05 / ST-06's "where is enforcement" question, pending runtime
  confirmation.
- Bucket is `public = false` (private) throughout — never flipped to public
  in any migration.

## Summary

- 17 fresh-path migrations identified and object-cataloged.
- 0 defects found by static read (one false-positive candidate was found,
  re-verified, and retracted with the correction documented above rather
  than silently removed).
- 0 unintentional duplicate object definitions found.
- All "Applied"/"Result" cells are `NOT YET APPLIED` / `UNVERIFIED` — no
  migration has been run in this session (see
  `docs/CERTIFICATION_ENVIRONMENT.md` for why, and the required next step).
  A static pass finding zero defects is not certification — it only means
  Stage 3 (actually applying the chain) has no *known* reason to fail yet.
