# OpenDay — Architecture Map

> Last updated: 2026-07-02 (rev 2 — synced to commits d575a7d through efe41a2)  
> Stack: React 19 · Vite · Supabase (PostgreSQL + Auth)  
> Root: `weekly-tracker/`

---

## 1. Product Overview

**OpenDay** is a Construction Project Operating System for retail fit-out programs.

It transforms raw data — contractor weekly reports, PM site-visit assessments, Gantt schedules, and portfolio signals — into operational decisions. The PM answer to every working day is: *"Which project needs my attention today, why, and what should I do about it?"*

Core workflows:
- **Weekly contractor reports** — progress by work package, schedule status, blockers
- **PM site visits** — independent progress observations, discrepancy detection
- **Gantt scheduling** — CPM-based planned dates, SPI tracking, delay propagation
- **Risk dashboard** — multi-dimensional risk scoring, escalation detection, EVM, Monte Carlo
- **Portfolio view** — cross-project alerts, KPIs, missing reports, contractor reliability

---

## 2. Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  UI / Components                                                │
│  Dumb renderers. No business logic. Receive data via props.     │
├─────────────────────────────────────────────────────────────────┤
│  Pages                                                          │
│  Orchestrators. Compose hooks + engines. Own no calculations.   │
├─────────────────────────────────────────────────────────────────┤
│  Hooks / Selectors                                              │
│  Prepare data for pages. Memoised. Wire engines to React state. │
├─────────────────────────────────────────────────────────────────┤
│  Engines  (src/engines/)                                        │
│  Pure functions. Source of truth for all business calculations. │
├─────────────────────────────────────────────────────────────────┤
│  Core  (src/core/)                                              │
│  Framework-style primitives: insight model, template system.    │
│  Sits above engines, below pages.                               │
├─────────────────────────────────────────────────────────────────┤
│  Domain / Config  (src/domains/ · src/config/)                  │
│  Static definitions: templates, WPs, weights, dependency rules. │
├─────────────────────────────────────────────────────────────────┤
│  Services  (src/services/)                                      │
│  Persistence only. All Supabase calls live here.               │
├─────────────────────────────────────────────────────────────────┤
│  Database / Supabase                                            │
│  PostgreSQL tables + RLS + Auth.                               │
└─────────────────────────────────────────────────────────────────┘
```

### Auth layer (cross-cutting)

`src/auth/` — Supabase Auth wrapper, React context, role–permission map. All `supabase.auth.*` calls live in `authService.js`. No `service_role` key anywhere in the frontend.

---

## 3. Current Data Flow

```
Supabase
  │  (projectService, reportService, siteVisitService)
  ▼
App.jsx  ←  loads projects / reports / siteVisits on mount
  │         holds top-level state, passes as props to every page
  ▼
Pages (Home, Dashboard, WeeklyReports, …)
  │  call hooks/selectors to prepare data
  ▼
Hooks / Selectors (useAllRows, useRiskRows, useGanttMetrics, …)
  │  call engines to compute derived values
  ▼
Engines (riskEngine, progressEngine, portfolioEngine, ganttEngine, …)
  │  return pure computed results
  ▼
