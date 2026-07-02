# Architecture Debt Register

> Catalogues all identified architectural debt items from the July 2026 audit.
> Each item has an ID for tracking. Severity: Critical > High > Medium > Low.
> Status: **CLOSED** items include their commit hash. Open items retain original descriptions.
> Last synced: commits d575a7d through efe41a2.

---

## AD-001 — Expected Progress % Formula Duplicated in 4+ Locations ✅ CLOSED

**Status:** CLOSED · commit `d575a7d`  
**Resolution:** `computeExpectedPct` extracted to `src/utils/scheduleUtils.js`. All inline implementations replaced. 16 tests added (`engines/__tests__/scheduleUtils.test.mjs`).

**Severity:** HIGH

**Title:** `expectedPct` formula duplicated in progressEngine, riskEngine (×2), ganttService, and potentially others

**Description:**
The formula `Math.min(100, Math.round((elapsedDays / totalDays) * 100))` for computing what percentage of the project should be complete by a given date is independently implemented in:
- `progressEngine.calculateProgressComparison` (lines 277-280)
- `riskEngine.computeScheduleDeviation` (lines 66-68)
- `riskEngine.computeProjectRiskScore` (lines 185-190, slightly different Math.min/Math.max variant)
- `riskEngine.computeNoReportsRisk` (lines 122-125)
- `ganttService.getProjectTrend` (uses spiEngine.computePlannedPct which is per-WP, not per-project)

**Impact:**
- Rounding discrepancy between variants #3 (riskEngine scoring) and #1 (progressEngine comparison) — could produce 1-unit difference in edge cases
- When business rules change (e.g., adding non-working days), every location must be updated independently
- Bug in one location won't propagate to others — silent inconsistency

**Recommended Solution:**
Create `src/utils/scheduleUtils.js`:
```js
export function computeExpectedPct(project, referenceDate = new Date()) { ... }
```
Import and call from all five locations. Remove inline reimplementations.

**Estimated Effort:** S (2-4 hours)

---

## AD-002 — Three SPI Computations with Overlapping Names ✅ CLOSED

**Status:** CLOSED · commit `fe0d3f8`  
**Resolution:** `computeCalendarSpi(actualPct, expectedPct)` added to `spiEngine.js` as the single source of truth for the time-based (project-level) SPI. `progressEngine` and `riskEngine` now call it. `riskEngine` threshold tied to `getSPIStatus('critical')` boundary (0.80) from `statusColors.js` rather than a hardcoded 0.85. The three concepts are now clearly named: `computeCalendarSpi` (time-based), `computeSPIFromTasks` (Gantt task-level), and the inline riskEngine SPI (documented circular-import trade-off).

**Severity:** MEDIUM

**Title:** Three distinct "SPI" calculations exist without clear naming conventions

**Description:**
The acronym "SPI" (Schedule Performance Index) refers to three different computations:
1. **Report SPI** — `evmEngine.computeEVM`: `progress / expectedPct` at the project level (report-based)
2. **Gantt SPI** — `spiEngine.computeSPIFromTasks`: `avg(actual_progress) / avg(planned_progress)` at the Gantt task level
3. **Risk SPI** — inline in `riskEngine.computeProjectRiskScore` lines 248-254: same formula as Report SPI but computed locally to avoid circular import

The Dashboard SPI banner shows Gantt SPI (from `useGanttMetrics`). The EVM widget shows Report SPI (from `evmEngine`). The risk engine uses its own inline SPI for scoring.

**Impact:**
- Developers cannot infer which SPI a given value represents without tracing imports
- The Risk SPI (inline) could silently diverge from Report SPI if `evmEngine` changes its formula
- A PM looking at "SPI 0.82" in two places may be reading two different numbers

**Recommended Solution:**
- Rename exports: `computeGanttSPI` (spiEngine), `computeReportSPI` (extracted from evmEngine), rename UI labels
- Eliminate the Risk SPI inline block by accepting an optional `spi` parameter in `computeProjectRiskScore`
- Document the three SPIs in a comments block at the top of each engine

