# Sprint 5 Workflow and UI Audit

Baseline: 2026-07-10. This audit was completed before Sprint 5 implementation changes. It covers the actual React routes, hooks, command models, services, CSS, tests, and current ESLint output. Production data and database schema were not touched.

## Audit health

| Dimension | Score | Key finding |
| --- | ---: | --- |
| Accessibility | 1/4 | Submit failures use blocking `alert`; several custom dialogs/drawers lack complete dialog, focus-trap, Escape, and focus-return behavior. |
| Performance | 2/4 | Derived state is set in effects; hook dependencies are stale; drafts serialize on every edit; long WP lists render in full. |
| Responsive design | 2/4 | Field pages have useful narrow-layout CSS and sticky submit, but long scopes lack position recovery/navigation and some targets are below 44 px. |
| Theming | 3/4 | App tokens and a deliberate fixed-light field palette exist; inline styles and literal `white` remain common. |
| Anti-patterns | 1/4 | Repeated thick side-accent cards and width transitions are systemic; component vocabulary is inconsistent. |
| **Total** | **9/20** | **Poor — workflow hardening required before pilot.** |

No P0 issue was found. P1: 12 categories; P2: 11 categories; P3 findings are intentionally omitted unless actionable.

## Workflow inventory

| Workflow | Entry point | Actual states | Persistence | Failure recovery | Mobile status | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Contractor Report | `/contractor-report/:projectId` | context loading/error, editing, validation error, upload pending/error, submitting, submitted | `localStorage`, project-only key; form/WP/photo paths/request ID | same request ID survives ordinary retry/refresh; generic alert on submit failure | stacked layout and sticky action exist | High: no user/version/expiry isolation; restore is silent; no explicit replay state |
| PM Site Visit | `/site-visit/:projectId` | editing, restored banner, validation error, loading scope, submitted comparison | `localStorage`, project-only key; form/observations/photo paths/request ID | atomic Gantt path reuses ID; generic alert; legacy fallback bypasses certified command | stacked layout and sticky action exist | Critical: duplicate submit is possible; no upload blocker; separate legacy submit path |
| Photo upload | shared `PhotoUpload` | selecting/compressing/uploading/success/error (mostly boolean) | remote paths only are stored in parent draft | retry requires reselect in several failures; finalize/orphan state is not explicit | previews work but controls are dense | High: per-file state and finalize retry are absent |
| Weekly Reports | `/weekly-reports` | loading/empty/content; historical compatibility data is composed | server/read model | limited retry/error affordance | horizontal containment exists; dense content | Medium: chronology/replay provenance is not consistently announced |
| Dashboard/Home | `/dashboard`, `/` | loading/empty/content; partial errors | none | errors are unevenly surfaced | sidebar/content collapse exists | Medium: stale data is not explicit; effect-driven rerenders |
| Risk Dashboard | `/risk` | loading/empty/content per view; Gantt SPI has separate loading | none | partial load failure is weakly communicated | tables/panels can become dense | Medium: color and compact status presentation need text verification |
| Project Detail Drawer | Dashboard row selection | closed/open | URL/state only | close action only | fixed 920 px with `maxWidth:97vw` | High: dialog semantics/focus lifecycle are incomplete |

## State inventory

Legend: **explicit**, *implicit*, — absent, **mixed** means several booleans can contradict.

| State | Contractor Report | PM Site Visit |
| --- | --- | --- |
| idle | *implicit* | *implicit* |
| loading | **explicit** context/Gantt booleans | **explicit** Gantt boolean |
| draft restored | *implicit/silent* | **explicit** banner |
| editing | *implicit* | *implicit* |
| validating | *synchronous implicit* | *synchronous implicit* |
| validation failed | **explicit** error array | **explicit** error array |
| uploading | **explicit boolean** | *inside uploader only* |
| upload partially complete | — | — |
| ready to submit | *implicit* | *implicit* |
| submitting | **explicit boolean** | — |
| submitted | **explicit** | **explicit** |
| idempotent replay | — | — |
| retryable error | *alert + retained form* | *alert + retained form* |
| non-retryable error | **mixed with retryable** | **mixed with retryable** |
| offline/network unavailable | — | — |
| stale draft | — | — |
| conflict | — | — |

