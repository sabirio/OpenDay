# OpenDay Pilot Release 1.0 — stabilization baseline

Generated: 2026-07-10 (Asia/Qyzylorda). This document records repository state; no production database was contacted and no product logic, UI, schema, or data was changed.

## 1. General information

| Item | Observed value |
| --- | --- |
| Repository layout | Repository root contains governance/docs and a minimal root package; the Vite application and executable scripts are in `weekly-tracker/` |
| Project | OpenDay (`weekly-tracker` package, version `0.0.0`) |
| Git branch / commit | `main` / `0518f517c129d44fe6ed89faa6e13c7177bbe17d` |
| Working tree before audit | Modified `weekly-tracker/src/lib/supabase.js`; untracked `fetchWithTimeout.js` and its test (pre-existing user work, preserved) |
| Package manager | npm, two lockfiles; application checks use `weekly-tracker/package-lock.json` |
| Node / npm | Node `22.16.0`; npm `10.9.2`. No `.nvmrc`, `.node-version`, or `engines` declaration; CI is the only project declaration and uses Node 22 |
| React / Vite | React `19.2.6`; Vite resolved to `8.1.3` after clean install |
| Supabase client | `@supabase/supabase-js` `2.106.2` |
| Test / lint | Custom Node aggregate runner; Playwright `1.60.0`; ESLint `10.4.0` flat config |
| Typecheck | TypeScript `6.0.3`, `tsc --noEmit`; JS is allowed and `checkJs` is false, so coverage is limited primarily to `src/types/index.ts` and module resolution |

The application follows React pages/components/hooks, `core` orchestration/presentation models, calculation `engines`, I/O `services`, config/domain templates, and Supabase migrations under `src/migrations`.

## 2. Verification commands (before changes)

Commands were run from `weekly-tracker/` on the working tree, including the pre-existing user changes.

| Check | Command | Result | Errors | Warnings | Duration / note |
| --- | --- | ---: | ---: | ---: | --- |
| Clean install | `npm ci` | PASS | 0 | 0 | 38.87 s; 151 packages installed |
| Lint | `npm run lint` | PASS | 0 | 32 | 103.72 s |
| Typecheck | `npm run typecheck` | PASS | 0 | 0 | 23.48 s |
| Unit/integration | `npm test` | PASS | 0 | 0 | 84.71 s |
| Production build | `npm run build` | PASS | 0 | 0 | 10.90 s total; Vite build 4.78 s |

## 3. Test baseline

- 94 test/spec files exist: 70 unit/integration `*.test.*` files and 24 Playwright E2E specs.
- The aggregate unit command ran 67 suites and 1,674 checks: 1,674 passed, 0 failed, 0 skipped.
- Main suites are in `src/tests`, co-located engine/core/config/hook tests, and `src/**/__tests__`.
- No flaky test was observed in this single baseline run.
- Playwright exists and `test:e2e:ci` targets `tests/e2e/p0-real-flow.spec.js`. It requires a Supabase URL/key and four test accounts, so it was not run locally without those credentials.

## 4. ESLint baseline

- 0 errors and 32 warnings.
- Warning categories: 16 restricted legacy imports, 9 `react-hooks/set-state-in-effect`, and 7 `react-hooks/exhaustive-deps`.
- Files with the largest counts: `SiteVisitReport.jsx` (4) and `ContractorReport.jsx` / `WeeklyReports.jsx` (3 each).
- Five source `eslint-disable` comments were found, plus one message in the ESLint config. They are existing debt and were not changed.

## 5. Build baseline

- Production build succeeds: 417 modules transformed, no unresolved imports or circular-dependency diagnostics.
- Vite emitted no warning. Largest output chunks: `page-ContractorReport` 367.64 kB (96.55 kB gzip), `vendor-react` 174.87 kB (55.12 kB gzip), and `engines` 128.68 kB (36.08 kB gzip).
- No new bundle analyzer was installed.

## 6. Supabase baseline

- `src/migrations` contains 26 SQL files plus `backfillProgressHistory.js`. `seed.sql` and `seed.mjs` are present at application root.
- The documented fresh-install order is `000_baseline.sql`, then `010` through `024` in numeric order. Historical `001_initial_schema.sql` through `009_gantt_engine_version.sql` are explicitly retained migration history for the old UUID model and must not be replayed on a fresh database. There are two `001_*` files.
- RLS is enabled and policies are defined in the migration history; current hardening is principally in `010`, `020`, `021`, and `022`.
- RPC/functions include role/company/access helpers, contractor invitation, audit/update triggers, and `submit_contractor_report`.
- Private `site-photos` bucket setup/policies appear in `014`, are superseded/configured by `017`, and hardened by `020`.
- Potential divergence: migrations are stored under application source rather than a Supabase CLI directory, and the repository cannot prove which migrations production has applied. The README warns not to replay the fresh path blindly. No production connection was attempted.

Migration inventory: `000_baseline.sql`, `001_gantt_system.sql`, `001_initial_schema.sql`, `002_gantt_system.sql`, `003_task_groups.sql`, `004_site_visit_pm_assessment.sql`, `005_site_visit_gc_status.sql`, `006_project_scope.sql`, `007_progress_history.sql`, `008_progress_history_rls.sql`, `009_gantt_engine_version.sql`, `010_rls_by_roles.sql`, `011_ownership_uuid.sql`, `012_invite_contractor.sql`, `013_auth_user_role.sql`, `014_site_photos_storage.sql`, `015_audit_log.sql`, `016_updated_at.sql`, `017_site_photos_bucket_v2.sql`, `018_submit_contractor_report_rpc.sql`, `019_primary_key_defaults.sql`, `020_rls_company_role_hardening.sql`, `021_multi_tenant_hardening.sql`, `022_fix_projects_select_self_reference.sql`, `023_contractor_report_lookahead_fields.sql`, `024_drop_dead_weight_overrides_column.sql`.

