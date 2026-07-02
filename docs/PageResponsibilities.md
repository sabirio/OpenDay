# Page Responsibilities Audit

> All page files under `src/pages/`. Evaluated against the principle: **Pages orchestrate; Components render; Services communicate with persistence.**

---

## Summary Table

| Page | File | Business Question | Business Logic Inside? | Violations | Services Used | Hooks Used |
|------|------|------------------|----------------------|------------|--------------|-----------|
| Home | `pages/Home.jsx` | What are my priorities today? | Minimal — calls engines via hooks; one `computeOpeningReadiness` call inline | Low — inline engine call (see below) | None direct | `useAllRows`, `useGanttMetrics` |
| Dashboard | `pages/Dashboard.jsx` | Portfolio health at a glance | Low — ISO week computation (2 functions) | Low — ISO week math in page file | `projectService.getProgressSnapshot`, `ganttService.regenerateGantt` | `useAllRows`, `useGanttMetrics` |
| WeeklyReports | `pages/WeeklyReports.jsx` | Detailed per-project, per-week operational status | MEDIUM — format adapters moved to legacyReportEngine (AD-003); mergedStatuses useMemo and direct engine calls remain | PARTIAL — `mergedStatuses` computation inline; 8+ direct engine calls in useMemo | `ganttService.getProjectGantt`, `ganttService.updateWPDates`, `templatesApi.fetchActiveTemplate`, `templatesApi.fetchTemplateById` | None — uses imported engines directly |
| RiskDashboard | `pages/RiskDashboard.jsx` | Risk register, PM alignment, contractor perf, Gantt SPI | Low for business math; HIGH for UI orchestration | Inline sort logic, format-dependent rendering, SVG sparkline component inline | `ganttService.getProjectTrend`, `dashboardService.getDiscrepancyHistory`, `dashboardService.getContractorReliability` | `useRiskRows`, `useGanttMetrics` |
| Projects | `pages/Projects.jsx` | Project management CRUD | Low — delegates to service | None significant | `projectService`, `ganttService.generateAndSaveGantt`, `ganttService.regenerateGantt` | None |
| ContractorReport | `pages/ContractorReport.jsx` | Submit weekly contractor progress report | Medium — form orchestration; no engine calls | Minimal — form state management only | `reportService`, `siteVisitService`, `ganttService` | None |
| SiteVisitReport | `pages/SiteVisitReport.jsx` | Submit PM site visit observation | Medium — form orchestration | Minimal — form state management only | `siteVisitService`, `reportService` | None |
| SiteVisitSelect | `pages/SiteVisitSelect.jsx` | Select project for site visit | None | None | `siteVisitService` | None |
| ContractorSelect | `pages/ContractorSelect.jsx` | Select project to report on | None | None | `reportService` | None |
| TemplateEditor | `pages/TemplateEditor.jsx` | Edit work package templates | Low — delegates to core/projects | None | `templatesApi` | None |
| WeightAudit | `pages/WeightAudit.jsx` | Debug weight computation | Display only | None | None | None |
| AdminUsers | `pages/AdminUsers.jsx` | User management | None | None | `authService` | None |
| Login | `pages/Login.jsx` | Authentication form | None | None | `authService` | None |
| ResetPassword | `pages/ResetPassword.jsx` | Password reset form | None | None | `authService` | None |
| Unauthorized | `pages/Unauthorized.jsx` | 403 message | None | None | None | None |

---

## Per-Page Assessment

### Home.jsx
**Business question:** What should the PM focus on today?

**Assessment:** Largely clean. Uses `useAllRows` and `useGanttMetrics` hooks correctly. Calls engine functions (`computePortfolioAlerts`, `computePortfolioKpis`, `getCommands`) directly in `useMemo` blocks — which is acceptable since hooks call engines and pages call hooks, but the distinction is thin here.

**Violation (minor):** Line 28: `computeOpeningReadiness(wpCumulativeStatuses, project.targetOpeningDate)` called inline inside `allCommands` useMemo. This engine call belongs in a hook rather than the page itself. `useAllRows` could pre-compute `openingReadiness` per row (some rows already have it from `computeRiskRows` in the Risk Dashboard path). Effort to fix: S.

**Services used:** None directly — data comes from props (`projects`, `reports`, `siteVisits`) passed from App.jsx.

**Components rendered:** `MorningBrief`, `PrioritiesToday`, `PortfolioHealth`.

---

### Dashboard.jsx
**Business question:** What is the portfolio-level health, risk posture, and contractor status?

**Assessment:** Well-orchestrated. Correctly delegates all business logic to engines (`portfolioEngine`, `useAllRows`, `useGanttMetrics`). The page itself acts as a coordinator: filtering, sorting, and routing data to tab sub-components.