**Estimated Effort:** M (1-2 days)

---

## AD-003 — WeeklyReports.jsx Contains Business Logic ✅ CLOSED (partial)

**Status:** CLOSED (items 1–4) · commit `4407a53`  
**Resolution:** `OLD_TO_WP_WEEKLY`, `mapOldToWPStatus`, `deriveWPStatusesFromOldReport`, `mergeOldDerivedStatuses` moved verbatim to `src/engines/legacyReportEngine.js`. 30 tests added (`engines/__tests__/legacyReportEngine.test.mjs`). WeeklyReports.jsx now imports from the engine.  
**Remaining open:** Item 5 (`mergedStatuses` useMemo) and item 7 (inline engine orchestration) remain in the page; full extraction to hooks deferred.

**Severity:** HIGH

**Title:** WeeklyReports.jsx embeds legacy format adapters, cumulative merge logic, and engine orchestration (597 lines)

**Description:**
The following business-logic items are implemented directly in `pages/WeeklyReports.jsx`:

1. `OLD_TO_WP_WEEKLY` mapping (lines 53-73): hardcoded translation table from old report field names to new WP IDs — data transformation belongs in a service/util
2. `mapOldToWPStatus(s)` (lines 75-82): status string normalisation — should be in `reportUtils.js`
3. `deriveWPStatusesFromOldReport(report)` (lines 84-101): converts old-format reports to WP statuses — should be in `reportUtils.js` or `reportService.js`
4. `mergeOldDerivedStatuses(derivedList)` (lines 103-117): merges cumulative derived statuses using scoring — should be in `reportUtils.js`
5. `mergedStatuses` useMemo (lines 268-292): 25-line score-based WP status merge — should be a `useMergedStatuses(reports, selectedReport)` hook

**Impact:**
- Any page that needs to display legacy-format reports must copy these functions
- A new developer reading this page cannot tell where "page layout" ends and "business rules" begin
- Test coverage for these functions is impossible without React testing infrastructure

**Recommended Solution:**
1. Move `OLD_TO_WP_WEEKLY`, `mapOldToWPStatus`, `deriveWPStatusesFromOldReport`, `mergeOldDerivedStatuses` to `src/utils/reportUtils.js`
2. Extract `mergedStatuses` computation to `src/hooks/useMergedStatuses.js`
3. Extract engine orchestration (risk/health/readiness) to `src/hooks/useWeeklyReportEngines.js`

**Estimated Effort:** L (3-5 days)

---

## AD-004 — portfolioEngine.js Violates Single Responsibility (9 Functions, 3 Domains) ✅ CLOSED

**Status:** CLOSED · commits `dbd3345` (split), `efe41a2` (dead export removed)  
**Resolution:** portfolioEngine.js split into 3 focused files:
- `portfolioEngine.js` (134 lines): `computePortfolioAlerts`, `computeContractorPerf`, `computePortfolioKpis`, `computePortfolioMissing`, `computePortfolioCommands`
- `siteVisitEngine.js` (115 lines): `computeSiteVisitData`, `computeSiteVisitKpis`
- `portfolioRiskEngine.js` (23 lines): `computeRiskSummaryStats`
- `computeSpiAlerts` deleted (zero importers confirmed by grep before deletion)

**Severity:** MEDIUM

**Title:** portfolioEngine.js contains 9 functions spanning 3 distinct product concerns

**Description:**
`portfolioEngine.js` exports:
- Alert generation: `computePortfolioAlerts`, `computeSpiAlerts`
- KPI aggregation: `computePortfolioKpis`, `computePortfolioMissing`, `computeRiskSummaryStats`
- Contractor performance: `computeContractorPerf`
- Site visit data: `computeSiteVisitData`, `computeSiteVisitKpis`
- Command aggregation: `computePortfolioCommands`

These belong to at least 3 product domains: portfolio health, contractor performance, and PM verification.

**Impact:**
- Adding a new alert type requires editing a file that also contains site-visit code
- No meaningful unit test boundary exists for individual concerns
- Difficult to understand which functions to call for which page

