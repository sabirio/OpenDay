# Architecture Audit — CPOS (Construction Project Operating System)

**Audit Date:** 2026-07-02 (rev 2 re-audit: 2026-07-02, post commits d575a7d–efe41a2)
**Auditor:** Architecture Review Pass (automated + manual)
**Scope:** `weekly-tracker/src/` — all JS/JSX files

---

## Part 1 — Executive Summary

### Overall Score: 82 / 100 (+8 from 74 baseline)

The hardening pass closed 8 debt items — the four most impactful (AD-001, AD-003 partial, AD-004, AD-013) account for almost the entire score improvement. The engine layer is now measurably more consistent, better tested, and more cohesive. The remaining gap to 100 is primarily `WeeklyReports.jsx` orchestration, two parallel action systems, and uneven test coverage across secondary engines.

### Score Delta Breakdown

| Driver | Points |
|--------|--------|
| riskEngine/evmEngine/monteCarloEngine now tested (AD-013) | +4 |
| computeExpectedPct unified — highest formula risk eliminated (AD-001) | +2 |
| portfolioEngine SRP fixed, 3 focused files (AD-004) | +1 |
| computeCalendarSpi + classifyDiscrepancy unified (AD-002, AD-005) | +1 |

### Greatest Strengths (unchanged + reinforced)

1. **Pure engine design**: The majority of engines are pure JavaScript functions with no React imports, no Supabase calls, and no side effects. `commandEngine`, `escalationEngine`, `discrepancyEngine`, `cascadeEngine`, and `spiEngine` are textbook examples of SRP and testability.

2. **Config-over-code pattern**: Risk weights, schedule thresholds, phase weights, and dependency rules are all externalised to config files. When business rules change, no engine logic needs to change.

3. **Layered hook architecture**: `useAllRows` → `useRiskRows` is a clean composition pattern. The `computeRiskRows` pure function is extracted from the hook, making it independently testable.

4. **Service boundary clarity**: Supabase calls are isolated in `services/`. No page or component calls `supabase` directly.

5. **Progressive format support**: The three-generation report format (flat fields → WP statuses → Gantt WP format) is handled with backward compatibility throughout.

6. **Test-first refactoring**: AD-013 characterization tests were written before AD-004 refactoring, providing a regression net. The tests immediately caught two correctness bugs (AD-014, AD-015) that would otherwise have gone undetected.

### Remaining Weaknesses

1. **WeeklyReports.jsx still large** (AD-003 partial): `mergedStatuses` useMemo and inline engine orchestration remain; legacy adapters were extracted but the page still calls ~8 engines directly. Estimated ~500 lines.

2. **Two parallel action systems still active** (AD-007): `actionEngine.computeRecommendedActions` and `commandEngine.getCommands` overlap in purpose.

3. **3-format PM visit detection still duplicated** (AD-005 partial): `siteVisitEngine.computeSiteVisitData` and `projectSummaryEngine.computeProjectSummary` still implement the same Gantt-WP / legacy-WP / flat-fields branching logic independently. Classification is now unified; structure is not.

4. **Secondary engine test gaps**: `siteVisitEngine`, `portfolioRiskEngine`, `ganttLayout`, `cascadeEngine`, `contractorDriftEngine`, `escalationEngine`, `actionEngine`, `commandEngine` have no test suites.

5. **Legacy format support still scattered** (AD-010): The 3-format detection exists in `siteVisitEngine`, `projectSummaryEngine`, and `pmAlignmentEngine` without a unified migration path.

### Most Important Next Steps

1. Extract `mergedStatuses` computation from `WeeklyReports.jsx` into a hook (completes AD-003)
2. Add tests for `siteVisitEngine`, `cascadeEngine`, `commandEngine` (continues AD-013)
3. Unify `actionEngine` and `commandEngine` (AD-007)

### Biggest Remaining Risk

The 3-format PM visit detection in `siteVisitEngine` vs `projectSummaryEngine` is the most live divergence risk: Dashboard totals and DrawerDetail totals could silently disagree if a new visit format is added and one file isn't updated. This is lower risk than the old expectedPct situation because classification is now unified, but the structural branching remains two implementations.

---

## Part 2 — Engine Health Scores

Scores for engines changed in this pass are marked ↑/↓ with the delta. New engines are marked NEW.

