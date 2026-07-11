# Phase 9 Final Report — Staging Cloud Certification

Date: 2026-07-11. Branch: `main`. Scope: staging-only cloud deployment and certification, per the user's explicit 8-step instruction. Production Supabase (`szgbkeqornkdngoegyso`), Vercel project `noryxapp`, and domain `openday.fit` were never connected to, deployed to, or otherwise modified at any point.

## Result

**STAGING_CERTIFIED.** All 8 steps are complete with live, reproducible evidence:

| # | Step | Result |
| --- | --- | --- |
| 1 | Live verification of the staging frontend | PASS — `/login` loads through the deployed `openday-staging` Vercel app; a real login reaches the staging host |
| 2 | Confirm connection only to staging Supabase | PASS — every observed request targets `sdndsekarwhumdbcqxni.supabase.co`; guard scripts deny the production ref/hosts by name |
| 3 | Migration dry-run | PASS — schema confirmed empty before any migration was applied, ruling out a target mix-up |
| 4 | Staging DB deployment | PASS — migrations `000`–`027` applied via `supabase db push --linked`; table/RPC inventory verified post-deploy |
| 5 | Auth/RLS/Storage certification | PASS — 19/19 RLS checks, 15/15 Storage checks, live against real signed-in sessions per role |
| 6 | Contractor Report + PM Site Visit cloud E2E | PASS — both specs drive the real deployed frontend end-to-end and assert on the real success UI |
| 7 | Three consecutive runs | PASS — all 3 runs clean (19/19 RLS, 15/15 Storage, 2/2 E2E each); 2 real staging-tooling defects found and fixed by the process |
| 8 | This report | Complete |

Full step-by-step evidence, including the exact commands and check labels, is in `PHASE_9_STAGING_CERTIFICATION.md`. Environment discovery and identity verification (including a real `.env.staging` typo found and corrected) is in `PHASE_9_ENVIRONMENT_AUDIT.md`.

## What "STAGING_CERTIFIED" means and does not mean

- It means: the deployed staging frontend, staging Supabase project (Auth, RLS, Storage, RPCs, migrations `000`–`027`), and the two most safety-critical user workflows (Contractor Report submission, PM Site Visit submission) have been exercised live, end-to-end, through real authenticated sessions and the real deployed bundle — not mocks, not local-only certification, not code reading — and shown to behave correctly 3 times in a row.
- It does **not** mean production is certified, deployed to, or touched. Production certification is a distinct, unexecuted, out-of-scope activity (see `FINAL_GAP_REGISTER.md`).
- It does **not** cover every screen or workflow in the app — only the two named in the user's instruction. Broader staging coverage (e.g. Weekly Reports review, PM alignment/portfolio dashboards) was not in scope for this pass.

## Environment identities (non-secret)

| | Staging | Production (denied) |
| --- | --- | --- |
| Supabase project | `OpenDay Staging` | `construction-pm-portal` |
| Supabase ref | `sdndsekarwhumdbcqxni` | `szgbkeqornkdngoegyso` |
| Vercel project | `openday-staging` (`prj_3fgguj7gxiyfcWRxv0zr2vMhAOOr`) | `noryxapp` (`prj_Ux8tzBDilA7Fef9kdGNRsNdzIXs3`) |
| Frontend host | `openday-staging-82il9fgr8-noryx-s-projects.vercel.app` | `openday.fit` |

Neither `noryx` nor `noryx-app` (the two stale, unrelated Vercel projects flagged as a risk in the original instruction) was ever used — `openday-staging` was created fresh and its identity confirmed distinct from both production and those two decoys before any deployment.

## Defects found and fixed during this effort

Real defects, found through genuine execution rather than assumed away, in order encountered:

1. **Cached build missing env vars** (Step 1 prerequisite): the first Vercel deployment defaulted to the project's internal "production" slot and silently reused a build cached from before the Supabase env vars were added, so the live bundle threw `Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`. Fixed by redeploying with `--target=preview --force` (cache explicitly bypassed).
2. **`fixtures.mjs` sequence-reset repeatability bug** (found during Step 7's first run): three `setval()` calls unconditionally reset ID sequences to fixed low starting values on every reseed, which collided with real rows already created past that point by Step 6's genuine E2E submissions. Fixed by switching to `GREATEST(<floor>, MAX(id))`-based resets in `scripts/staging/fixtures.mjs`, so a reseed can never move a sequence backward behind data that already exists.
3. **`certifyRls.mjs` self-cleanup gap** (found alongside #2): the script's own fixed-date test rows were never deleted between runs, which would have caused the same class of collision independent of #2. Fixed by adding a self-cleaning delete (scoped to the script's own known test dates, via the Admin role's existing RLS delete permission — no service-role bypass) before re-inserting.

Both tooling fixes (#2, #3) are confined to `scripts/staging/fixtures.mjs` and `scripts/staging/certifyRls.mjs` — no product code, RLS policy, migration, or RPC was changed to reach a clean 3-run result. This distinction matters: Step 7's job was to prove *repeatability*, and it correctly caught that the staging certification tooling itself wasn't yet idempotent — a real finding, not noise.

Before release fixation, a final false-pass/security audit removed a hardcoded fixture password, made reseed synchronize existing staging-cert users from gitignored env, replaced all critical `test.skip` branches with hard assertions, and made PM success mandatory rather than log-only. After those changes, the entire RLS/Storage/E2E cycle passed three new consecutive times with retries disabled: RLS 19/19, Storage 15/15, E2E 4/4 on every run.

## Safety discipline maintained throughout

- Every staging script (`fixtures.mjs`, `certifyRls.mjs`, `certifyStorage.mjs`) begins by running `scripts/staging/assertStagingTarget.mjs`, which denies the known production Supabase ref/hosts by name and requires explicit staging allowlist membership before continuing.
- `assertVercelStagingTarget.mjs` performs the equivalent check for Vercel, denying production project ID/name/hosts by name.
- `.env.staging` (gitignored) was the only credential source used for staging work; `.env.local` (which still points at production) was never read by any staging script.
- `STAGING_VERCEL_AUTOMATION_BYPASS_SECRET` and `STAGING_SUPABASE_SERVICE_ROLE_KEY` were never printed to transcript, logs, screenshots, or documentation. `playwright.staging.config.js` sets `trace: 'off'` specifically to prevent the bypass header from ever being captured in a trace artifact.
- All RLS/Storage assertions run through real `signInWithPassword` sessions per role; the service-role client is used only for fixture setup (`fixtures.mjs`), never for the certification assertions themselves.
- Where the operating environment's own safety controls blocked an action (e.g. reading Vercel's local credential store to find the bypass secret), that block was respected and the user was asked directly rather than worked around.

## Outstanding (explicitly out of scope for this effort)

- Production deployment and production certification — not attempted, not claimed.
- Broader staging E2E coverage beyond Contractor Report and PM Site Visit (e.g. Weekly Reports review, dashboards) — not requested for this pass.
- `docs/PHASE_9_ENVIRONMENT_AUDIT.md`, `docs/PHASE_9_STAGING_CERTIFICATION.md`, `docs/FINAL_RELEASE_READINESS.md`, and `docs/FINAL_GAP_REGISTER.md` have all been updated in place to reflect this report's conclusions; this document is the single entry point tying them together.