The current boolean model permits ambiguity. Contractor submit is guarded, but loading, upload, validation, and submit do not share one contract. PM submit has no in-flight guard at all.

## Draft and submit findings

- **P1 — tenant/user leakage on shared devices.** Keys are `contractor_draft_<project>` and `sitevisit_draft_<project>`; user ID and workflow schema version are absent. A later user of the same browser can restore another user's field data.
- **P1 — PM duplicate submit.** `SiteVisitReport.submit` has no in-flight state/early return and the button is not disabled.
- **P1 — PM parallel write path.** When no Gantt tasks exist, `onSaveSiteVisit` is called instead of the certified site-visit command model. This is an existing compatibility path but violates the requested single submit boundary.
- **P1 — uploads are not part of PM submit readiness.** PM does not receive or guard an aggregate uploading state.
- **P1 — recovery state is not precise.** Timeout, replay, fatal validation, network unavailable, and persisted success are not distinguished in either UI.
- **P2 — Contractor restore is silent.** Users cannot tell restored data from server prefill and cannot safely discard it.
- **P2 — no schema migration/expiry/corruption message.** Corrupt JSON is ignored; old drafts never expire.
- **P2 — write amplification.** Entire draft JSON is serialized synchronously on every keystroke.
- Positive: both atomic paths preserve `client_request_id` across retry and clear drafts only after awaited success. Contractor also blocks duplicate clicks and pending uploads.

## Mobile audit

Static CSS/code audit was performed for all required viewports; live authenticated viewport certification remains required after implementation.

| Screen | Viewport | Horizontal overflow | Touch targets | Sticky actions | Form usability | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| Contractor | 320×568 | contained by field styles; tables use scroll wrapper | mixed; compact controls below 44 px exist | yes | very long WP flow, no position recovery | Partial |
| Contractor | 360×800 | no expected page overflow | mixed | yes | usable, status/recovery unclear | Partial |
| Contractor | 390×844 | no expected page overflow | mixed | yes | primary target viewport, needs browser test | Partial |
| Contractor | 412×915 | no expected page overflow | mixed | yes | usable | Partial |
| Contractor | 768×1024 | two-column helpers available | mostly adequate | yes | usable | Good |
| PM Site Visit | 320×568 | contained; comparison may scroll | mixed | yes | long full-list workflow; duplicate submit risk | Poor |
| PM Site Visit | 360×800 | no expected page overflow | mixed | yes | no next/previous/incomplete filter | Poor |
| PM Site Visit | 390×844 | no expected page overflow | mixed | yes | needs authenticated browser test | Partial |
| PM Site Visit | 412×915 | no expected page overflow | mixed | yes | long scopes remain costly | Partial |
| PM Site Visit | 768×1024 | adequate width | mostly adequate | yes | usable | Good |

## Accessibility findings

| Issue | Screen/component | Severity | Required fix | Verification |
| --- | --- | --- | --- | --- |
| Blocking `alert` for submit errors | both critical forms | P1 | persistent `role=alert`/live status with retry guidance | component + keyboard test |
| Validation summary does not reliably focus/target fields | both forms | P1 | focusable summary, field links, `aria-invalid`/`aria-describedby` | component test |
| Project drawer incomplete dialog lifecycle | `ProjectDetailDrawer` | P1 | dialog label, modal semantics, focus trap/return, Escape | keyboard test |
| Project modals are visual div modals | project modal family | P1 | semantic dialog and shared focus behavior | component test |
| Loading/submitting changes are not announced | field forms | P1 | polite status; submit error assertive | screen-reader assertion |
| Compact buttons/checkbox affordances | field forms | P2 | 44×44 minimum on touch layout | viewport inspection |
| Status sometimes relies primarily on color | risk/progress surfaces | P2 | pair with text/icon/state labels | axe/manual review |
| Heading hierarchy varies within card sections | field/read pages | P2 | semantic page and section headings | DOM audit |

Positive: native inputs are widely used, several dialogs already have correct `role=dialog`, focus tokens exist, and field colors use semantic tokens.

