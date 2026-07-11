# Phase 9 Environment Audit

Audit date: 2026-07-11. Starting commit: `7d49d77a3c2a4e1196350a4f047251f7d596d240`; branch `main`; origin `sabirio/OpenDay`.

## Local certification

Phase 8 evidence is preserved: clean `npm ci`, lint 0/0, typecheck PASS, 77/77 suites and 1835/1835 checks, architecture 25/25, build PASS, fresh migrations through 027, DB/RLS/Storage certification and 17/17 critical production-preview E2E.

## Environment fingerprint

| Field | Staging | Production deny identity |
| --- | --- | --- |
| Supabase project ref | absent | `szgbkeqornkdngoegyso` |
| Supabase hostname | absent | known `.supabase.co` host; no connection attempted |
| DB hostname/credentials | absent | not read or printed |
| CLI linked ref | absent | N/A |
| Vercel link/target | absent | no deployment attempted |
| Frontend hostname | absent | production alias not inspected or changed |
| Test marker | required but absent | N/A |

Repository `supabase/config.toml` contains only the local id `weekly-tracker`. No staging environment variables, account token, project link, Vercel project, deployment script, CI staging secret reference or Edge Function deployment inventory was found.

## Capabilities and blockers

Local Git, Node, npm, Supabase CLI, Docker, Playwright and production builds are available. Supabase and Vercel CLI sessions are now authenticated, but the accessible Supabase organization exposes only the known production project; no separately identified staging project, keys/DB credentials or staging Vercel target can be paired safely.

`scripts/staging/assertStagingTarget.mjs` now requires an explicit staging environment, explicit allowlist membership and rejects the known production project ref. It performs no deployment itself.

## Live account discovery result

- GitHub CLI is not installed, but Git remote evidence confirms remote `main` at `73a384e`. The remote annotated tag object matches the local tag object and resolves locally to certified commit `6661939`.
- Supabase CLI is authenticated to organization `Construction Tracker`, but lists only production project `construction-pm-portal` (`szgbkeqornkdngoegyso`). “OpenDay Staging” is not visible in this account scope.
- Vercel CLI is authenticated as `sabirio`. It exposes production project `noryxapp` (`www.openday.fit`) and two older unscoped projects (`noryx`, `noryx-app`); neither can be treated as staging without an explicit staging identity and Supabase pairing.
- No payment, tariff change, MFA, CAPTCHA, account-owner approval or production action was attempted.

The Vercel guard denies production project id `prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3`, project name `noryxapp`, and production domains. Both Supabase and Vercel guards require explicit staging allowlists before remote writes.

## Update — 2026-07-11: staging Supabase project created, discovery repeated

The blocker above (`”OpenDay Staging” is not visible in this account scope`) is now resolved — the project was created after this audit's original pass. Re-ran discovery via `npx supabase projects list` (read-only):

| Project | Ref | Name | Created | Status |
|---|---|---|---|---|
| Production | `szgbkeqornkdngoegyso` | `construction-pm-portal` | 2026-05-25 | `ACTIVE_HEALTHY` — untouched |
| **Staging** | `sdndsekarwhumdbcqxni` | **`OpenDay Staging`** | 2026-07-11 | `ACTIVE_HEALTHY` |

Only these two projects exist in the org — no `noryx`/`noryx-app`-named Supabase project was found, so that specific ambiguity risk never materialized on the Supabase side.

`scripts/staging/assertStagingTarget.mjs` run against this ref: **PASS** (`STAGING GUARD PASS: explicit staging target sdndsekarwhumdbcqxni`) — but only after finding and fixing a real data-entry error: `.env.staging`'s `STAGING_PROJECT_REF`, `STAGING_ALLOWED_PROJECT_REFS`, and `VITE_SUPABASE_URL` all had the same 2-character transposition typo (`sndd...` instead of `sdnd...`) relative to the CLI-verified ref. The guard's own self-consistency checks could not catch this (ref and host were internally consistent with each other, just both wrong) — caught only by diffing against the independently-fetched CLI output. Corrected via `sed`, values never printed to any transcript; host reachability re-confirmed (`/auth/v1/health` → HTTP 401, i.e. resolves and responds — not a DNS/connection failure).

A new, dedicated Vercel project was also created for staging — see `PHASE_9_STAGING_CERTIFICATION.md`'s update for full detail (project identity, deployment, and the still-open SSO-protection verification gap).
