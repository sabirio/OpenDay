# Local E2E safety

Local fixtures and certification never read `weekly-tracker/.env.local`. Supply all values in the current process and use only the values returned by `npx.cmd supabase status -o json` for the `weekly-tracker` stack.

Required identity controls:

```text
LOCAL_FIXTURE_MODE=1
LOCAL_SUPABASE_PROJECT_ID=weekly-tracker
CERT_SUPABASE_URL=http://127.0.0.1:54321
CERT_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Also set the process-scoped local anon/service keys as `CERT_SUPABASE_ANON_KEY`, `CERT_SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Never copy production values into this workflow.

Safe Windows sequence from `weekly-tracker/`:

1. Start local Supabase: `npx.cmd supabase start`.
2. Inspect the selected endpoints: `npx.cmd supabase status -o json`.
3. Reconstruct locally: `node scripts/certification/resetAndDeploy.mjs`. This runs a destructive **local** reset unless `--deploy-only` is supplied.
4. Seed twice to prove idempotency: `node scripts/seed-test-users.mjs`.
5. Run certification and Playwright with `npm.cmd`. Playwright runs the fixture preflight before Vite.

Expected write summary:

```text
http://127.0.0.1:54321; project=weekly-tracker
postgresql://127.0.0.1:54322/postgres
```

Any `REFUSING LOCAL FIXTURES`, `REFUSING CERTIFICATION`, or `REFUSING E2E` message is a hard safety block. Do not bypass it, substitute a remote URL, or rely on `.env.local`. Production application runtime may continue to use normal Vite environment resolution; local fixture and certification tooling may not.