## Performance findings

- **P1:** 10 `react-hooks/set-state-in-effect`/dependency warnings identify cascading or stale render risks in app loading, reports, risk, and field workflows.
- **P2:** Contractor/PM draft writes stringify full state on every edit with no debounce.
- **P2:** long Gantt/WP lists render in full; no focused/incomplete scope mode exists.
- **P2:** width transitions occur in progress UI and were detected in `EvmWidget`, `ScoreBar`, `WeightAudit`, and CSS.
- **P2:** inline object/function props are pervasive; optimize only after profiling confirms material rerenders.
- Positive: major read-side calculations use memoized hooks/core models; large calculations are not being moved into UI in this sprint.

## ESLint warning inventory (32)

| Rule | Files / count | Cause | Runtime risk | Planned resolution |
| --- | ---: | --- | --- | --- |
| `no-restricted-imports` | 14 | certified legacy compatibility imports (`workPackages`, `reportWeights`) | semantic drift if mechanically replaced | migrate only through existing template/presentation boundaries with equivalence tests |
| `react-hooks/set-state-in-effect` | 10 | synchronous loading/reset/derived state in effects | cascading renders and flicker | initialize/derive in render or move updates behind async subscription callbacks |
| `react-hooks/exhaustive-deps` | 7 | unstable inputs/helpers or missing dependencies | stale context, scope, layout, review data | stabilize callbacks/input objects and add exact dependencies |
| suppressed exhaustive-deps | 1 pattern in each field form | draft effect intentionally omits key/helper dependencies | stale key after route identity changes | move draft persistence to a stable workflow hook |

Exact warning locations at baseline: `App.jsx:202`; `GanttChart.jsx:454`; four contractor legacy files; two site-visit view files; `dashboardConstants.js` (2); four engines; `useGanttMetrics.js:29`; `useProjectAuditLog.js:11`; `useWeeklyGanttTasks.js:12`; `useWeeklyReportReviewModel.js:7`; `ContractorReport.jsx:45,172`; `RiskDashboard.jsx:55`; `SiteVisitReport.jsx:7,83,104,113`; `WeeklyReports.jsx:12,93,106`; `WeightAudit.jsx:54`; `reportUtils.js` (2).

## Anti-pattern verdict

The UI does not look like a generated marketing page, but it does contain a systemic generated-UI tell: thick colored left borders recur across at least 14 surfaces, including both field workflows. Layout-property width transitions occur in at least seven places. These are P2 cleanup items, behind workflow correctness and accessibility.

## Phase A decisions

1. Introduce lightweight reducer contracts, not a state-machine dependency.
2. Centralize versioned, user/project-isolated draft envelopes with expiry and corruption handling.
3. Keep one request ID until confirmed persisted success; replay is success, not an error.
4. Add explicit per-file upload states and make pending/finalize failures block submit.
5. Preserve Canonical Core, formulas, RPC semantics, RLS, migrations, and product metrics.
6. Do not add migration 027 in Sprint 5 UI work. Duplicate WP rows are rejected in UI validation; out-of-scope selection is constrained to project scope. Database enforcement remains a documented limitation unless separately certified.

## Contractor Report re-audit delta (2026-07-10)

The isolated Contractor Report stabilization pass re-read the implementation after the first Sprint 5 fixes.

