# CF Tracker — Construction & Fit-out Progress Tracker

## Database Setup (Supabase)

### Fresh install

Run this canonical path on a new Supabase database. Do not run historical migrations `001-009` on a fresh database; they were written for an older UUID project schema and are kept only as migration history.

| Order | File | Description |
|-------|------|-------------|
| 1 | `src/migrations/000_baseline.sql` | Canonical production schema baseline: current bigint ids, tables, indexes, and RLS-enabled flags. |
| 2 | `src/migrations/010_rls_by_roles.sql` | Current role-based RLS policies and `public.get_my_role()` helper. Compatible with `000_baseline.sql`. |
| 3 | `src/migrations/011_ownership_uuid.sql` | Ownership columns hardening: `contractor_reports.submitted_by` and `site_visits.visited_by` as auth user UUIDs. |
| 4 | `src/migrations/012_invite_contractor.sql` | `public.invite_contractor(text)` RPC. |
| 5 | `src/migrations/013_auth_user_role.sql` | `public.auth_user_role()` helper used by invite RPC. |
| 6 | `src/migrations/014_site_photos_storage.sql` | Initial private `site-photos` bucket setup and `photo_urls` columns. |
| 7 | `src/migrations/015_audit_log.sql` | Audit log table and triggers for projects, contractor reports, and site visits. |
| 8 | `src/migrations/016_updated_at.sql` | `updated_at` columns and triggers for optimistic conflict detection. |
| 9 | `src/migrations/017_site_photos_bucket_v2.sql` | Current private `site-photos` bucket limits and storage policies. |
| 10 | `src/migrations/018_submit_contractor_report_rpc.sql` | Atomic `public.submit_contractor_report(bigint, date, jsonb, jsonb)` RPC. |
| 11 | `src/migrations/019_primary_key_defaults.sql` | Sequence defaults for fresh-install bigint ids used by app inserts. |
| 12 | `src/migrations/020_rls_company_role_hardening.sql` | Company-aware RLS, contractor direct-write blocking, storage photo project scoping, and SECURITY DEFINER hardening. |
| 13 | `src/migrations/021_multi_tenant_hardening.sql` | Closes two cross-company gaps left after 020: `invite_contractor()` company-scoped profile guard, and `templates` writes restricted to the explicit global admin. |

### Existing databases

Do not replay the fresh-install path blindly on production. Apply only missing migrations, in numeric order, after checking which files were already applied. `010_rls_by_roles.sql` is idempotent and may be re-run to replace stale permissive policies, but it intentionally drops and recreates policies on the covered tables.

Historical migrations `001_initial_schema.sql` through `009_gantt_engine_version.sql` are not part of the fresh path. They reference the old UUID project model and are superseded by `000_baseline.sql`.

### Security/function audit notes

- `010_rls_by_roles.sql` installs `get_my_role()` as `SECURITY DEFINER` with `SET search_path = public`; it only reads the caller's profile role for RLS decisions.
- `020_rls_company_role_hardening.sql` redefines role/company helper functions with explicit `auth.uid()` guards. `Admin` with `profiles.company_id IS NULL` is the explicit global admin; otherwise Admin/PM/Viewer access is company-scoped.
- `012_invite_contractor.sql` is hardened by `020` with `SET search_path = public` and internally allows only `Admin` or `PM` via `auth_user_role()`.
- `015_audit_log.sql` uses a `SECURITY DEFINER` trigger function; `020` revokes public execute and scopes audit-log reads through `can_access_audit_log()`.
- `018_submit_contractor_report_rpc.sql` is `SECURITY DEFINER`, sets `search_path = public`, requires `auth.uid()`, checks role/company/project assignment, and grants execute only to `authenticated`.
- Contractors submit reports through `submit_contractor_report()`; direct contractor inserts/updates to `contractor_reports`, `contractor_report_wps`, `progress_history`, or `project_gantt_tasks` are intentionally blocked by `020`.
- `021_multi_tenant_hardening.sql` closes two gaps 020 left open: (1) `invite_contractor()` previously let any Admin/PM overwrite ANY existing profile's role by email with no company check — a Company A PM could demote a Company B Admin to Contractor just by knowing their email. Now the profile-role UPDATE is refused unless the caller is the global admin, the target profile has no company yet, or the caller and target share a company. (2) `public.templates` has no `company_id` (it's an intentionally shared, cross-company config table per `010`), but its write policies only checked `get_my_role() = 'admin'` — any company-scoped Admin could edit/delete the template every other company's Gantt generation also reads from. Writes now require the new `public.is_global_admin()` (`SECURITY DEFINER`, `role = 'admin' AND company_id IS NULL`); reads are unchanged.