**Violations (minor):**
- **Lines 22-37: `isoWeekLabel()` and `currentISOWeek()`** — these are ISO week number utility functions that contain date arithmetic. They belong in `dateUtils.js` not the page file. Not a business-logic violation, but a code-organisation concern.
- **Lines 109-123: Heatmap row construction** — the 16-week bucket computation is done inline in a `useMemo`. This is at the boundary of "presentation logic" vs "business logic." It filters reports into weekly buckets — arguably belongs in a utility function.

**Services used:** `projectService.getProgressSnapshot` (for time-travel snapshot), `ganttService.regenerateGantt` (passed as prop to ProjectDetailDrawer).

**Hooks used:** `useAllRows`, `useGanttMetrics`.

---

### WeeklyReports.jsx
**Business question:** What is the detailed operational status for this project on this reporting date?

**Assessment:** Significant improvement since initial audit. Legacy format adapters (AD-003) moved to `legacyReportEngine.js`; page now imports them cleanly. Still the largest and most complex page.

**Resolved (AD-003 — commit 4407a53):**

1. ~~`OLD_TO_WP_WEEKLY` mapping~~ → moved to `legacyReportEngine.js`
2. ~~`mapOldToWPStatus(s)`~~ → moved to `legacyReportEngine.js`
3. ~~`deriveWPStatusesFromOldReport(report)`~~ → moved to `legacyReportEngine.js`
4. ~~`mergeOldDerivedStatuses(derivedList)`~~ → moved to `legacyReportEngine.js`

**Remaining violations:**

5. **`mergedStatuses` useMemo (approx. 25 lines):** Builds the current cumulative WP status snapshot by combining `current` report + `cumulative` history with a score-based max. Complex business logic embedded inline. Should be in a `useMergedStatuses` hook.

6. **Engine calls in useMemo:** WeeklyReports calls `calculateProjectProgress`, `calculateProgressComparison`, `computeProjectRiskScore`, `computeContractorScores`, `computeProjectHealth`, `computeOpeningReadiness` and others directly. These calls belong in a `useWeeklyReportEngines` hook.

**Summary:** The page is smaller than before (legacy adapters removed) but still orchestrates too much inline. Target refactor: extract `mergedStatuses` to a hook and engine orchestration to `useWeeklyReportEngines`, dropping the page to ~250 lines of pure layout orchestration.

---

### RiskDashboard.jsx
**Business question:** What is the risk posture of every project, and who requires intervention?

**Assessment:** Largely correct but very long (874 lines). The page correctly uses `useRiskRows` hook and delegates all computation to engines. The main concerns are organisational.

**Violations:**

1. **`SPISparkline` component (lines 46-69):** A full SVG rendering component defined inline in the page file. Should be in `components/analytics/SPISparkline.jsx`.

2. **`FilterBar` component (lines 72-98):** An extracted sub-component defined inline. Should be in `components/dashboard/FilterBar.jsx`.

3. **`Glyph` component (lines 21-33):** An inline SVG icon component. Should use the shared `Icon` component from `components/shared/Icon.jsx`.

4. **Sorting logic (line 655):** Items sort inline in JSX: `[...items].sort((a, b) => { const order = {...}; return ... })`. Minor — could be a utility but doesn't affect architecture.

5. **Direct engine call in PM Alignment view (lines 627-629):** `computePmAlignmentItems(gcAtVisit, visit)` and `summarizeAlignmentItems(items)` called directly in the JSX render. These calls should be pre-computed in a useMemo, not in render output.

**Services used:** `ganttService.getProjectTrend`, `dashboardService.getDiscrepancyHistory`, `dashboardService.getContractorReliability` — all in `useEffect` blocks, which is correct.

---

### Projects.jsx
**Business question:** How do I manage the project list (CRUD + Gantt generation)?

**Assessment:** Properly delegates to services. Gantt generation is correctly triggered through `ganttService.generateAndSaveGantt`. The `ProjectScopeConfigurator` component is embedded in the project form — this is a form-within-a-form pattern that is complex but architecturally acceptable.

---

### ContractorReport.jsx
**Business question:** How does a contractor submit a weekly progress report?

**Assessment:** Form-heavy. The key architectural point: on submit, it correctly passes the pre-computed `cumulativeProgress` to `reportService.create`, allowing the service to record the same number the UI shows. This was an explicit design decision documented in `reportService.js` (line 292).

---

### TemplateEditor.jsx
**Business question:** How do I configure custom work package templates?

**Assessment:** Clean. Delegates to `core/projects/templateEditor.js` and `templatesApi`. Uses `validateTemplate` from `core/projects` for validation — correct layer for that.