1. Entry is `pages/ContractorReport.jsx`; it owns form, Gantt progress, upload-path, validation, and submit booleans locally.
2. Submit follows `ContractorReport.jsx` → `hooks/useContractorReportOrchestration.js` → `core/contractorReport/submitContractorReportModel.js` → `services/contractorReportService.js` → `submit_contractor_report_atomic` RPC. The page contains no direct Tier-1 write.
3. `client_request_id` is created through `core/write/writeCommand.js`, held in a ref, persisted in the old draft, reused across renders/refresh/retry, and replaced only after awaited success or explicit new-report action.
4. The pre-stabilization draft is one unversioned `{ form, ganttWpProgress, photoUrls, clientRequestId, savedAt }` blob under `contractor_draft_<projectId>`. It is project-isolated but not user/period/schema isolated, restores silently, never expires, writes on every edit, and silently ignores corruption.
5. Storage uploads use `PhotoUpload` → hook facade → `core/photo/uploadPhotoModel.js` → `photoService`. Persisted values are private bucket paths, not signed/object URLs. Parent submit is blocked while compression/upload is active. Per-file failure/retry/finalize state is not recoverable after refresh.
6. Client validation checks required business fields and photo presence. `submitContractorReportModel` rejects duplicate WP IDs before RPC. Scoped Gantt loading constrains normal Gantt selection, but the certified RPC still accepts out-of-scope and duplicate rows if called outside this UI.
7. Mobile field CSS supplies stacking and a sticky submit action. Long scope navigation, explicit review, recovery choice, and authenticated viewport certification are absent.
8. The first Sprint 5 fix made submit errors persistent and screen-reader announced, while preserving draft data. Validation focus and detailed retry/replay status remain incomplete.
9. Existing coverage proves service parameter mapping, stable request IDs, atomic RPC structure, form helper validation, architecture boundaries, and one real E2E submit. It does not cover draft version/isolation, reducer transitions, timeout/retry/replay UX, or refresh recovery.

## PM Site Visit re-audit delta (2026-07-10)

1. Entry is `pages/SiteVisitReport.jsx`; local state owns form, Gantt observations, photos, source report selection, and submit booleans.
2. Gantt submit follows page → `useSiteVisitOrchestration` → `submitSiteVisitModel` → `siteVisitService.submitSiteVisitAtomic` → certified `submit_site_visit_atomic`. No direct RPC exists in the page.
3. A separate legacy `onSaveSiteVisit` path remains when no Gantt tasks load. It is compatibility behavior, not the certified atomic workflow, and must remain explicitly visible as a limitation.
4. The old draft is unversioned `{ form, pmWpObservations, photoUrls, clientRequestId, savedAt }` under `sitevisit_draft_<project>`. It restores silently before the banner is shown, lacks user/source/date isolation, writes every edit, and does not preserve navigation/filter position.
5. `client_request_id` is held in a ref and old draft, reused for Gantt retry, and rotated after success. Replay is returned by the command model but ignored by the page.
6. Contractor comparison comes from two sources: legacy selected `reports` for legacy rows and `getLastContractorReport`/current scoped Gantt task values for atomic rows. Gantt rows visibly mark GC status and progress, but all tasks render at once.
7. Gantt observation shape is `{ observed_progress, observed_status, pm_note }`; submit maps only current scoped Gantt tasks and `validateUniqueWPItems` rejects duplicates. Existing Gantt statuses have no N/A value. Legacy rows support `Not Applicable`; inventing a Gantt N/A wire value would change certified semantics and is therefore out of scope.
8. Current validation checks visit date, schedule assessment, and declaration only. It does not explicitly summarize incomplete observations, pending uploads, or invalid restored scope.
9. Shared `PhotoUpload` now supplies per-file state, validation, retry, path recovery, and preview cleanup, but PM does not pass existing paths/items or block submit while upload is pending.
10. Mobile CSS stacks the page, but the complete long scope renders in nested zone/phase sections with no previous/next, filters, overview, or position recovery. Status buttons are below recommended touch size.
11. Validation summary lacks focus management and role alert. Submit error is accessible after the prior fix, but replay success, retry/fatal distinction, and unsaved-change protection are absent.
12. Baseline PM warnings: `SiteVisitReport.jsx` has one legacy import warning, two set-state-in-effect warnings, and one dependency warning; `SiteVisitFormView.jsx` has one legacy import warning.

## Priority actions

1. **P1 — harden:** workflow reducers, versioned drafts, submit/retry/replay, upload readiness, no parallel PM submit.
2. **P1 — clarify/adapt:** accessible validation/status and focused mobile WP navigation.
3. **P1 — polish:** shared dialog semantics and focus lifecycle.
4. **P2 — optimize:** debounce draft writes and fix measured effect/render issues.
5. **P2 — quieter:** remove thick side accents and layout-property transitions without redesigning the product.
