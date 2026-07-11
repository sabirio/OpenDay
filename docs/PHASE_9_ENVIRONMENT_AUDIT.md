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

Local Git, Node, npm, Supabase CLI, Docker, Playwright and production builds are available. Cloud creation/deployment is blocked by the absence of a separately identified staging project, Supabase account authorization, staging keys/DB credentials and a Vercel Preview target. Creating a paid or account-scoped resource is not authorized by existing configuration.

`scripts/staging/assertStagingTarget.mjs` now requires an explicit staging environment, explicit allowlist membership and rejects the known production project ref. It performs no deployment itself.

## Live account discovery result

- GitHub CLI is not installed. The Git remote is readable and remote `main` was observed at the pre-certification commit, but the requested non-force push was rejected by the external safety reviewer because the destination could not be established as trusted for exporting the full workspace.
- Supabase CLI is installed but returned `LegacyPlatformAuthRequiredError`: no access token or authenticated session exists.
- Vercel CLI had no stored credentials and started a device-login flow. The flow was stopped without authentication; no project was listed or created.
- No payment, tariff change, MFA, CAPTCHA, account-owner approval or production action was attempted.
