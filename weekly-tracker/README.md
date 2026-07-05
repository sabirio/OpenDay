# CF Tracker — Construction & Fit-out Progress Tracker

## Database Setup (Supabase)

Run the following migrations **in order** in the Supabase SQL Editor:

1. `src/migrations/001_initial_schema.sql` — Base schema + report_format column
2. `src/migrations/002_gantt_system.sql` — Gantt tasks, contractor reports, site visits
3. `src/migrations/003_task_groups.sql` — Task group structure + seed data
4. `src/migrations/004_site_visit_pm_assessment.sql` — PM schedule assessment column
5. `src/migrations/005_site_visit_gc_status.sql` — GC status on site visit WPs
6. `src/migrations/006_project_scope.sql` — Project scope / store size columns
7. `src/migrations/007_progress_history.sql` — Progress history table
8. `src/migrations/008_progress_history_rls.sql` — RLS on progress_history (superseded by 010)
9. `src/migrations/009_gantt_engine_version.sql` — gantt_engine_version stamp on projects
10. `src/migrations/010_rls_by_roles.sql` — **RLS by roles (M0.2)** — replaces all `anon_all_*`
    policies with role-scoped policies across 14 tables. Safe to re-run (idempotent).

All migrations use `IF NOT EXISTS` / `CREATE OR REPLACE` and are safe to re-run.

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
