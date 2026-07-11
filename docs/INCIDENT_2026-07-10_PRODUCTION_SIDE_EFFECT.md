# Incident Record — 2026-07-10 — Accidental production writes during Sprint 5 Phase 1 setup

## What happened

While preparing authenticated mobile verification (Sprint 5, Phase 1), the
agent ran `node scripts/seed-test-users.mjs` to provision E2E test
accounts, assuming `.env.local` configured the local Supabase stack. It
does not: `weekly-tracker/.env.local`'s `VITE_SUPABASE_URL` points to
`https://szgbkeqornkdngoegyso.supabase.co`, which
`docs/CERTIFICATION_ENVIRONMENT.md` (written in a prior session) already
documents as **the live `openday.fit` production project**.

This was not caught before running the script. It was caught immediately
after, by inspecting the script's own output and cross-checking against
local Postgres (which correctly showed none of the E2E users present),
then confirming the `.env.local` URL against the pre-existing
`CERTIFICATION_ENVIRONMENT.md` record.

## Confirmed production side effects

1. **A new project was created**: `E2E-CONTRACTOR-BASE`, `id=141`, via
   `scripts/seed-test-users.mjs`'s admin-API project bootstrap for the
   `gc@openday.fit` test contractor.
2. **An existing user's password was reset**: `viewer@construction.com`
   (auth user id `80ffd85d-094a-4a96-afb5-72c3152eb826`) — the script's
   idempotent "user exists → reset password" path fired, setting the
   password to the fixed E2E test value `Viewer`.

Password-reset/creation attempts for `admin@openday.fit`, `pm@openday.fit`,
and `gc@openday.fit` were rejected by Supabase Auth itself
(`Password should be at least 6 characters` — those fixture passwords are
`Admin`/`Pm`/`Gc`), so those three did not succeed.

## What did NOT happen

- No migration was applied against production.
- No RLS policy, Storage policy, or RPC was touched.
- No table was queried, read, or written directly against production
  Postgres — the only production interaction was through the Auth Admin
  API calls made by `seed-test-users.mjs` itself.
- No further command was run against
  `szgbkeqornkdngoegyso.supabase.co` after the mistake was identified —
  the agent stopped, disclosed the incident, and per explicit user
  instruction has not read, written, or connected to that project again
  in any form (no SELECT, no verification query, no cleanup attempt).

## Remediation

**Owned by the user, performed manually, outside this agent's actions,**
per explicit instruction: "Я выполню production cleanup отдельно
вручную" ("I will perform production cleanup separately, by hand"). The
agent took no cleanup action against production and was told not to.

## Root cause and correction applied to the local working process

`weekly-tracker/.env.local` is the only committed-adjacent env file
(gitignored, but present in this working copy) and it points at
production — a real hazard for any local script that reads
`VITE_SUPABASE_URL` without an explicit local override, since nothing
in the filename or the variable name signals "this is production."

Correction made to prevent a repeat within this task: created
`weekly-tracker/.env.development.local` (gitignored, additive, does not
modify or replace `.env.local`) with `VITE_SUPABASE_URL=http://127.0.0.1:54321`
and the well-known local demo anon key. Vite's env precedence
(`.env.[mode].local` > `.env.local`) means `npm run dev` now resolves to
local Supabase; `.env.local` (and therefore any production-pointed
config) is untouched and still governs any other mode. Verified by
inspecting the dev server's actually-served `import.meta.env` output
(confirmed `VITE_SUPABASE_URL: "http://127.0.0.1:54321"`), not assumed.

All subsequent Phase 1 work in this session used only:
- The local dev server (restarted specifically to pick up the new env
  override, confirmed via `import.meta.env` inspection before any
  browser-based test ran).
- The already-seeded local certification fixture accounts
  (`*.cert.local`, from `scripts/certification/fixture-state.json`),
  not `scripts/seed-test-users.mjs`, avoiding any further use of that
  script's production-reaching path.
- Direct `psql` against `127.0.0.1:54322` only, for local fixture data
  fixups (see `docs/MOBILE_FIELD_USABILITY.md`), never against
  production.

## Process gap this exposes

No file in this repository states, in one obvious place, "these are the
safe local endpoints; this env file is production; never run seed/admin
scripts without checking `VITE_SUPABASE_URL` first." That gap contributed
directly to this incident and is recommended as follow-up (not performed
in this task, which is scoped to frontend/UI work): a `scripts/` guard
that refuses to run any user/data-mutating script unless
`VITE_SUPABASE_URL` matches an explicit local-only allowlist
(`127.0.0.1`/`localhost`), independent of which `.env*` file happened to
supply it.