| Engine | Architecture | Responsibility | Testability | Coupling | Maintainability | Overall | Δ |
|--------|-------------|---------------|-------------|---------|----------------|---------|---|
| ganttEngine | 85 | 80 | 95 | 75 | 85 | **84** | — |
| ganttLayout | 90 | 95 | 85 | 85 | 85 | **88** | — |
| progressEngine | 82 | 70 | 80 | 68 | 78 | **76** | ↑+2 |
| evmEngine | 92 | 95 | 92 | 82 | 92 | **91** | ↑+2 |
| riskEngine | 85 | 75 | 82 | 76 | 80 | **80** | ↑+7 |
| spiEngine | 95 | 95 | 95 | 90 | 95 | **94** | — |
| contractorDriftEngine | 90 | 95 | 90 | 85 | 90 | **90** | — |
| pmAlignmentEngine | 85 | 80 | 80 | 80 | 80 | **81** | — |
| portfolioEngine | 83 | 85 | 72 | 78 | 83 | **80** | ↑+23 |
| siteVisitEngine | 82 | 88 | 70 | 78 | 82 | **80** | NEW |
| portfolioRiskEngine | 88 | 95 | 78 | 95 | 88 | **89** | NEW |
| legacyReportEngine | 85 | 90 | 92 | 75 | 85 | **85** | NEW |
| contractorEngine | 80 | 85 | 80 | 75 | 80 | **80** | — |
| openingReadinessEngine | 90 | 95 | 95 | 85 | 90 | **91** | — |
| commandEngine | 95 | 95 | 95 | 90 | 95 | **94** | — |
| escalationEngine | 90 | 90 | 95 | 80 | 90 | **89** | — |
| actionEngine | 70 | 75 | 90 | 75 | 75 | **77** | — |
| projectHealthEngine | 85 | 90 | 90 | 80 | 80 | **85** | — |
| projectSummaryEngine | 72 | 70 | 70 | 65 | 72 | **70** | ↑+1 |
| cascadeEngine | 90 | 90 | 95 | 85 | 90 | **90** | — |
| discrepancyEngine | 92 | 95 | 96 | 95 | 92 | **94** | ↑+1 |
| monteCarloEngine | 86 | 90 | 82 | 80 | 86 | **85** | ↑+7 |
| progressDeltaEngine | 80 | 75 | 80 | 75 | 80 | **78** | — |
| permissionEngine | 95 | 95 | 95 | 90 | 95 | **94** | — |

### Score Explanations

**ganttEngine (84):** Architecture score penalised because `calculateForecastOpening` and `recalculateOnDelay` both re-implement a forward pass variant, adding ~200 lines that could be abstracted. Responsibility is borderline — CPM scheduling plus actuals-based forecasting are related but distinct algorithms. Testability high: pure functions, tested. Coupling penalised because it duplicates date utilities from ganttLayout.

**ganttLayout (88):** Near-perfect separation of geometry from business logic. Minor deduction for duplicated `addDays`/`diffDays` that also exist in ganttEngine. No test coverage is the only significant gap.

**progressEngine (74):** Architecture penalised because `calculateProgressComparison` adds schedule comparison and SPI to what is declared "all progress calculations." Coupling is penalised because it imports from 6 modules. The expected-pct formula duplication is captured in AD-001.

**evmEngine (91, was 89 +2):** AD-002 — now uses `computeCalendarSpi` (no longer re-implements the formula). AD-013 — 45-check test suite added. AD-015 — not_started guard prevents misclassifying future projects. Small but consistent improvement across all dimensions.

**riskEngine (80, was 73 +7):** AD-001 resolved inline expectedPct (now calls `computeExpectedPct`). AD-002 resolved inline calendar SPI (now calls `computeCalendarSpi` + `getSPIStatus`). AD-013 added 48-check test suite. Architecture and Testability both improved significantly. Remaining: the inline SPI block for riskEngine's EVM factor is documented as a correct circular-import trade-off — not a violation.

**spiEngine (94):** Exemplary. Extracted from ganttService for testability, focused, with the stale-Gantt guard showing careful edge-case thinking. Near-perfect.

**portfolioEngine (80, was 57 +23):** AD-004 completed. 5 functions, single domain (portfolio alerts/KPIs/contractor). Testability docked slightly — no dedicated engine test suite for the retained functions (existing `portfolioEngineAlerts.test.mjs` covers `computePortfolioAlerts` only). Coupling drops significantly with the split.

**siteVisitEngine (80, NEW):** Good SRP — focused on one concern. No test coverage (testability docked). 3-format detection still duplicated with projectSummaryEngine — known open item.

**portfolioRiskEngine (89, NEW):** Minimal, self-contained. `computeRiskSummaryStats` is zero-dependency. High responsibility score because it does exactly one thing.

**legacyReportEngine (85, NEW):** Clean adapter layer with dedicated test coverage (30 checks). Coupling is the only concern — still depends on old `workPackages` config rather than the canonical `masterTaskLibrary`.

