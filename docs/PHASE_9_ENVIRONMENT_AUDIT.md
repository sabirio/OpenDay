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
