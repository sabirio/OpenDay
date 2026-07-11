# Sprint 5 — Frontend Finalization Audit

Date: 2026-07-10. Performed before any code change in this pass, per the
mandatory first step of the Sprint 5 finalization task. All facts below
were re-verified by direct command execution in this session — none are
carried over from prior reports without a fresh check.

## 1-4. Git state

- Branch: `main`.
- `git status`: clean of conflicts; a large amount of prior, uncommitted
  work is present from earlier sessions (never committed):
  - **Modified**: 5 certification docs + `weekly-tracker/package.json`-adjacent
    certification scripts (`certifyContractorReport.mjs`, `certifyRls.mjs`,
    `certifyStorage.mjs`, `resetAndDeploy.mjs`) from the prior DB/security
    certification pass, plus modified Contractor Report / Site Visit
    components and core modules (`ContractorReportStates.jsx`,
    `LookAheadDeclarationSection.jsx`, `PhotoErrorAlert.jsx`,
    `ValidationErrors.jsx`, `PhotoUpload.jsx`, `GanttPMTaskRow.jsx`,
    `GanttSuccessView.jsx`, `LegacyPMTaskRow.jsx`, `SiteVisitFormView.jsx`,
    `buildContractorReportSubmission.js`, `submitContractorReportModel.js`,
    `uploadPhotoModel.js`, `writeCommand.js`, `usePhotoUpload.js`,
    `ContractorReport.jsx`, `SiteVisitReport.jsx`, `index.css`).
  - **Untracked (new)**: field-workflow stabilization work — draft/workflow
    state modules (`contractorDraftModel.js`, `contractorWorkflowState.js`,
    `siteVisitDraftModel.js`, `siteVisitNavigationModel.js`,
    `siteVisitWorkflowState.js`, `src/core/workflow/workflowDraftStore.js`,
    all with matching `.test.mjs`), new components
    (`DraftRecoveryBanner.jsx`, `SiteVisitDraftRecovery.jsx`,
    `SiteVisitTaskNavigator.jsx`), new hooks
    (`useContractorReportWorkflow.js`, `useSiteVisitWorkflow.js`), migration
    `027_contractor_report_wp_validation.sql`, the cross-platform
    certification scanner (`scanSource.mjs` + test), and ~15 docs (several
    are short interim-status stubs, not final reports — see §20).
  - No file relevant to this task's hard constraints (migrations 000-027,
    RPC definitions, RLS/Storage policy files) was touched by this audit.

## 5-6. Test suite and ESLint — actual re-run, not carried over

```
npm test              -> 76/76 suites, 1822/1822 checks, 0 failed
npm run typecheck      -> PASS (tsc --noEmit, no output)
npm run check:architecture -> 25/25 PASS (24 legacy-import guard + 1 hard-mode meta-check)
npm run build          -> PASS, 441 modules, see §17 bundle table
npm run lint            -> 0 errors, 26 warnings
```

These match the numbers claimed in the task's "confirmed state" section
exactly — the baseline claim is verified true, not assumed.

### 6. Full, exact warning inventory (26 = 16 + 4 + 6)

| Rule | Count | Files |
|---|---:|---|
| `no-restricted-imports` | 16 | `App.jsx`, `GanttChart.jsx`, `components/contractor/LegacyWPSection.jsx`, `components/contractor/ReportingWorkPackagesSection.jsx`, `components/contractor/WorkPackageProgressSection.jsx`, `components/contractor/formHelpers.js`, `components/sitevisit/ComparisonResultsView.jsx`, `components/sitevisit/SiteVisitFormView.jsx`, `config/dashboardConstants.js`, `engines/legacyReportEngine.js`, `engines/pmAlignmentEngine.js`, `engines/projectSummaryEngine.js`, `engines/siteVisitEngine.js`, `pages/WeeklyReports.jsx`, `utils/reportUtils.js` (×2 — both legacy config modules) |
| `react-hooks/set-state-in-effect` | 6 | `hooks/useWeeklyGanttTasks.js`, `pages/RiskDashboard.jsx`, `pages/WeeklyReports.jsx`, `pages/WeightAudit.jsx`, plus 2 more attributed to files also carrying `exhaustive-deps` below (`hooks/useGanttMetrics.js`, `hooks/useProjectAuditLog.js`) |
| `react-hooks/exhaustive-deps` | 4 | `hooks/useWeeklyReportReviewModel.js` (missing `input`), `pages/WeeklyReports.jsx` (missing `selectedProject`), `hooks/useGanttMetrics.js`, `hooks/useProjectAuditLog.js` |