Components (dumb renderers receive pre-computed props)
```

Side-effect paths that bypass App.jsx state:
- `ganttService` — Gantt tasks read/written directly by pages that need per-project detail (Dashboard, WeeklyReports, ContractorReport, SiteVisitReport)
- `dashboardService` — discrepancy history and contractor reliability loaded on demand by RiskDashboard

---

## 4. Page Map

### Home (`src/pages/Home.jsx`)
**Question:** What should I focus on today?  
**Data:** `projects`, `reports`, `siteVisits` (from App.jsx props)  
**Engines/hooks:** `useAllRows` → `useGanttMetrics` → `computePortfolioAlerts`, `computePortfolioKpis`, `computeOpeningReadiness`, `getCommands`  
**Core:** `buildHomeInsights`, `summarizeInsights`  
**Output:** Morning brief, prioritised action list, portfolio health KPIs

---

### Dashboard (`src/pages/Dashboard.jsx`)
**Question:** What is the current state of the portfolio?  
**Data:** `projects`, `reports`, `siteVisits`  
**Engines/hooks:** `useAllRows` → `useGanttMetrics` → `computePortfolioAlerts`, `computeContractorPerf`, `computePortfolioKpis` (portfolioEngine); `computeSiteVisitData`, `computeSiteVisitKpis` (siteVisitEngine); `getProgressSnapshot` on drill-down  
**Services called directly:** `regenerateGantt` (Regen Gantt button)  
**Output:** Portfolio summary panel, status matrix, heatmap, progress tab, contractors tab, per-project detail drawer (with SPI, Gantt staleness indicator, Regen button)

---

### Projects (`src/pages/Projects.jsx`)
**Question:** How do I create or edit a project and configure its Gantt?  
**Data:** none from App.jsx (fetches its own via `supabase` directly — known technical debt)  
**Engines/hooks:** none (pure CRUD + Gantt generation)  
**Services called directly:** `generateAndSaveGantt`, `regenerateGantt`  
**Config:** `PHASES`, `TEMPLATES`, `ProjectScopeConfigurator`  
**Output:** Project list, create/edit form, template selection, Gantt generation trigger

---

### WeeklyReports (`src/pages/WeeklyReports.jsx`)
**Question:** What does the full picture look like for a single project this week?  
**Data:** `projects`, `reports`, `siteVisits`  
**Engines:** `progressEngine`, `progressDeltaEngine`, `riskEngine`, `contractorEngine`, `projectHealthEngine`, `openingReadinessEngine`, `portfolioEngine` (missing report), `siteVisitEngine` (site visit comparison), `legacyReportEngine` (old-format compat)  
**Services called directly:** `getProjectGantt`  
**Core:** `getScopeWPIds`, `isTemplateValid`, `explainFromSnapshot`, `explainLive`  
**Output:** Full weekly report view — KPI strip, phase stepper, Gantt chart, progress chart, site visit comparison, risk summary, contractor alignment

---

### ContractorReport (`src/pages/ContractorReport.jsx`)
**Question:** (Contractor) What progress did I make this week?  
**Data:** loaded via `useParams` → fetches own project + reports  
**Engines:** `progressEngine` (progress result after submission)  
**Services called directly:** `getProjectGantt`, `submitContractorReport` (contractorReportService)  
**Config:** `WORK_PACKAGES` (legacy format), `workPackages`  
**Output:** Contractor-facing weekly report form, WP status grid, submit flow

---

### SiteVisitReport (`src/pages/SiteVisitReport.jsx`)
**Question:** (PM) What did I observe on site today?  
**Data:** loaded via `useParams` → fetches own project + last contractor report  
**Services called directly:** `getProjectGantt`, `submitSiteVisit`, `getLastContractorReport`  
**Config:** `WORK_PACKAGES`, `workPackages`  
**Output:** PM site visit form, per-WP observed progress, discrepancy auto-detected on submit

---

### RiskDashboard (`src/pages/RiskDashboard.jsx`)
**Question:** Which projects are at risk and why?  
**Data:** `projects`, `reports`, `siteVisits`  
**Engines/hooks:** `useRiskRows` (= `useAllRows` + risk augmentation), `useGanttMetrics`, `computePortfolioContractorScores`, `computePmAlignmentItems`, `computeRiskSummaryStats` (portfolioRiskEngine)  
**Services called directly:** `getProjectTrend` (ganttService), `getDiscrepancyHistory`, `getContractorReliability` (dashboardService)  
**Components:** `EvmWidget`, `MonteCarloWidget`, `DriftChart`, `RiskGauge`, `RiskTable`  
**Output:** Risk table, EVM widget, Monte Carlo forecast, contractor drift chart, discrepancy history

---

### WeightAudit (`src/pages/WeightAudit.jsx`)
**Question:** How are phase weights distributed and do they match the active template?  
**Data:** none from App.jsx  
**Core:** `computeEffectiveWeights`, `validateTemplate`, `getScopeWPIds`  
**Data API:** `fetchActiveTemplate`, `fetchTemplateById`  
**Output:** Weight breakdown table per phase, validation warnings, scope comparison

---

### TemplateEditor (`src/pages/TemplateEditor.jsx`)
**Question:** How do I define or modify the construction template (phases, WP durations, weights)?  
**Data:** none from App.jsx  
**Core:** `setPhaseWeight`, `setWorkPackageDuration`, `movePhase`, `normalizeWeights` (templateEditor.js), `validateTemplate`  
**Data API:** `fetchActiveTemplate`, `saveTemplate`  
**Output:** Visual template editor, drag-reorder phases, weight sliders, validation feedback

---

### AdminUsers (`src/pages/AdminUsers.jsx`)
**Question:** Which users exist and what roles do they have?  
**Data:** fetches directly via `supabase`  
**Output:** User list management (PM / Contractor roles)

---

## 5. Engine Map

All engines in `src/engines/` are **pure functions** — no React imports, no Supabase calls, testable in plain Node.js.

### `ganttEngine.js`
**Responsibility:** CPM Gantt scheduling — builds WP objects with phase-normalized durations, runs forward/backward pass, detects critical path, checks feasibility, forecasts opening date, propagates delays.  
**Inputs:** templateId, project dates, store size, WORK_PACKAGES, PHASES, DEPENDENCY_RULES  
**Outputs:** `buildProjectWPs`, `calculateGantt`, `checkFeasibility`, `calculateKeyDates`, `calculateForecastOpening`, `recalculateOnDelay`, `GANTT_ENGINE_VERSION`, `isGanttStale`  
**Consumers:** `ganttService` (generate/regenerate), `ganttEngine.test.js`

### `spiEngine.js`
**Responsibility:** Pure SPI / schedule-performance calculations, extracted from ganttService so they are testable without Supabase.  
**Inputs:** task rows (with `planned_start`, `planned_end`, `actual_progress`, `is_critical`, `is_archived`); also (actualPct, expectedPct) for calendar SPI  
**Outputs:** `computeCalendarSpi` (project-level time-based SPI = actualPct/expectedPct), `computePlannedPct`, `computeSPIFromTasks` (Gantt task-level), `computeCriticalHealth`  
**Consumers:** `ganttService`, `progressEngine`, `riskEngine`, `evmEngine`, `spiEngine.test.mjs`  
**Note (AD-002):** Two distinct SPI concepts: `computeCalendarSpi` (report/time-based, single source of truth) vs `computeSPIFromTasks` (Gantt task row average). The canonical schedule-status converter is `getSPIStatus(spi)` in `config/statusColors.js`.

### `ganttLayout.js`
**Responsibility:** Converts a ganttResult (dates + durations) into SVG pixel positions for the Gantt chart renderer.  
**Inputs:** ganttResult array, viewport dimensions  
**Outputs:** `calculateLayout`, `generateArrowPath`  
**Consumers:** `GanttChart.jsx`

### `riskEngine.js`
**Responsibility:** Multi-dimensional project risk scoring. Computes schedule deviation, trend, contractor factor, PM alignment factor, EVM SPI factor. Combines into a single risk score and level.  
**Inputs:** project, sortedReports, progress, projSiteVisits  
**Outputs:** `computeProjectRiskScore`, `getRiskLevel`, `computeScheduleDeviation`, `computeTrend`, `computeDimensionRisk`, `computeWeeklyEvolution`; re-exports `RISK_COLORS`, `RISK_DIMENSIONS`, `RISK_TO_DIMS`, `DIM_LEVEL_ORDER`  
**Consumers:** `useAllRows`, `useRiskRows`, `WeeklyReports`, `progressEngine`, `evmEngine`, `projectSummaryEngine`, `riskEngine.test.mjs`

### `progressEngine.js`
**Responsibility:** Single source of truth for all progress calculations. Three-level API: activity → phase → project. Handles scope filtering, phase weight overrides, week-over-week comparison.  
**Inputs:** wpStatuses, scopeWPIds, phaseWeightOverrides, sortedReports, template  
**Outputs:** `calculateActivityProgress`, `calculatePhaseProgress`, `calculateProjectProgress`, `progressAtIndex`, `calculateProjectProgressResult`, `calculateProgressComparison`, `buildWeekOverWeekComparison`, `computeProgressSeries`  
**Consumers:** `useAllRows`, `contractorEngine`, `riskEngine`, `portfolioEngine`, `WeeklyReports`, `ContractorReport`, `progressEngine.test.mjs`

### `portfolioEngine.js`
**Responsibility:** Portfolio-level alert and KPI aggregation over pre-computed project rows. (AD-004: split; site-visit and risk-summary functions moved to dedicated engines.)  
**Inputs:** rows (from useAllRows/useRiskRows), projects, reports  
**Outputs:** `computePortfolioAlerts`, `computeContractorPerf`, `computePortfolioKpis`, `computePortfolioMissing`, `computePortfolioCommands`  
**Consumers:** `Home`, `Dashboard`, `WeeklyReports`, `portfolioEngineAlerts.test.mjs`

### `siteVisitEngine.js`
**Responsibility:** PM site-visit data aggregation — per-visit PM vs GC comparison across all three historical report formats (Gantt WP, legacy WP status, flat fields). (AD-004: extracted from portfolioEngine.)  
**Inputs:** siteVisits, projects, reports  
**Outputs:** `computeSiteVisitData`, `computeSiteVisitKpis`  
**Consumers:** `Dashboard`, `WeeklyReports`

### `portfolioRiskEngine.js`
**Responsibility:** Risk-level breakdown and health statistics for the Risk Dashboard header. (AD-004: extracted from portfolioEngine.)  
**Inputs:** allRows (RiskDashboard rows with riskScore, health, project)  
**Outputs:** `computeRiskSummaryStats`  
**Consumers:** `RiskDashboard`

### `contractorEngine.js`
**Responsibility:** Contractor scoring — reliability, pace, alignment — per project and aggregated across portfolio.  
**Inputs:** project, projReports, projSiteVisits  
**Outputs:** `computeContractorScores`, `computePortfolioContractorScores`  
**Consumers:** `WeeklyReports`, `RiskDashboard`, `riskEngine`, `contractorEngine.test.mjs`

### `contractorDriftEngine.js`
**Responsibility:** Detects systematic over- or under-reporting patterns by a contractor over time.  
**Inputs:** sortedReports, siteVisits  
**Outputs:** `computeDriftTimeline`, `computeDriftPattern`, `computeContractorDriftProfile`  
**Consumers:** `DriftChart` (analytics component), `contractorDriftEngine.test.mjs`

### `pmAlignmentEngine.js`
**Responsibility:** Computes PM vs GC alignment items from a paired report + site visit. Derives a confidence level for the overall project.  
**Inputs:** gcReport (contractor report), pmVisit (site visit), projReports, projSiteVisits  
**Outputs:** `computePmAlignmentItems`, `summarizeAlignmentItems`, `computeConfidenceLevel`  
**Consumers:** `riskEngine`, `contractorEngine`, `escalationEngine`, `useAllRows`, `RiskDashboard`, `pmAlignmentEngine.test.mjs`

### `discrepancyEngine.js`
**Responsibility:** PM vs GC progress discrepancy calculation and classification. Single source of truth for what "match", "pm-higher", and "discrepancy" mean — used by all engines that compare PM observations to contractor reports. (AD-005: `discrepancySeverity` and `classifyDiscrepancy` extracted here; previously duplicated inline in portfolioEngine and projectSummaryEngine.)  
**Inputs:** contractorReportWPs, siteVisitWPs; or `{ pmRank, gcRank, delta }` for classification  
**Outputs:** `discrepancySeverity`, `classifyDiscrepancy`, `calculateDiscrepancy`, `getLatestDiscrepancies`, `mergeDiscrepanciesIntoGantt`  
**Consumers:** `ganttService`, `siteVisitEngine`, `projectSummaryEngine`, `SiteVisitReport`, `discrepancyClassify.test.mjs`

### `legacyReportEngine.js`
**Responsibility:** Adapters for converting old-format contractor reports (pre-WP-status schema) into the current work-package status format. (AD-003: extracted from WeeklyReports.jsx.)  
**Inputs:** old-format report objects  
**Outputs:** `OLD_TO_WP_WEEKLY` (mapping const), `mapOldToWPStatus`, `deriveWPStatusesFromOldReport`, `mergeOldDerivedStatuses`  
**Consumers:** `WeeklyReports`, `legacyReportEngine.test.mjs`

### `evmEngine.js`
**Responsibility:** Earned Value Management with BAC normalised to 100 (progress % as the unit — no monetary budget). Uses `computeCalendarSpi` from spiEngine as the single formula for calendar SPI. (AD-015: not_started guard prevents future projects with PV=0 EV=0 from showing as critical.)  
**Inputs:** project, sortedReports, progress  
**Outputs:** `computeEVM` → `{ BAC, EV, PV, SPI, EAC, EACdays, TCPI, spiStatus, tcpiStatus, tcpiWarning, spiHistory }`  
**Consumers:** `useRiskRows` (via computeRiskRows), `EvmWidget`, `evmEngine.test.mjs`

### `monteCarloEngine.js`
**Responsibility:** Probabilistic opening-date forecast using Monte Carlo simulation with Box-Muller normal variates.  
**Inputs:** project, sortedReports, ganttTasks  
**Outputs:** `computeMonteCarloForecast` → percentile distribution of forecast opening dates  
**Consumers:** `MonteCarloWidget`, `monteCarloEngine.test.mjs`

### `cascadeEngine.js`
**Responsibility:** Propagates WP delays through the dependency graph without duplicating the topological sort from ganttEngine. Works on already-fetched DB tasks.  
**Inputs:** ganttTasks, delayedWpId, delayDays, dependencyRules  
**Outputs:** `computeCascadeImpact`, `detectCurrentDelays`  
**Consumers:** analytics components, cascade scenarios in WeeklyReports

### `escalationEngine.js`
**Responsibility:** Detects escalation events from a sequence of reports + site visits (missed visits, persistent risk, stalling trend).  
**Inputs:** sortedReports, projSiteVisits  
**Outputs:** `computeEscalations`  
**Consumers:** `projectSummaryEngine`, risk detail views

### `actionEngine.js`
**Responsibility:** Derives recommended PM actions from risk score, contractor score, schedule deviation, and report data.  
**Inputs:** riskScore, contScore, schedDev, latestReport, projSiteVisits, project  
**Outputs:** `computeRecommendedActions` → action list  
**Consumers:** `projectSummaryEngine`, `commandEngine`

### `commandEngine.js`
**Responsibility:** "What to do" decisioning. Consumes pre-computed outputs — never recalculates. Turns project state into a prioritised command list.  
**Inputs:** projectState (riskScore, progressComparison, openingReadiness, latestReport, missingReport)  
**Outputs:** `getCommands` → command array  
**Consumers:** `Home` (via `useAllRows`), `core/insights/adapters/commandInsights`

### `openingReadinessEngine.js`
**Responsibility:** Scores opening readiness based on completion of opening-blocker WPs and days until target opening.  
**Inputs:** wpCumulativeStatuses, targetOpeningDate  
**Outputs:** `computeOpeningReadiness` → readiness score, blockers list  
**Consumers:** `Home`, `WeeklyReports`, `commandEngine`

### `projectHealthEngine.js`
**Responsibility:** Computes a single project health score from risk, progress, contractor score, and report presence.  
**Inputs:** riskScore, progress, contScore, latestReport  
**Outputs:** `computeProjectHealth` → health level (green / amber / red)  
**Consumers:** `WeeklyReports`, `projectSummaryEngine`

### `projectSummaryEngine.js`
**Responsibility:** Assembles a full project summary object combining progress, risk, schedule, site visits, and Gantt data.  
**Inputs:** project, projReports, projSiteVisits, progress, wpCumulativeStatuses  
**Outputs:** `computeProjectSummary` → comprehensive project object  
**Consumers:** `WeeklyReports` (summary panel), PDF/export flows

### `progressDeltaEngine.js`
**Responsibility:** Calculates WP deltas between consecutive reports, computes phase change flags, classifies phases by activity.  
**Inputs:** currentStatuses, prevStatuses, workPackages, scopePhaseIds, phaseWeights  
**Outputs:** `calculateWorkPackageDeltas`, `computePhaseChangeFlags`, `classifyPhases`, `calculateProgressDelta`  
**Consumers:** `WeeklyReports`

### `permissionEngine.js`
**Responsibility:** RBAC — maps roles to allowed resources and default routes. Single authoritative check point; never hardcoded in components.  
**Inputs:** role, resource  
**Outputs:** `canAccess`, `getDefaultRoute`, `getAllowedNavItems`  
**Consumers:** `ProtectedRoute`, `App.jsx`, `Layout`, `Sidebar`

---

## 6. Core Map

`src/core/` holds **framework-style primitives** that sit above individual engines but below pages. Unlike engines (which calculate things), core defines the **data model** for cross-cutting concerns and the **transformation pipeline** from engine output to display.

### `core/insights/`

Defines the **Insight object model** and the pipeline that turns raw engine outputs into a normalised, prioritised list for the Home page.

```
Engine output
  → adapter (portfolioAlerts / commandInsights / confidenceInsights)
  → [Insight]
  → confidenceModifier (adjusts severity by data confidence)
  → mergeInsights (deduplicates, sorts by severity)
  → homeInsights selector (composes all sources into MorningBrief / PrioritiesToday shape)