**Recommended Solution:**
Split into:
- `portfolioAlertsEngine.js`: `computePortfolioAlerts`, `computeSpiAlerts`, `computePortfolioCommands`
- `portfolioKpiEngine.js`: `computePortfolioKpis`, `computePortfolioMissing`, `computeRiskSummaryStats`
- `siteVisitAnalyticsEngine.js`: `computeSiteVisitData`, `computeSiteVisitKpis`
- `portfolioContractorEngine.js`: `computeContractorPerf` (merge with `contractorEngine.computePortfolioContractorScores`)

Maintain a re-export barrel at `portfolioEngine.js` for backward compatibility.

**Estimated Effort:** M (1-2 days)

---

## AD-005 — PM Visit Comparison Logic Duplicated in portfolioEngine and projectSummaryEngine ✅ CLOSED (partial)

**Status:** CLOSED (classification layer) · commit `a99f207`  
**Resolution:** `discrepancySeverity(delta)` and `classifyDiscrepancy({ pmRank, gcRank, delta })` extracted to `discrepancyEngine.js` as the single source of truth. All three inline classification blocks replaced. 29 tests added (`engines/__tests__/discrepancyClassify.test.mjs`).  
**Remaining open:** The 3-format structural detection (Gantt WP / legacy WP / flat fields) is still separately implemented in `siteVisitEngine.computeSiteVisitData` and `projectSummaryEngine.computeProjectSummary`. A shared `computeVisitItems(visit, gcReport)` helper could eliminate this, but is deferred (the classification divergence risk — the higher-risk part — is resolved).

**Severity:** HIGH

**Title:** Two near-identical PM visit comparison implementations with 3-format detection

**Description:**
`portfolioEngine.computeSiteVisitData` (lines 140-221) and `projectSummaryEngine.computeProjectSummary` (lines 85-159) both implement:
- 3-format detection: Gantt WP format (`visit.wps`), legacy WP format (`pmWorkPackageStatuses`), oldest flat format
- Match/discrepancy/pmAhead counting
- `assessed`/`matches` statistics

The two implementations are nearly identical but not identical. Minor differences in edge-case handling create a risk of divergence.

**Impact:**
- When a new site-visit format is added, two files must be updated
- Bug fixes in one may not be applied to the other
- Dashboard totals and Drawer totals could disagree

**Recommended Solution:**
Extract `computeVisitComparisonStats(visit, gcReport)` returning `{ assessed, matches, discrepancies, pmAhead, matchRate }` and call it from both engines.

**Estimated Effort:** S (2-4 hours)

---

## AD-006 — projectHealthEngine.js Uses Hardcoded Weights

**Severity:** LOW

**Title:** Health score weights (30/25/20/15/10) are hardcoded in projectHealthEngine.js

**Description:**
`projectHealthEngine.computeProjectHealth` (line 19-23) computes:
```js
const riskPts     = (1 - riskScore.score / 100) * 30;
const progressPts = (progress / 100) * 25;
const contPts     = (contScore.performanceScore / 100) * 20;
const alignPts    = (contScore.pmAlignmentScore / 100) * 15;
const pmPts       = (contScore.breakdown.pmAlignment / 30) * 10;
```
These weights are hardcoded, unlike `riskWeights.js` and `reportWeights.js` which externalise their weights.

**Impact:**
- Cannot tune health scoring without modifying engine code
- Inconsistent with the configuration-over-duplication principle used elsewhere

**Recommended Solution:**
Add `src/config/healthWeights.js`:
```js
export const HEALTH_WEIGHTS = { risk: 30, progress: 25, performance: 20, alignment: 15, pmCoverage: 10 };
```
Import in `projectHealthEngine.js`.

**Estimated Effort:** XS (< 1 hour)

---

## AD-007 — Two Parallel Action/Command Systems

**Severity:** MEDIUM

**Title:** `actionEngine.computeRecommendedActions` and `commandEngine.getCommands` serve the same purpose with different schemas

**Description:**
Both engines look at: behind-schedule status, high/critical risk, opening at risk, missing reports. Both produce "what the PM should do" lists.