**commandEngine (94):** The cleanest engine in the codebase. Documented explicitly as "does not recalculate anything." Config-driven thresholds. Clean output schema. Serves as the model for how all engines should be designed.

**projectSummaryEngine (69):** Penalised for duplicating PM visit comparison logic (AD-005). At 203 lines, it does more than "summary" — it recalculates risk score, opening readiness, and PM visit stats. Should delegate more aggressively to the engines that own each of those values.

**monteCarloEngine (85, was 78 +7):** AD-013 added 42-check test suite including a deterministic smoke test via `Math.random` stub (testability improves from 50 to 82). AD-014 fixed pDelayCritical remainder bucket — probability buckets now always sum to exactly 100.

---

## Part 3 — Data Flow Audit

### Expected Data Flow

```
DB (Supabase)
  ↓
Services (projectService, reportService, siteVisitService, ganttService, dashboardService)
  ↓
App.jsx (fetches all data, passes as props)
  ↓
Pages (receive projects, reports, siteVisits as props)
  ↓
Hooks (useAllRows, useRiskRows, useGanttMetrics)
  ↓
Engines (pure functions: progress, risk, EVM, etc.)
  ↓
Components (render results)
```

### Actual Data Flow

The actual flow is generally correct but with two notable deviations:

#### Deviation 1: Pages Call Engines Directly

Several pages call engines directly rather than through hooks:

- `Home.jsx`: calls `computePortfolioAlerts`, `computePortfolioKpis`, `getCommands`, `computeOpeningReadiness` in useMemo blocks
- `WeeklyReports.jsx`: calls `calculateProjectProgress`, `calculateProgressComparison`, `computeProjectRiskScore`, `computeContractorScores`, `computeProjectHealth`, `computeOpeningReadiness` in useMemo blocks
- `RiskDashboard.jsx`: calls `computePmAlignmentItems`, `summarizeAlignmentItems` inside JSX render loop

The principle "Hooks call engines; Pages/Components call Hooks" is partially violated. In practice, useMemo is functionally equivalent to a hook for this purpose, but the pattern is inconsistent. Some pages use `useAllRows`/`useRiskRows` (which internally call engines) and some call engines directly in addition.

**Assessment:** Low-severity for the useMemo cases. Medium-severity for the RiskDashboard JSX render loop calling engine functions directly (line 628-629) — this calls an engine on every render cycle.

#### Deviation 2: reportService Contains a Business Logic Call

`reportService.create` (line 294) calls `calculateProjectProgress(normalized.workPackageStatuses)` as a fallback. This puts engine logic inside a service. The correct pattern would be for the service to always receive the pre-computed `cumulativeProgress` and never compute it internally.

#### Deviation 3: ganttService Contains Progress Computation

`ganttService.refreshPlannedProgress` (lines 355-386) computes `planned_progress` using inline arithmetic equivalent to `spiEngine.computePlannedPct`. A service should call an engine for this calculation, not reimplement it.

### Verified Clean Paths

- No component calls Supabase directly (verified by searching for `supabase` import — only found in `lib/supabase.js` and `services/`)
- No engine imports React (verified)
- `projectService.toDB()` correctly excludes Gantt-owned fields
- `commandEngine` correctly consumes pre-computed inputs without re-computing

### Data Flow Diagram

```
Supabase DB
├── projects table          → projectService.getAll()    → App.jsx → [projects prop]
├── reports table           → reportService.getAll()     → App.jsx → [reports prop]
├── site_visits table       → siteVisitService.getAll()  → App.jsx → [siteVisits prop]
├── project_gantt_tasks     → ganttService               → pages (lazy-loaded)
├── progress_history        → projectService.getAll()    (joined, added to project.progressHistory)
└── site_visit_discrepancies→ dashboardService           → RiskDashboard (lazy-loaded)

App.jsx
└── passes { projects, reports, siteVisits } to all pages

Pages (Dashboard, Home, WeeklyReports, RiskDashboard)
├── useAllRows(projects, reports, siteVisits)
│   ├── computeWPCumulativeStatuses(reports) → reportUtils
│   ├── calculateProjectProgress → progressEngine
│   ├── computeProjectRiskScore → riskEngine
│   ├── buildWeekOverWeekComparison → progressEngine
│   └── computeConfidenceLevel → pmAlignmentEngine
│
├── useRiskRows(projects, reports, siteVisits)
│   ├── useAllRows (base)
│   └── computeRiskRows → {schedDev, trend, contScore, escalations, dims, evolution, actions, health, evm, driftProfile, monteCarlo}
│
├── useGanttMetrics(projects)
│   └── loadAllGanttMetrics → ganttService → supabase
│       └── computeSPIFromTasks, computeCriticalHealth → spiEngine
│
└── [direct useMemo calls to engines — deviation, see above]

Components
└── receive pre-computed values as props (correct pattern)
```