## 7. Existing CI

Before this stabilization change, `.github/workflows/ci.yml` ran on PRs to any branch and pushes only to `main`. Job `verify` used Node 22 with npm cache and ran clean install, lint, typecheck, unit tests, and a build only when Supabase app secrets existed. The P0 Playwright test was conditional on Supabase and test-account secrets. The missing mandatory checks were an explicit architecture-guard step and an unconditional production build; pushes to non-main branches were also not covered.

Required secrets for P0 E2E are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_ADMIN_EMAIL/PASSWORD`, `E2E_PM_EMAIL/PASSWORD`, `E2E_CONTRACTOR_EMAIL/PASSWORD`, and `E2E_VIEWER_EMAIL/PASSWORD`; `E2E_SUPABASE_ANON_KEY` is optional and falls back to the Vite anon key.

## 8. Known issues

| ID | Category | Description | Severity | Blocks CI | Recommended next step |
| --- | --- | --- | --- | --- | --- |
| BL-01 | Lint | 32 warnings, chiefly React effect patterns/dependencies and audited legacy imports | Medium | No | Resolve in small behavior-preserving batches after stabilization |
| BL-02 | Type safety | `allowJs: true` with `checkJs: false` means the green typecheck does not validate most JS/JSX semantics | Medium | No | Define a later incremental type-safety plan; do not convert wholesale |
| BL-03 | Database delivery | Repository cannot establish applied production migration state; historical and fresh paths coexist | High | No | Compare production migration ledger read-only before any DB release |
| BL-04 | E2E | Critical E2E depends on external Supabase/test-account credentials and was not locally executed | High | Conditional | Provision isolated test Supabase and GitHub secrets, then require P0 |
| BL-05 | Build CI | Existing CI skipped build without Supabase secrets | High | Yes | Fixed in stabilization workflow by making build unconditional |
| BL-06 | Node declaration | Node 22 is declared only in CI, not in `.nvmrc`/`engines` | Low | No | Keep Node 22 as documented CI baseline; add a repo declaration separately if desired |
| BL-07 | Working tree | Audit includes pre-existing uncommitted timeout/Supabase changes | Medium | No | Review and commit/revert that work independently of stabilization |

## 9. Legacy dependencies and architecture guard

Legacy status is explicitly supported by `src/config/TEMPLATE_MODEL.md`, config headers, compatibility branches, and a parallel canonical implementation.

| Legacy module/file | Runtime consumers | Test consumers | Canonical replacement | Status |
| --- | --- | --- | --- | --- |
| `src/config/workPackages.js` | 14 allowlisted runtime files across legacy report/site-visit/contractor fallbacks and engines/utils | Architecture guard and legacy engine tests | `masterTaskLibrary.js` / `constructionRetailV1.js` | Confirmed legacy compatibility source; no new imports allowed |
| `src/config/reportWeights.js` | `dashboardConstants.js`, `pmAlignmentEngine.js`, `reportUtils.js` | Architecture guard and related engine tests | `constructionRetailV1` weights | Confirmed older compatibility calculation source; no new imports allowed |
| `src/engines/legacyReportEngine.js` | `core/weekly/weeklyReportReviewModel.js` | Dedicated legacy engine tests | Canonical Gantt/WP report path | Confirmed compatibility adapter for historical reports |
| migrations `001`–`009` | None in runtime | Migration-strategy/RLS tests inspect files | `000` + `010`–`024` fresh path | Confirmed migration history, not fresh-install path |

`src/tests/architectureGuard.test.mjs` scans runtime source, permits only an explicit 14-file legacy-import allowlist, rejects new importers, and also enforces layer/calculation/service-purity/status-literal boundaries. It is already included in `npm test`; stabilization adds the explicit command `npm run check:architecture` and a named CI step. Test fixtures and migration utilities are excluded by the guard's source filtering.

## 10. Conclusion

The repository baseline is reproducible and the local mandatory checks are green, so canonicalization can begin only after the external E2E/database risks are accepted or closed. The most critical next steps are provisioning isolated E2E credentials, verifying the production migration ledger read-only, and resolving the existing lint warnings in bounded changes. The stabilization status after the CI/doc changes should remain `READY FOR CANONICAL CORE` if repeat verification stays green.

## 11. Repeat verification after stabilization changes

| Check | Before | After | Status |
| --- | --- | --- | --- |
| `npm ci` | PASS | PASS | Unchanged |
| `npm run lint` | PASS: 0 errors, 32 warnings | PASS: 0 errors, 32 warnings | Unchanged debt |
| `npm run typecheck` | PASS | PASS | Unchanged |
| `npm test` | PASS: 67 suites, 1,674 checks | PASS: 67 suites, 1,674 checks | Unchanged |
| `npm run check:architecture` | Guard passed indirectly in aggregate tests | PASS: 17 checks, 0 violations | Explicit CI gate added |
| `npm run build` | PASS: 417 modules | PASS: 417 modules | Now mandatory in CI |

The workflow was reviewed as YAML, but GitHub Actions itself cannot be executed fully from this local environment. E2E was not run because the required isolated Supabase and test-account credentials are not present. Final status: **`READY FOR CANONICAL CORE`**, subject to the explicitly documented external E2E and production-migration verification risks.