```

| File | Role |
|------|------|
| `insight.js` | Insight type definition + `sortInsights` |
| `merge.js` | `mergeInsights` — deduplication + priority sort |
| `adapters/portfolioAlerts.js` | `alertsToInsights` — converts portfolio alerts → Insights |
| `adapters/commandInsights.js` | `commandsToInsights` — converts commands → Insights |
| `adapters/confidenceInsights.js` | `confidenceToInsights` — low-confidence signal → Insight |
| `adapters/confidenceModifier.js` | `applyConfidence` — downgrades severity when data is thin |
| `selectors/homeInsights.js` | `buildHomeInsights`, `summarizeInsights` — final composition |

**Why this is not an engine:** It defines a data model and transformation pipeline, not a business calculation. Engines are stateless formula; core/insights is a type system and composition layer.

### `core/projects/`

Manages the **construction template** lifecycle: definition, editing, validation, weight computation, and scope resolution.

| File | Role |
|------|------|
| `weights/computeEffectiveWeights.js` | Merges scope WP IDs with weight overrides to produce effective phase weights |
| `validation/validateTemplate.js` | `validateTemplate`, `isTemplateValid` — structural and constraint checks |
| `scope/getScopeWPIds.js` | `getScopeWPIds` — resolves which WP IDs are in scope for a project |
| `templateEditor.js` | `setPhaseWeight`, `setWorkPackageDuration`, `movePhase`, `normalizeWeights` — pure template mutations |
| `explain/explainProgress.js` | `explainProgress` — human-readable progress narrative |
| `explain/explainAdapters.js` | `explainFromSnapshot`, `explainLive`, `taskProgressFromStatuses` — context adapters |
| `index.js` | Public barrel re-exporting everything above |

**Why this is not engines:** Template editing, validation, and weight computation are **structural operations on a data schema**, not runtime business calculations. They also have their own test suite co-located in `__tests__/` and `*.test.mjs` siblings.

---

## 7. Architecture Rules

These rules are active and must be respected in all future changes:

| Rule | Rationale |
|------|-----------|
| **UI must not contain business calculations** | Components stay dumb; swap rendering without touching logic |
| **Engines are the source of truth for calculations** | All formula live in `src/engines/`; engines are pure and testable in Node.js |
| **Pages should orchestrate, not calculate** | Pages compose hooks + engines; they do not re-implement engine logic |
| **Hooks/selectors should prepare data for pages** | Memoised derivation layer; wire engines to React state |
| **Services should only handle persistence/API** | All Supabase calls live in `src/services/`; no direct `supabase.*` in pages or components |
| **New business logic must not be placed directly inside components** | Extract to engines first, then consume from the component |
| **Prefer extending existing engines over creating new ones** | 24 engines now exist; check before adding a 25th |
| **Add tests for every new calculation** | Engines are pure functions — they are straightforward to test in Node.js without a browser |
| **No service_role key anywhere in the frontend** | All auth goes through `authService.js` using the public anon key |
| **All supabase calls go through services** | `authService.js` for auth; service files for data |

---

## 8. Test Protection

```
npm test
```

Runs `node src/tests/runAll.mjs`, which is the **aggregate discovery runner**:

1. Spawns `src/tests/runTests.js` — 18 in-process checks covering ganttEngine (tests 1–9), discrepancyEngine (2), phase weights (4), and progressWeights (2)
2. Discovers every `*.test.mjs` recursively under `src/` and spawns each as a child process

Current test suites (auto-discovered): **30 suites · 890 checks**

| Suite | Checks | Added |
|-------|--------|-------|
| `tests/runTests.js` | 18 | original |
| `tests/spiEngine.test.mjs` | 39 | original + AD-002 |
| `tests/portfolioEngineAlerts.test.mjs` | 21 | original |
| `tests/riskEngine.test.mjs` | 29 | original |
| `tests/evmEngine.test.mjs` | 33 | original |
| `tests/monteCarloEngine.test.mjs` | 34 | original |
| `tests/contractorEngine.test.mjs` | 41 | original |
| `tests/contractorDriftEngine.test.mjs` | 44 | original |
| `tests/pmAlignmentEngine.test.mjs` | 79 | original |
| `tests/progressEngine.test.mjs` | 26 | original |
| `tests/mergeGanttWPStatuses.test.mjs` | 14 | original |
| `tests/authService.test.mjs` | 21 | original |
| `engines/riskEngine.test.mjs` | 48 | AD-013 |
| `engines/evmEngine.test.mjs` | 45 | AD-013 |
| `engines/monteCarloEngine.test.mjs` | 42 | AD-013 |
| `engines/__tests__/discrepancyClassify.test.mjs` | 29 | AD-005 |
| `engines/__tests__/legacyReportEngine.test.mjs` | 30 | AD-003 |
| `engines/__tests__/scheduleUtils.test.mjs` | 16 | AD-001 |
| `hooks/useRiskRows.test.mjs` | 45 | original |
| `core/insights/__tests__/*.test.mjs` (5 files) | 148 | original |
| `core/projects/**/*.test.mjs` (4 files) | 61 | original |

All suites must pass before any PR lands.

---

## 9. Architecture Risks / Next Cleanup Candidates

These are known accumulation points, not blockers. Document them here so the next cleanup pass has a starting point.

### App.jsx is growing too large
`App.jsx` currently owns: routing, auth gating, all top-level data loading (`projects`, `reports`, `siteVisits`), error boundary, and the `CONSTRUCTION_TEMPLATE` constant. As features grow, it becomes the implicit central bus. Future direction: extract data loading into a dedicated `useAppData` hook; split route definitions into a separate file.

### Projects.jsx calls supabase directly
`Projects.jsx` bypasses `projectService` and calls `supabase` directly for some operations. This violates the services rule and should be migrated to `projectService` methods.

### Large pages with embedded orchestration
The following pages are candidates for gradual slimming by extracting orchestration logic into dedicated hooks or selectors:

- **RiskDashboard** — loads its own data via dashboardService on the page level; could move to a `useRiskDashboard` hook
- **WeeklyReports** — largest page; calls ~10 engines directly; extractable into a `useWeeklyReportData` hook
- **ContractorReport** — fetches its own project and Gantt; extractable into a `useContractorReportData` hook
- **SiteVisitReport** — same pattern as ContractorReport
- **Projects** — direct supabase calls; should route through projectService

### workPackages.js is a legacy format
`src/config/workPackages.js` is the legacy WP format used by ContractorReport, SiteVisitReport, and PhaseStepper. `src/config/masterTaskLibrary.js` is the Gantt-format successor. When ContractorReport and SiteVisitReport are migrated to the Gantt format, `workPackages.js` can be deleted. Tracked in the file's own comment.

### README still references CF Tracker
`README.md` at the repo root references the old project name. Should be updated to OpenDay when there is a stable product description.

### data/templatesApi.js is a thin layer
`src/data/templatesApi.js` wraps Supabase template CRUD. It lives outside `services/` in its own `data/` directory — a minor inconsistency. Future tidy: move into `services/templateService.js`.
