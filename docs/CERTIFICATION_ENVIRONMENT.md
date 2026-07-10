# Certification Environment — Sprint 4.5 Environment Audit

Date: 2026-07-10
Scope: mandatory first-step tooling/environment audit before any Sprint 4.5
certification work. This document reports what was actually found by running
commands, not what documentation claims.

## 1. Tool inventory (measured, not assumed)

| Tool | Check performed | Result |
|---|---|---|
| Supabase CLI (global) | `supabase --version` | **NOT FOUND** — not on PATH (Bash or PowerShell) |
| Supabase CLI (via npx) | `npx --yes supabase --version` | **2.109.1** — downloads and runs on demand (confirms outbound network access works) |
| Docker | `docker --version`, `docker info` | **NOT FOUND** — no `docker` binary in Bash or PowerShell, no docker-related process running |
| WSL2 | `wsl --status` | **NOT INSTALLED** — "The Windows Subsystem for Linux is not installed" |
| Node.js | `node --version` | v22.16.0 |
| npm | `npm --version` | 10.9.2 |
| Local PostgreSQL | Windows service scan | A Windows service `postgresql-x64-18` (display name `postgresql-x64-18 - PostgreSQL Serv...`) is **Running**, but its install folder (`C:\Program Files\PostgreSQL\18\`) contains only a `data\` directory — no `bin\` folder, no `psql.exe`. A separate, older install exists at `C:\Program Files\PostgreSQL\100\bin\psql.exe` (PostgreSQL 10). Origin/ownership of the running v18 service is unknown — it is not part of this project's tooling and was not installed by this session. |
| `psql` on PATH | `which psql` | NOT FOUND (Bash) |

## 2. Variant decision

Per the task's own precedence order (A → B → C):

### Variant A — Local Supabase CLI + Docker: **NOT AVAILABLE**
`supabase start` requires a working Docker daemon (it launches Postgres,
GoTrue, PostgREST, Storage-API, Realtime as containers). No Docker Engine,
Docker Desktop, or WSL2 (Docker Desktop's usual Windows backend) is present
on this machine. This variant cannot be attempted without the user installing
Docker Desktop (and WSL2, its typical prerequisite on Windows) first.

### Variant B — Separate Supabase test project: **NOT ATTEMPTED — requires user action**
Creating a new Supabase project requires an account/organization and billing
context I do not have credentials for, and provisioning cloud resources on
the user's behalf without their explicit direction is out of scope for an
agent to decide unilaterally. This variant is viable **if the user**:
1. creates a new, dedicated Supabase project (not the existing `openday.fit`
   production project),
2. confirms explicitly that it is a test/throwaway project,
3. shares its project URL and anon key (and, only if strictly needed for
   fixture seeding, a service-role key that never enters client code or the
   repo).

### Variant C — SQL-only temporary PostgreSQL: **PARTIALLY AVAILABLE, INSUFFICIENT ALONE**
A local PostgreSQL 18 service is running, but:
- its purpose is unknown (not provisioned by this project), and creating
  throwaway databases on an ambient system service without understanding
  what else depends on it carries real risk to the user's machine;
- more fundamentally, per the task's own rule, Variant C **cannot** verify
  `auth.uid()`-based RLS, Supabase Auth, PostgREST API behavior, or Storage
  policies — all of migration 025's `SECURITY DEFINER` functions branch on
  `auth.uid()` and `public.profiles`/role lookups, and several historical
  migrations (020, 014/017) reference `auth.users`/`storage.objects`, which
  don't exist in a bare Postgres instance without hand-built stub schemas.
  Stubbing those out would test a fake harness, not the real authorization
  surface — exactly what the task prohibits ("не считать mocked service test
  доказательством SQL rollback").

If Variant C is used at all, its scope is limited to: does the migration SQL
compile, do the declared constraints/indexes/functions exist, does a
plpgsql `EXCEPTION`-free function body roll back fully on an internal
`RAISE EXCEPTION` inside a bare-Postgres transaction. RLS/Auth/Storage stay
`UNVERIFIED` under this variant, as the task requires.

## 3. Current verdict

**No environment in this session currently supports full Sprint 4.5
certification (Stages 3–9: clean deploy, RPC execution, RLS runtime, Storage
runtime).** The mandatory first-step audit is complete; proceeding further
requires the user to choose:

- **(a)** Install Docker Desktop + WSL2, enabling Variant A (full local
  certification, closest to the task's preferred path), or
- **(b)** Provision an isolated non-production Supabase project and share
  its (non-production) URL/anon key, enabling Variant B, or
- **(c)** Accept a partial certification: Variant C for SQL-compilation/
  constraint/rollback-shape checks only, with RLS/Auth/Storage formally
  recorded as `UNVERIFIED` in the final report (not `PASS`).

## 4. Production non-interference

- `weekly-tracker/.env.local` was inspected for its `VITE_SUPABASE_URL`
  value only (no keys were read into this document or logged). It points at
  `https://szgbkeqornkdngoegyso.supabase.co` — the live `openday.fit`
  production project (confirmed in a prior session's incident diagnosis).
  **This project must never be used for certification** — no migration 025
  apply, no RPC calls, no RLS probing, no Storage writes against it.
- No migration was applied anywhere in this session. No database connection
  of any kind was made. No Supabase project was created or modified.
- The existing local PostgreSQL 18 service was inspected (service status
  only) but not connected to, and no database was created on it.

## 5. Existing "RLS test" caveat (relevant to Sprint 4.5's own mandate)

`src/tests/rlsCompanyRoles.test.mjs`, `rlsMultiTenant.test.mjs`, and
`rlsProjectsSelfReferenceFix.test.mjs` (part of the already-green 70/1775
suite) are **static regex assertions against the migration SQL text**
(`readFileSync` + pattern match), not runtime authenticated-context checks.
They are legitimate regression guards against the SQL *changing*
unexpectedly, but they are not evidence that the policies behave correctly
against a live database — this is precisely the gap Sprint 4.5 exists to
close, and this document records that gap explicitly rather than letting it
hide inside an already-green suite.

## 6. Confirmed baseline (re-verified in this session, not assumed)

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | 70 suites / 1775 checks — all passed |
| Architecture guard | `npm run check:architecture` | 25 checks / 0 violations |
| Lint | `npm run lint` | 0 errors / 32 pre-existing warnings |
| Typecheck | `npm run typecheck` | PASS (no output = clean) |
| Build | `npm run build` | PASS |

Matches the task's stated "Текущее подтверждённое состояние" exactly —
verified independently, not taken on faith.
