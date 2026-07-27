# E2E Execution & Fixture Integrity Certification — Phase 5E

Status: PASS / CERTIFIED. Date: 2026-07-27. Branch: `ui/master-detail-checkpoint`, HEAD `eb2019b`. Scope: local full-suite E2E execution environment and canonical test fixtures only; no product/business logic, no database constraint or migration, no design/UI change.

Audited: the canonical full-suite runner (`scripts/certification/runFullE2E.mjs`), Playwright's `webServer`/`reuseExistingServer` configuration, the contractor-report submission and photo-upload path (`ContractorReport.jsx`, `PhotoUpload.jsx`, `core/photo/uploadPhotoModel.js`, `core/contractorReport/contractorDraftModel.js`), and every E2E spec that submits a contractor report to a shared fixture project (`15-full-data-flow.spec.js`, `19-persistence-stress.spec.js`, `21-multi-project-scenario.spec.js`, `22-persistent-demo-scenario.spec.js`).

Verified architecture: the full-suite runner now owns its entire dev-server lifecycle end to end — it verifies the target port is free, starts and tracks a dedicated Vite process (never reusing an arbitrary pre-existing one), probes for readiness before Playwright starts, bypasses Playwright's own `webServer` block via `PLAYWRIGHT_SKIP_WEBSERVER`, and tears the owned server down in a `finally` block plus `SIGINT`/`SIGTERM` handlers — without ever inspecting or touching any process it did not itself spawn. Playwright concurrency for the canonical run remains bounded at `--workers=1`. Deterministic fixture reset (`cert:reset:ui`) still runs unconditionally before every full run.

Defects root-caused and fixed (test-only; no product code or database constraint changed):
1. **False-positive success assertions.** `text=Report submitted` is a case-insensitive substring match that also matches `ReportHeaderCard.jsx`'s own "N reports submitted total" header stat whenever a project already has a prior report — masking genuine submission failures as passes. Replaced with `getByRole('heading', { name: 'Report submitted', exact: true })` in `19-persistence-stress.spec.js` and the shared `submitContractorReport()` helper in `21-multi-project-scenario.spec.js`.
2. **Contractor-report fixture-date collision.** `15-full-data-flow.spec.js`, `19-persistence-stress.spec.js`, and `21-multi-project-scenario.spec.js` each filled the same fixture contractor's report date with wall-clock "today," so whichever ran second legitimately hit the database's real one-report-per-project/contractor/day constraint (a correct invariant, left unchanged) and returned a 409. Each spec now uses its own fixed, mutually distinct, far-past date from a new shared `CONTRACTOR_REPORT_DATES` constant (`tests/e2e/helpers.js`).
3. **Draft-recovery synchronization gap.** An apparent "photo upload never settles" failure in `22-persistent-demo-scenario.spec.js` was proven, via direct reproduction and instrumentation, to be unrelated to upload performance: the photo settled in under a second every time. Submit stayed disabled because `recoveryResolved` was false — a genuine, unresolved "Unfinished report found" draft-recovery banner from an *earlier reporting period* in the same multi-report session, which the test never resolved. `submitContractorReport()` now dismisses any leftover draft-recovery banner before filling each report. No product behavior, timeout, or retry policy was changed.

Known, explicitly non-blocking open debt (see below) — not fixed in this certification, not evidence of failure.

Certification requires lint, typecheck, `check:architecture`, the unit suite, the build, and `git diff --check` to pass with zero failures, plus two consecutive full canonical E2E runs — each from an independent fresh runner lifecycle — completing with **zero failed tests** and zero orphaned runner-owned processes afterward.

## Final validation evidence

| Check | Result |
|---|---|
| `lint` | 0 errors (1 pre-existing, unrelated warning) |
| `typecheck` | Clean |
| `check:architecture` | 35/35 passed |
| Unit tests | 145/145 suites, 3341/3341 checks |
| `build` | Successful |
| `git diff --check` | Clean |

## Full E2E certification (two consecutive fresh runner lifecycles)

- **Run #1:** 224 passed, 0 failed, 24 skipped — exit code 0.
- **Run #2:** 220 passed, 0 failed, 28 skipped — exit code 0.

Both runs green with zero failed tests. The skip-count variation (24 vs. 28) is attributable to `E2E-DEBT-01` below, not to any failure. Zero runner-owned Vite processes survived either run; teardown confirmed both times.

## Open E2E reliability debt (non-blocking for this certification)

- **E2E-DEBT-01** — Intermittent `.contractor-project-card` fixture-load race (contractor-select page occasionally not yet showing assigned-project cards when a test checks for them).
- **E2E-DEBT-02** — No deterministic fixture yet produces a true PM/GC discrepancy (`classifyDiscrepancy` never exercised on the `'discrepancy'` branch by any earlier-running spec).
- **E2E-DEBT-03** — No deterministic fixture yet sets a project's Additional Works flag to "Yes" before the test that checks for it runs.

These must not be forgotten and must not be treated as accepted permanent coverage gaps. They should be addressed in a dedicated E2E Reliability Debt Cleanup task, not opportunistically. Their presence does not indicate Phase 5E failed — they were known and explicitly deferred throughout Phases 5E.1–5E.4.

Phase 5F has not been started.