- `actionEngine`: outputs `{ priority: 'HIGH'/'MEDIUM', action, reason }[]` — used by RiskDashboard detail cards
- `commandEngine`: outputs `{ id, severity: 'critical'/'warning'/'info', title, reason, action, projectCode }[]` — used by Home priorities feed and `core/insights`

The `commandEngine` is more structured (ID-based, config-driven, sortable). `actionEngine` is simpler but overlapping.

**Impact:**
- New action conditions must be added to both files independently
- RiskDashboard and Home may show different "recommended actions" for the same situation
- Unclear which engine is the canonical source of PM guidance

**Recommended Solution:**
Consolidate: `actionEngine` should be removed; `commandEngine.getCommands` output should be adapted to produce both formats, or `computeRecommendedActions` should be replaced by a mapping from `getCommands` output. The action card in RiskDashboard should consume `commandEngine` output.

**Estimated Effort:** M (1-2 days)

---

## AD-008 — `ganttService.refreshPlannedProgress` Reimplements `spiEngine.computePlannedPct`

**Severity:** LOW

**Title:** Inline `planned_progress` computation in ganttService duplicates spiEngine function

**Description:**
`ganttService.refreshPlannedProgress` (lines 365-378) computes planned progress with inline logic:
```js
pct = Math.min(100, (today - start) / (end - start) * 100);
```
`spiEngine.computePlannedPct(plannedStart, plannedEnd, referenceDate)` implements the same formula with additional guard conditions (NaN, end <= start).

**Impact:**
- The service function lacks the guard conditions from spiEngine
- Bug fixes in one won't apply to the other

**Recommended Solution:**
Replace inline block with `import { computePlannedPct } from '../engines/spiEngine'` and call `computePlannedPct(t.planned_start, t.planned_end, today)`.

**Estimated Effort:** XS (< 30 minutes)

---

## AD-009 — progressDeltaEngine.phasePct Mirrors PhaseStepper Logic

**Severity:** MEDIUM

**Title:** `progressDeltaEngine.phasePct` and `PhaseStepper.wpProgress` compute the same value separately

**Description:**
`progressDeltaEngine.phasePct` (lines 56-69) computes per-phase progress from WP status maps using WP_STATUS_SCORES. The `PhaseStepper` component (in `components/weekly/`) contains a `wpProgress` function that computes the same value for display purposes.

**Impact:**
- Phase progress shown in the timeline stepper may not match delta calculations
- Bug in one won't be fixed in the other

**Recommended Solution:**
Extract to `progressEngine.computeWPPhasePct(wp, statuses)`. Both `progressDeltaEngine.phasePct` and PhaseStepper should import this.

**Estimated Effort:** S (2-4 hours)

---

## AD-010 — Legacy Format Support Scattered Across Multiple Files

**Severity:** MEDIUM

**Title:** Old report format (demolitionStatus/constructionStatuses) handled in WeeklyReports.jsx, reportUtils.js, reportService.js, pmAlignmentEngine.js, portfolioEngine.js

**Description:**
The legacy "flat field" report format is handled in at least 5 files. There is no single migration path or clear deprecation timeline. `reportUtils.js` itself contains comments noting functions are `@legacy`. WeeklyReports.jsx contains the most complex legacy-to-new mapping (`OLD_TO_WP_WEEKLY`).

**Impact:**
- Any code touched by format detection is harder to maintain
- New developers cannot determine which format is "current" without reading multiple files
- The migration path is not tracked

**Recommended Solution:**
1. Document the 3-format sequence: (1) flat fields, (2) pmWorkPackageStatuses, (3) Gantt WP format
2. Centralise all format-detection and conversion in `src/utils/reportFormatUtils.js`
3. Track migration progress — add a `formatVersion` field to reports table
4. Set a deadline for retiring format-1 support

**Estimated Effort:** L (3-5 days)

---

## AD-011 — RiskDashboard.jsx Defines Inline Sub-Components (SPISparkline, FilterBar, Glyph)

**Severity:** LOW