---

## Part 4 — Dependency Audit

### Circular Dependencies

No circular imports were found. The comment in `riskEngine.computeProjectRiskScore` (line 237) explicitly documents that SPI is computed inline to avoid a circular import with `evmEngine` — this is the correct decision.

### Over-Coupled Modules

**`portfolioEngine.js`** imports from 6 modules: `reportUtils`, `progressEngine`, `workPackages`, `dashboardConstants`, `masterTaskLibrary`, `riskEngine` (via RISK_COLORS). Partially justified by its breadth, but the coupling reinforces the SRP violation.

**`projectSummaryEngine.js`** imports from 6 modules and reimplements logic from 2 of them. This is the most over-coupled engine.

**`progressEngine.js`** imports from 6 modules. Some of this coupling is justified (template resolution, weight computation), but importing from `progressDeltaEngine` creates a mild dependency chain.

### Potentially Unused or Dead Code

- `migrations/backfillProgressHistory.js` — migration script, likely run-once. Not imported anywhere. Safe to keep in `/migrations/` but could be archived.
- `help/helpContent.js` — not found to be imported by any page or component in this audit. May be dormant.
- `data/templatesApi.js` — correctly used by WeeklyReports and reportService.

### Candidate Extractions

| Current Location | Extract To | Rationale |
|-----------------|-----------|-----------|
| `riskEngine.computeScheduleDeviation` | `utils/scheduleUtils.js` | The only reusable part of riskEngine |
| `progressEngine.calculateProgressComparison` expectedPct | `utils/scheduleUtils.js` | Same formula; merge with above |
| `ganttService.refreshPlannedProgress` inline math | `spiEngine.computePlannedPct` | Already exists, just call it |
| `portfolioEngine.computeSiteVisitData` format logic | `utils/visitComparisonUtils.js` | Shared with projectSummaryEngine |
| `WeeklyReports` legacy format functions | `utils/reportFormatUtils.js` | Currently in page file |

---

## Part 5 — Product Maturity

Maturity scored 0–10 per layer:

| Layer | Score | Assessment |
|-------|-------|-----------|
| **Project Layer** | 8/10 | CRUD, scope configuration, template versioning, and Gantt generation are solid. Project ownership of `ganttGeneratedAt` / `ganttEngineVersion` / `forecastOpeningDate` is correctly enforced. Minor gaps: no project archiving workflow, `scope.weightOverrides` not validated at create time. |
| **Reporting Layer** | 7/10 | Contractor reports support three format generations with backward compatibility. History tracking via `progress_history` table is well-designed. Gaps: no report editing (only create), no duplicate report prevention, legacy format has no explicit deprecation path. |
| **Verification Layer** | 7/10 | PM site visits, discrepancy calculation, and PM alignment scoring are implemented. Three-format detection in visit comparison adds complexity. No site visit editing capability. Discrepancy thresholds (10/25%) are hardcoded. |
| **Engine Layer** | 8/10 | 21 engines total, most with clean SRP. Config-over-code pattern well-established. Key gaps: formula duplication (AD-001), missing test coverage (AD-013), portfolioEngine SRP (AD-004). |
| **Portfolio Layer** | 7/10 | Dashboard KPIs, alert generation, contractor performance aggregation, and heatmap all function. The `computePortfolioAlerts` now includes SPI alerts (recently added). Missing: portfolio-level trend over time, no saved alert state. |
| **Decision Layer** | 6/10 | `commandEngine` is well-designed. `actionEngine` partially duplicates it. `escalationEngine` catches repeated risks. The two-system problem (AD-007) reduces maturity here. No command persistence or "mark resolved" functionality. |
| **Enterprise Layer** | 5/10 | Role-based access control is implemented but thin (3 roles). No audit log. No approval workflows. No notifications. User management is basic (`AdminUsers.jsx`). No multi-tenancy. |
| **Construction Intelligence Layer** | 6/10 | Monte Carlo, EVM, contractor drift pattern detection, and CPM critical path are sophisticated features. The cascade delay simulator is well-implemented. Gaps: no AI/ML prediction, no learning from historical project outcomes, Monte Carlo inputs are uncalibrated (equal weight to all weeks regardless of project phase). |

**Portfolio Average: 6.9 / 10**

---

## Part 6 — Next Recommended Epics

