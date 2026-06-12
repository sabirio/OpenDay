# CF Tracker — Construction & Fit-out Progress Tracker

## Database Setup (Supabase)

Run the following migrations **in order** in the Supabase SQL Editor:

1. `src/migrations/001_initial_schema.sql` — Base schema reference + report_format column
2. `src/migrations/002_gantt_system.sql` — Gantt tasks, contractor reports, site visits, RLS
3. `src/migrations/003_task_groups.sql` — Task group structure + seed data
4. `src/migrations/004_site_visit_pm_assessment.sql` — PM schedule assessment column

All migrations use `IF NOT EXISTS` and are safe to re-run.

> **Note**: `migrate.sql` in the project root is deprecated. Use the numbered sequence above.

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