Rollback notes are included in every new migration that changes database behavior.

---

## P0.1 Contractor Submit RPC

Apply `src/migrations/018_submit_contractor_report_rpc.sql` after the ownership/RLS migrations. It creates `public.submit_contractor_report(bigint, date, jsonb, jsonb)` so contractor report submission is one database transaction instead of several browser-side writes.

Rollback:

```sql
DROP FUNCTION IF EXISTS public.submit_contractor_report(bigint, date, jsonb, jsonb);
```

Manual verification after a real contractor submit:

```sql
SELECT id, project_id, submitted_by, created_at
FROM contractor_reports
ORDER BY created_at DESC
LIMIT 3;

SELECT id, project_id, created_at
FROM reports
ORDER BY created_at DESC
LIMIT 3;

SELECT project_id, week_number, overall_progress, recorded_at, snapshot
FROM progress_history
ORDER BY recorded_at DESC
LIMIT 3;
```

Expected:
- newest `contractor_reports.submitted_by` is the current auth user UUID;
- no new legacy `reports` row is created by contractor submit;
- newest `progress_history.snapshot` contains `contractor_report_id`.

---

## P0.2 Private Report Photos

Report photo storage paths are persisted in `photo_urls` and adapted to the UI field `photos`. The `site-photos` bucket remains private; display code signs paths at read time with `src/services/photoService.js` and never stores signed URLs.

Current bucket assumptions are defined in `src/migrations/017_site_photos_bucket_v2.sql`:
- bucket `site-photos` is private;
- authenticated users can read site photos;
- upload/delete are limited to objects whose filename starts with the current `auth.uid()`.

Submit-failure behavior after photos upload: uploaded paths remain in the in-memory form state so the user can retry submit without uploading duplicates. Removing a photo from the form deletes its storage object. If a user abandons the page after upload and before a successful submit, those paths can be cleaned by deleting objects under the user's upload prefix in `site-photos`.

---

## P0.5 Real E2E / CI

`npm run test:e2e` runs the focused production-critical flow in `tests/e2e/p0-real-flow.spec.js` and writes machine-readable output to `test-results/results.json`.

Required local environment:

```bash
cp .env.example .env.local
node scripts/seed-test-users.mjs
npm run build
npm run test:e2e
```

Required `.env.local` / CI secrets:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`
- `E2E_PM_EMAIL`, `E2E_PM_PASSWORD`
- `E2E_CONTRACTOR_EMAIL`, `E2E_CONTRACTOR_PASSWORD`
- `E2E_VIEWER_EMAIL`, `E2E_VIEWER_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` only for `scripts/seed-test-users.mjs`, never for browser/E2E runtime

The P0 E2E creates a uniquely named project, links the contractor, submits a contractor report with photos, asserts canonical DB rows, submits a PM site visit, verifies dashboard/weekly/risk/project visibility, checks viewer read access and contractor admin denial, then deletes the rows and uploaded photo paths it created. CI runs E2E only when Supabase/test-user secrets are present; otherwise CI still runs lint, typecheck, and unit tests and documents the skipped build/E2E step in the job log.

---

## Secrets

### Environment variables

| Variable | Required by | Notes |
|----------|------------|-------|
| `VITE_SUPABASE_URL` | App (browser) | Supabase project URL — public, safe to expose |
| `VITE_SUPABASE_ANON_KEY` | App (browser) | Anon/public key — Row Level Security enforces access control |
| `SUPABASE_SERVICE_ROLE_KEY` | Migration scripts only | **Never prefix with `VITE_`** — bypasses RLS; must never reach the browser bundle |

### Where they live

- **`.env.local`** — real values; gitignored; never commit it. Copy from `.env.example` to create.
- **`.env.example`** — committed placeholder template; update it when adding new vars.

### Rules

- `SUPABASE_SERVICE_ROLE_KEY` is used **only** in `src/migrations/` scripts (Node.js, never bundled). It must never appear in `src/lib/supabase.js` or any browser-side file.
- `src/lib/supabase.js` creates the client using the anon key only — this is enforced by only reading `import.meta.env.VITE_*` vars.
- If a key is ever leaked: rotate it immediately in the Supabase Dashboard → Settings → API.

### Quick leak-check

```bash
grep -r "eyJ" weekly-tracker/src/          # should return nothing
grep -r "service_role" weekly-tracker/src/ # only migration scripts are expected
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