All 16 `no-restricted-imports` warnings are the same class: a component or
engine still imports the legacy `config/workPackages` and/or
`config/reportWeights` modules directly (flagged by the project's own
lint rule, not a bug) instead of the canonical
`masterTaskLibrary`/`constructionRetailV1` path. `docs/CANONICAL_CORE.md`
and the architecture guard already track this as a known, intentional
compatibility surface (`check:architecture`'s allowlist references it).
Resolving each occurrence means routing that specific consumer through
the canonical config — this is Phase 4 work, not done in this audit.

`ESLINT_WARNING_RESOLUTION.md` (pre-existing, 11 lines, written by an
earlier pass) claims "Sprint 5 initial: 32 warnings → 26 after Contractor
+ PM Site Visit blocks" — consistent with the current 26 count, but that
document is a short interim status stub, not a resolution record; no
`no-restricted-imports` warning has actually been resolved yet.

## 7-8. Modal/Dialog/Drawer primitives and consumers

**There is no shared Dialog/Modal/Drawer primitive component.** Every
overlay in the app is a one-off implementation:

| Component | Consumers | Modal intent | Current semantics found |
|---|---|---|---|
| `components/weekly/MissingReportsModal.jsx` | Weekly Reports | modal | **Correct**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| `components/projects/GcInvitationModal.jsx` | Project Editor (contractor invite) | modal | `autoFocus` only — no `role`/`aria-modal`, no Escape handler found |
| `components/projects/ProjectDetailModal.jsx` | Projects list | modal | No `role`/`aria-modal`/Escape/focus management found |
| `components/projects/ProjectEditorModal.jsx` | Projects list, Project creation | modal | No `role`/`aria-modal`/Escape/focus management found |
| `components/dashboard/ProjectDetailDrawer.jsx` | Dashboard, Portfolio | drawer (screen-blocking, used as a de facto modal) | Escape-key handler present (`onClose` on `Escape`); no `aria-modal`/`role` |

This confirms and sharpens `docs/SPRINT_5_FINALIZATION_AUDIT.md`'s prior
finding ("some use `role=dialog`, while project modals and Project Detail
Drawer use visual overlay/div patterns"). None of these 5 components share
a base — hardening will mean either (a) fixing each individually with a
consistent minimal semantic contract, or (b) extracting one small shared
primitive that all 5 opt into. Decision deferred to Phase 2 planning, not
made here.

No dedicated dialog/modal/drawer test file exists yet
(`**/*ialog*.test*`, `**/*odal*.test*`, `**/*rawer*.test*` all empty).

## 9. Loading/empty/error states — screens not yet individually audited

The 9 screens named in the task (Home, Dashboard, Portfolio, Projects,
Project Detail, Weekly Reports, Risk Dashboard, Contractor Report, PM Site
Visit) were not individually walked in this pass — that is Phase 3's own
matrix-building work, not a prerequisite the audit needs to complete.
What is confirmed now: no shared loading/empty/error state primitive
exists (parallel finding to §7-8 — every screen currently manages its own
`loading`/`error` local state, consistent with the `set-state-in-effect`
warnings above, several of which are exactly this pattern:
fetch-in-effect with a manually-toggled `loading` flag).

## 10-11. Browser/E2E and local Supabase availability — CONFIRMED AVAILABLE

This is the most consequential finding of this audit, and it reverses the
blocker every prior interim doc (`MOBILE_FIELD_USABILITY.md`,
`ACCESSIBILITY_AUDIT.md`, `RENDER_PERFORMANCE_REPORT.md`) recorded:

- **Docker**: running, `supabase_db_weekly-tracker` and all other
  `weekly-tracker` Supabase containers are `Up`/`healthy` (30-55 min
  uptime at audit time).
- **Local Supabase API**: reachable at `http://127.0.0.1:54321`.
- **Frontend dev server**: already running and reachable at
  `http://localhost:5173` (HTTP 200).
- **Playwright**: installed (`@playwright/test` + `playwright` in
  `devDependencies`), configured in `playwright.config.js` — 24 spec
  files in `tests/e2e/`, `webServer` config set to `reuseExistingServer:
  true` against the already-running dev server, single `chromium`
  (Desktop Chrome) project defined — **no mobile-viewport project is
  configured yet**; per-test `viewport` override (via `test.use()`) is
  the mechanism to add for the 4 required mobile viewports without
  touching the shared desktop project.
- Conclusion: **authenticated live browser mobile verification is
  achievable in this session** — the blocker recorded in every prior
  Sprint 5 doc no longer applies. Phase 1 will proceed as a live
  verification, not a static one.

## 12. Test users and fixture project — two distinct, non-interchangeable sets exist

- `scripts/seed-test-users.mjs` + `tests/e2e/helpers.js` define the
  **E2E credential set**: `admin@openday.fit` / `pm@openday.fit` /
  `gc@openday.fit` / `viewer@construction.com` (fixed passwords `Admin`
  / `Pm` / `Gc` / `Viewer`). This is what all 24 existing Playwright specs
  assume.
- `scripts/certification/fixture-state.json` defines a **separate**
  synthetic set (`admin-a@cert.local`, `pm-a-assigned@cert.local`,
  `contractor-a-assigned@cert.local`, etc., company-a/company-b) created
  by the Sprint 4.5 certification harness's `fixtures.mjs` for RLS/RPC
  testing.
- These two sets are **not simultaneously guaranteed present** — the
  certification harness's `cert:reset` truncates the database and
  reseeds only its own cert.local users; the last certification run in
  this repo's history was the DB/security certification pass, meaning
  the current local database most likely has the cert.local fixtures
  loaded, not the E2E `openday.fit`/`construction.com` users. This must
  be verified and, if needed, corrected (by re-running
  `node scripts/seed-test-users.mjs`, which is documented as idempotent
  and safe to re-run) before Phase 1 starts — not assumed either way.

## 13-14. Contractor Report / PM Site Visit mobile state

Per the pre-existing `MOBILE_FIELD_USABILITY.md` (11-17 lines, written by
an earlier pass): both workflows have had **static-only** layout/CSS
review at 320/360/390/412/768px, explicitly marked "live verification:
unavailable" at every viewport. No authenticated screenshot or real
keyboard/touch interaction has been recorded for either workflow at any
viewport. This audit does not change that status — Phase 1 is where it
changes, using the now-confirmed-available browser/Supabase environment.

## 15. Responsive breakpoints

`grep` for `@media`/breakpoint patterns found 3 stylesheets with media
queries: `src/index.css`, `src/App.css`, `src/styles/print.css`. The
values referenced in `MOBILE_FIELD_USABILITY.md` (560px stacking
threshold, 768px two-column threshold) will be cross-checked against
these files' actual rules during Phase 1/3, not assumed correct here.

## 16-17. Existing accessibility and performance/render tests

`**/*a11y*` and `**/*[Pp]erformance*` glob searches returned **zero
files** — there is no dedicated automated accessibility test suite and no
dedicated render/performance test suite anywhere in the repo today.
Accessibility coverage that does exist is folded into the workflow
reducer/component tests (e.g. focus-management assertions inside
`contractorWorkflowState.test.mjs`-style files) rather than living in a
standalone suite. This is a real gap Phase 2/7 must account for when
"adding targeted tests" — new tests should extend the existing per-domain
test files rather than invent a parallel `*a11y*` convention unless a
dialog/drawer primitive is actually extracted (§7-8 decision).

## 18. Orchestration call paths

Not deep-audited in this pass beyond what Sprint 4.5's architecture guard
already asserts (`check:architecture` 25/25, including "canonical core is
consumed through its public index" and calculation-purity checks). Phase
5's own measurement step is where actual call-count instrumentation
happens — asserting anything about render/orchestration counts here
without measurement would violate the task's own "not measure = not
optimize" principle.

## 19. Storage orphan identification capability

Already certified as a **capability**, not an operational tool: Stage 9's
ST-10 (`docs/STORAGE_RUNTIME_CERTIFICATION.md`) confirms an authorized
user's `list()` call enumerates a project/month folder, which is
sufficient query surface for orphan identification. No script exists yet
that does this in an operational (admin, read-only, dry-run,
tenant-filtered) context — that is Phase 6's actual deliverable, net-new
work, not present today.

## 20. Existing documentation — status snapshot (verified by direct read, not assumed)

Several of the docs this task requires "updating" already exist as
**short interim-status stubs** written by an earlier pass, honestly
marked incomplete rather than false-PASS:

| Doc | Lines | Actual content |
|---|---:|---|
| `ACCESSIBILITY_AUDIT.md` | 13 | P1/P2 issue table, static-only, "Live keyboard/screen-reader browser verification remains unavailable" |
| `MOBILE_FIELD_USABILITY.md` | 17 | Static overflow audit table, every viewport row says "live verification: unavailable" |
| `RENDER_PERFORMANCE_REPORT.md` | 7 | Qualitative claims about the Site Visit single-item render path; "Live React render profiling was unavailable" |
| `ESLINT_WARNING_RESOLUTION.md` | 11 | Stage table (32→30→26), no actual per-warning resolution log |
| `WORKFLOW_UI_STABILIZATION_REPORT.md` | 15 | Status line: `FIELD WORKFLOWS STABILIZED, LIVE MOBILE VERIFICATION PENDING` |
| `WORKFLOW_UI_AUDIT.md` | 168 | Substantial — full Contractor Report + PM Site Visit workflow audit, not a stub |
| `CONTRACTOR_REPORT_STABILIZATION_REPORT.md` | 47 | Substantial |
| `SPRINT_5_FINALIZATION_AUDIT.md` | 52 | The predecessor audit this document supersedes for frontend scope |

None of these documents claim a false PASS — every one is honest about
"unavailable"/"pending" where live verification was not possible. This
audit's job is to either confirm that gap is now closed (§10-11 says the
blocker is gone) or keep the same honest posture. No prior document will
be silently overwritten with an unearned PASS.

## Execution plan (per the task's fixed phase order)

1. **Mobile verification (Phase 1)** — now unblocked (§10-11). Verify/fix
   E2E fixture user availability first (§12), add mobile-viewport test
   coverage for both workflows at 390×844 (primary) + 320×568/360×800/
   412×915, using real `signInWithPassword`-backed sessions through the
   existing login flow — not component tests, per the task's explicit
   ban on treating component tests as live mobile verification.
2. **Dialog/drawer accessibility (Phase 2)** — fix the 4 non-conformant
   overlays (§7-8) to the same minimal semantic contract
   `MissingReportsModal.jsx` already has; decide shared-primitive vs.
   per-component fix once the 4 components' actual JSX is read in full
   (this audit only grepped attribute presence, not full structure).
3. **UI states (Phase 3)** — build the full 9-screen matrix; fix
   confirmed loading/empty/error/stale gaps.
4. **ESLint (Phase 4)** — resolve 16 `no-restricted-imports` (route each
   consumer to canonical config) + 6 `set-state-in-effect` + 4
   `exhaustive-deps`, per-category, with regression checks between
   categories per the task's discipline requirement.
5. **Performance (Phase 5)** — measure before fixing; the one concrete
   lead already visible from `npm run build` output: the
   `page-ContractorReport` chunk is 383.90 kB (101.85 kB gzip) — roughly
   4× the next-largest page chunk (`RiskDashboard` at 73.96 kB) — worth
   profiling for accidental non-lazy dependency inclusion, not yet
   diagnosed as a defect.
6. **Storage orphan runbook (Phase 6)** — net-new read-only script + doc.
7. **Final accessibility pass (Phase 7)**, **regression gate (Phase 8)**,
   **documentation (Phase 9)** — as specified, in order.