**Title:** Three sub-components defined inline in RiskDashboard.jsx instead of as shared components

**Description:**
`RiskDashboard.jsx` defines `SPISparkline` (lines 46-69), `FilterBar` (lines 72-98), and `Glyph` (lines 21-33) as top-level functions within the page file rather than as separate component files.

**Impact:**
- `SPISparkline` cannot be reused in Dashboard or WeeklyReports without copy-paste
- `Glyph` duplicates functionality of the existing `Icon` component
- A 874-line page file is hard to navigate

**Recommended Solution:**
- Extract `SPISparkline` → `components/analytics/SPISparkline.jsx`
- Replace `Glyph` with `Icon` from `components/shared/Icon.jsx`
- Extract `FilterBar` → `components/dashboard/FilterBar.jsx`

**Estimated Effort:** S (2-4 hours)

---

## AD-012 — contractorEngine Re-Computes Progress Already Available in Row

**Severity:** LOW

**Title:** `contractorEngine.computeContractorScores` independently computes project progress (line 52-54)

**Description:**
At lines 52-54 of `contractorEngine.js`:
```js
const wpCum  = computeWPCumulativeStatuses(projReports);
const legCum = computeCumulativeStatuses(projReports) || {};
const gcProgress = calculateProjectProgressResult(wpCum, legCum).progress;
```
This recomputes the same progress value that `useAllRows` already computed and that is passed to the engine's consumers. The engine could accept `progress` as a parameter and avoid the redundant computation.

**Impact:**
- Minor redundant CPU work on every row computation
- Potential for contractorEngine's "progress" to diverge from the display value if `useAllRows` applies scope overrides

**Recommended Solution:**
Add an optional `progress` parameter to `computeContractorScores`. When provided, skip the internal recomputation.

**Estimated Effort:** XS (< 1 hour)

---

## AD-013 — No Test Coverage for Risk, EVM, Monte Carlo, or ganttLayout Engines ✅ CLOSED (partial)

**Status:** CLOSED (primary targets) · commit `01d1a4c`  
**Resolution:** Characterization test suites added for `riskEngine` (48 checks), `evmEngine` (45 checks), `monteCarloEngine` (42 checks). These tests also surfaced two bugs fixed in the same session (see AD-014, AD-015).  
**Remaining open:** `ganttLayout`, `contractorDriftEngine`, `cascadeEngine`, `commandEngine`, `escalationEngine`, `siteVisitEngine`, `portfolioRiskEngine` still have no test suites.

**Severity:** MEDIUM

**Title:** Critical business engines have zero test coverage

**Description:**
Test coverage exists for:
- `ganttEngine` — `tests/ganttEngine.test.js` (partial)
- `discrepancyEngine` — `tests/discrepancyEngine.test.js`
- `progressEngine` — `tests/progressWeights.test.js` and `tests/phaseWeights.test.js` (partial)

No test coverage for:
- `riskEngine` (complex scoring with 9 factors, threshold logic)
- `evmEngine` (EVM formulas)
- `monteCarloEngine` (stochastic — at minimum smoke test with fixed sigma)
- `ganttLayout` (geometry calculations)
- `contractorEngine` (scoring dimensions)
- `cascadeEngine` (BFS propagation)
- `commandEngine` (priority logic)

**Impact:**
- Regressions in risk scoring or EVM go undetected
- Formula changes cannot be validated
- Contributor confidence is low when touching these files

**Recommended Solution:**
Priority test targets: (1) riskEngine — test each of the 9 scoring factors independently; (2) commandEngine — test all 5 command conditions; (3) cascadeEngine — test BFS propagation; (4) monteCarloEngine — deterministic test with effectiveSigma=0.

**Estimated Effort:** L (3-5 days for meaningful coverage)

---

## AD-014 — monteCarloEngine Probability Buckets Don't Sum to Exactly 100 ✅ CLOSED

