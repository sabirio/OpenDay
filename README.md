# OpenDay — C&F Progress Tracker

A multi-business **Construction & Fit-out (C&F)** progress-tracking web app. Management gets a portfolio dashboard and a prioritized "what to do today" command feed; Project Managers submit structured weekly reports. **Every number on screen is traceable back to a single source of truth.** First client: **H&M**.

> **Repo layout:** the application lives in the **`weekly-tracker/`** subfolder. All `npm` commands below are run from there.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 19 + Vite 8 (JavaScript, ES modules) |
| Backend / DB | Supabase — PostgreSQL + Auth, Row-Level Security |
| Unit tests | Custom pure-function runner (`node src/tests/runAll.mjs`) — 890 checks |
| E2E | Playwright (`tests/e2e/`) |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

---

## Prerequisites

- **Node.js 20 (LTS)** — CI runs Node 20; Vite 8 requires ≥ 20.19 (or ≥ 22.12).
- **npm** (ships with Node).
- A **Supabase project** (URL + API keys).

---

## Setup

```bash
git clone https://github.com/sabirio/OpenDay.git
cd OpenDay/weekly-tracker

npm ci                        # install exact locked dependencies

cp .env.example .env.local    # then fill in your Supabase values (see below)
```

Fill `.env.local` with your Supabase project values (**names only** shown here — real values live only in `.env.local`, which is gitignored):

| Variable | Used by | Notes |
|----------|---------|-------|
| `VITE_SUPABASE_URL` | app (browser) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | app (browser) | Publishable key — **`sb_publishable_…`** format |
| `SUPABASE_SERVICE_ROLE_KEY` | scripts only | Secret key — **`sb_secret_…`**; bypasses RLS, **never** prefix with `VITE_`, never bundled |
| `E2E_SUPABASE_ANON_KEY` | Playwright e2e | falls back to `VITE_SUPABASE_ANON_KEY` |
| `E2E_{ADMIN,PM,CONTRACTOR,VIEWER}_{EMAIL,PASSWORD}` | Playwright e2e | override default test-account creds |

See [`weekly-tracker/.env.example`](weekly-tracker/.env.example) for the full template and [`weekly-tracker/README.md`](weekly-tracker/README.md) for the detailed secrets policy.

### Apply the database migrations

Run the SQL files in [`src/migrations/`](weekly-tracker/src/migrations/) **in numeric order** (`001_initial_schema.sql` → `010_rls_by_roles.sql`) in the **Supabase SQL Editor**. They use `IF NOT EXISTS` / `CREATE OR REPLACE` and are safe to re-run.

- `010_rls_by_roles.sql` enables **Row-Level Security by role** across all 14 tables (see [Security](#security)).
- `001_gantt_system.sql` is **deprecated** — use `001_initial_schema.sql` + `002_gantt_system.sql`.

### Optional: seed data

```bash
# 3 demo projects (TEST001–003) with full Gantt schedules + mock progress
node seed.mjs

# 3 e2e test accounts (admin/pm/gc @openday.fit) + profiles
node scripts/seed-test-users.mjs
```

Both require `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (service role bypasses RLS).

---

## Scripts

Run from `weekly-tracker/`:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server (http://localhost:5173) |
| `npm run build` | Production build (does **not** contact Supabase) |
| `npm test` | Unit suite — **890 checks** across all engines/core (also `npm run test:unit`) |
| `npm run lint` | ESLint — **blocking in CI** (0 errors required) |
| `npm run test:e2e` | Playwright e2e — **needs a live Supabase project + seeded test accounts** |
| `npm run preview` | Preview a production build locally |

---

## Project structure

```
weekly-tracker/
├── src/
│   ├── engines/        # ALL calculation logic — one engine = one source of truth (pure, unit-tested)
│   ├── core/           # projects/ (weights, explain, scope, validation) + insights/ (Insight feed)
│   ├── domains/        # domain packs & templates (per business line)
│   ├── services/       # Supabase data access (projectService, reportService, ganttService, …)
│   ├── hooks/          # assembly layer (useAllRows, useGanttMetrics, …)
│   ├── components/     # pure display (weekly/, dashboard/, home/, common/, …)
│   ├── pages/          # thin routed screens (Home, Dashboard, WeeklyReports, RiskDashboard, …)
│   ├── auth/           # AuthContext, authService, rolePermissions
│   ├── config/         # thresholds, schedule config, templates, constants
│   ├── lib/            # supabase client (anon key only)
│   ├── migrations/     # numbered .sql migrations + backfillProgressHistory.js
│   └── utils/          # shared helpers
├── tests/e2e/          # Playwright specs
├── scripts/            # seed-test-users.mjs (ops)
├── seed.mjs            # demo-data seeder
└── .env.example        # env template (names only)
```

---

## Architecture

**Core rule: all calculations live in `engines/`. No business logic in components or pages.** Each engine is a pure, unit-tested single source of truth; pages/components are thin consumers that render pre-computed output.

Data flow: `services` (fetch) → `hooks` (assemble rows) → `engines` (compute) → `core/insights` (normalize) → `components` (render).

**Insight contract:** `core/insights` adapters normalize engine outputs into one unified `Insight[]` feed — `{ id, source, severity, scope, projectId, title, detail, recommendedAction?, priorityScore }` — sorted by `priorityScore` ascending (lower = more urgent).

---

## Security

- **Row-Level Security by role** — [`src/migrations/010_rls_by_roles.sql`](weekly-tracker/src/migrations/010_rls_by_roles.sql) replaces all permissive policies with role-scoped ones across 14 tables. A `SECURITY DEFINER` helper `get_my_role()` (normalized to lowercase) gates every policy; contractors are scoped to their `assigned_projects`.
- Roles: **Admin / PM / Contractor / Viewer** (UI gating in `src/auth/rolePermissions.js`).
- The browser client uses the **anon/publishable key only**; the service-role key is used solely by ops scripts and is never bundled.
- E2E test accounts use the **`@openday.fit`** domain (created via `scripts/seed-test-users.mjs`).

---

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on **push to `main`** and **PRs to `main`** (Node 20):

```
npm ci  →  npm run lint (BLOCKING)  →  npm run build  →  npm test
```

Build runs with dummy Supabase env vars (it never contacts Supabase at build time). The Playwright e2e job is included but **disabled** — it needs Supabase secrets + a live DB; enable it by adding repo Secrets and uncommenting the job.

---

## Known issues

None currently tracked. Resolved items are logged in [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) → *Known bugs / TODO*.

---

## License

Proprietary — internal project. All rights reserved.