Ordered by priority, derived strictly from audit findings.

---

### Epic 1: Source of Truth Consolidation (Priority: Critical)

**Addresses:** AD-001, AD-002, AD-008

Extract `computeExpectedPct` to `scheduleUtils.js`. Rename the three SPI computations. Fix `ganttService.refreshPlannedProgress` to call `spiEngine.computePlannedPct`. This is the single highest-risk formula-divergence issue and the smallest effort per impact.

**Estimated effort:** S-M (1-2 days)
**Outcome:** Formula consistency guaranteed; future changes to schedule logic propagate automatically.

---

### Epic 2: WeeklyReports.jsx Refactor (Priority: High)

**Addresses:** AD-003

Extract legacy format adapters to `utils/reportFormatUtils.js`. Extract `mergedStatuses` computation to `hooks/useMergedStatuses.js`. Extract engine orchestration to `hooks/useWeeklyReportEngines.js`. Target: WeeklyReports.jsx drops from ~600 to ~250 lines of pure orchestration.

**Estimated effort:** L (3-5 days)
**Outcome:** Business logic testable; page becomes a layout-only file; legacy code clearly isolated.

---

### Epic 3: PM Visit Comparison Unification (Priority: High)

**Addresses:** AD-005

Extract `computeVisitComparisonStats(visit, gcReport)` shared helper. Refactor `portfolioEngine.computeSiteVisitData` and `projectSummaryEngine.computeProjectSummary` to call it. Test the shared helper.

**Estimated effort:** S (2-4 hours)
**Outcome:** Single implementation of PM visit stats; bug fixes propagate everywhere.

---

### Epic 4: Engine Test Coverage (Priority: High)

**Addresses:** AD-013

Priority targets:
1. `riskEngine` — test each of the 9 scoring factors; test `computeScheduleDeviation`
2. `commandEngine` — test all 5 conditions; test severity assignment
3. `cascadeEngine` — test BFS propagation with a 3-node chain
4. `monteCarloEngine` — smoke test with sigma=0 (deterministic); verify percentile ordering
5. `evmEngine` — test EAC/TCPI formula edge cases

**Estimated effort:** L (3-5 days)
**Outcome:** Regression protection for the entire risk and command layer.

---

### Epic 5: Action/Command Unification (Priority: Medium)

**Addresses:** AD-007

Merge `actionEngine.computeRecommendedActions` into `commandEngine.getCommands` output or create a shared adapter. Ensure RiskDashboard detail cards consume the same data structure as the Home priorities feed.

**Estimated effort:** M (1-2 days)
**Outcome:** Single source of "what the PM should do" — consistent across Risk Dashboard and Home.

---

### Epic 6: portfolioEngine Split (Priority: Medium)

**Addresses:** AD-004

Split `portfolioEngine.js` into 4 focused files: alerts, KPIs, site-visit analytics, contractor portfolio. Maintain re-export barrel.

**Estimated effort:** M (1-2 days)
**Outcome:** Each file has a clear domain; test coverage per file becomes meaningful.

---

### Epic 7: Legacy Report Format Centralisation (Priority: Medium)

**Addresses:** AD-010

Create `src/utils/reportFormatUtils.js`. Move all 3-format detection logic there. Add a `formatVersion` field to the reports table. Document the deprecation plan for format-1. Add a UI warning when a legacy-format report is displayed.

**Estimated effort:** L (3-5 days)
**Outcome:** Format support clearly bounded; migration progress trackable; new contributors understand the system.

---

### Epic 8: Health Weights and Discrepancy Thresholds to Config (Priority: Low)

**Addresses:** AD-006, partial AD-002

Move `projectHealthEngine` weights to `config/healthWeights.js`. Move discrepancy thresholds (10/25%) to `config/riskConfig.js` or new `config/discrepancyConfig.js`.

**Estimated effort:** XS (< 2 hours each)
**Outcome:** Configuration consistency with the rest of the system.

---

### Epic 9: Enterprise Layer — Audit Log and Notifications (Priority: Low)

**Addresses:** Enterprise Layer maturity (5/10)

Add `audit_log` table to Supabase. Log project creates/updates and Gantt regenerations. Add notification system for missing reports (Supabase Edge Function or scheduled job). Add role EDITOR between Admin and Viewer.

**Estimated effort:** XL (1-2 weeks)
**Outcome:** Enterprise readiness; PM can see who made what changes and when.

---

*End of Architecture Audit. For question-specific deep dives, see the companion documents: EngineInventory.md, SourceOfTruth.md, PageResponsibilities.md, ArchitectureDebt.md.*