**Status:** CLOSED · commit `ecc5582`  
**Surfaced by:** AD-013 characterization tests.  
**Description:** `pDelayCritical` was computed with an independent `Math.round(delayCrit/N*100)`, meaning the four probability buckets summed to 99 or 101 due to independent rounding errors.  
**Resolution:** `pDelayCritical = 100 - pOnTime - pDelay2Weeks - pDelayMonth` (remainder bucket). Sum is always exactly 100. Test C7 updated from `>= 98 && <= 102` to `=== 100`.

**Severity:** LOW (correctness bug, not architecture)

---

## AD-015 — evmEngine Misclassifies Not-Yet-Started Projects as Critical ✅ CLOSED

**Status:** CLOSED · commit `ecc5582`  
**Surfaced by:** AD-013 characterization tests.  
**Description:** When `PV === 0` and `EV === 0` (project not yet started, construction start in the future), `computeCalendarSpi` returns null, falling back to SPI=0, which then hit the `else critical` branch — labelling a not-started project as critically behind schedule.  
**Resolution:** Guard added before the 4-tier block: `if (PV === 0 && EV === 0) spiStatus = 'not_started'`. `EvmWidget` updated to render "Not Started" badge (muted grey). Test D7 added; D6 (overdue project with EV=0) still asserts `'critical'`.

**Severity:** LOW (display bug, not data bug)

---

## AD-016 — `useGanttMetrics` Does Not Refresh After Project Changes

**Severity:** LOW

**Title:** `useGanttMetrics` has a "load once" guard (`if (ganttMetrics.size > 0) return`) that prevents updates

**Description:**
In `hooks/useGanttMetrics.js` (line 19): `if (ganttMetrics.size > 0) return;`
This means that once Gantt metrics are loaded, they are never refreshed, even if a Gantt is regenerated for a project while the Dashboard is open.

**Impact:**
- SPI values in the Dashboard become stale after a Gantt regeneration without a page reload
- The `isStale` flag is computed but the underlying SPI is not refreshed

**Recommended Solution:**
Replace the early return with a dependency on a `version` counter or expose a `refresh()` function. Alternatively, accept a `refreshTrigger` prop and add it to the useEffect dependency array.

**Estimated Effort:** S (2-4 hours)

---

## Summary by Severity

### Closed Items
| ID | Severity | Summary | Commit |
|----|----------|---------|--------|
| AD-001 | HIGH | expectedPct unified in scheduleUtils.js | d575a7d |
| AD-002 | MEDIUM | computeCalendarSpi added; SPI concepts named | fe0d3f8 |
| AD-003 | HIGH | Legacy adapters moved to legacyReportEngine.js (items 1-4) | 4407a53 |
| AD-004 | MEDIUM | portfolioEngine split into 3 focused engines | dbd3345, efe41a2 |
| AD-005 | HIGH | classifyDiscrepancy unified in discrepancyEngine.js | a99f207 |
| AD-013 | MEDIUM | riskEngine, evmEngine, monteCarloEngine tests added | 01d1a4c |
| AD-014 | LOW | monteCarloEngine remainder bucket (surfaced by AD-013) | ecc5582 |
| AD-015 | LOW | evmEngine not_started guard (surfaced by AD-013) | ecc5582 |

### Open Items
| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 1 | AD-003 (partial — mergedStatuses useMemo + hook extraction remain) |
| MEDIUM | 4 | AD-007, AD-009, AD-010, AD-013 (partial — ganttLayout + 6 other engines untested) |
| LOW | 6 | AD-006, AD-008, AD-011, AD-012, AD-016, AD-005 (partial — 3-format structure still duplicated) |

**Priority order for remaining open items:**
1. AD-003 (partial) — extract mergedStatuses useMemo + engine orchestration to hooks
2. AD-007 — action/command unification (Medium, reduces confusion between Home and RiskDashboard)
3. AD-013 (partial) — add tests for ganttLayout, cascadeEngine, siteVisitEngine, portfolioRiskEngine
4. AD-010 — legacy format centralisation
5. AD-009 — progressDeltaEngine.phasePct mirrors PhaseStepper
6. AD-005 (partial) — shared computeVisitItems helper
7. Remaining Low items as opportunistic cleanups
