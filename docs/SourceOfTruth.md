# Source of Truth Audit

> Tracks every calculated value in the system and identifies which engine owns it, and where secondary occurrences risk divergence.
> Last synced: commits d575a7d through efe41a2.

---

## Summary Table

| Value | Primary Owner | Secondary Occurrences | Violation? | Recommendation |
|-------|--------------|----------------------|------------|---------------|
| Overall Progress % | `progressEngine.calculateProjectProgress` | `reportService.create` (line 294 — single-report fallback) | Partial — fallback uses single report rather than cumulative | Accept fallback as a degraded path; document it clearly |
| Work Package Progress % | `progressEngine.calculatePhaseProgress` | `progressDeltaEngine.phasePct` (mirrors PhaseStepper logic) | VIOLATION — phasePct reimplements WP-level aggregation | Extract shared `wpPct(taskMap, weights)` utility |
| Expected Progress % (linear time) | `scheduleUtils.computeExpectedPct` (AD-001 — commit d575a7d) | `ganttService.getProjectTrend` uses `spiEngine.computePlannedPct` (per-WP, not per-project — different computation, not a violation) | **RESOLVED** | `computeExpectedPct` extracted to `src/utils/scheduleUtils.js`; `progressEngine`, `riskEngine`, `evmEngine` all import and call it. 16 tests in `engines/__tests__/scheduleUtils.test.mjs`. |
| SPI (Schedule Performance Index) — calendar/time-based | `spiEngine.computeCalendarSpi` (AD-002 — commit fe0d3f8) | `riskEngine.computeProjectRiskScore` uses it inline via `computeCalendarSpi` + `getSPIStatus` | **RESOLVED** | `computeCalendarSpi(actualPct, expectedPct)` is the single formula. Three SPIs are now clearly named: `computeCalendarSpi` (time-based, report-level), `computeSPIFromTasks` (Gantt task rows), and the inline riskEngine SPI (documented circular-import trade-off). |
| CPI (Cost Performance Index) | Not computed — `projects.budget`/`actual_cost` exist as of migration 037 (Retail Historical Project Profile v1) but no engine derives CPI from them yet | — | N/A | Future work: a small engine function (`cpi = budget / actual_cost` where both are non-null) — never stored, computed on read like every other value in this table |
| Risk Score | `riskEngine.computeProjectRiskScore` | None — single owner | No | — |
| Portfolio Health | `projectHealthEngine.computeProjectHealth` | Health weights hardcoded in file | Structural concern | Externalise health weights to config |
| Opening Readiness | `openingReadinessEngine.computeOpeningReadiness` | None | No | — |
| Contractor Drift | `contractorDriftEngine.computeDriftTimeline` / `computeDriftPattern` | None | No | — |
| PM Alignment Score | `contractorEngine.computeContractorScores` (pmAlignmentPts) | `computePortfolioContractorScores` aggregates it | No | — |
| Action Priority / Escalation Level | `actionEngine.computeRecommendedActions` AND `commandEngine.getCommands` | Both produce prioritised action lists | VIOLATION — two parallel action generation systems | Merge into one; commandEngine is more structured |
| Confidence Score | `pmAlignmentEngine.computeConfidenceLevel` | None — single owner | No | — |
| Monte Carlo Probability | `monteCarloEngine.computeMonteCarloForecast` | None | No | — |
| Planned Progress % (per WP) | `spiEngine.computePlannedPct` | `ganttService.refreshPlannedProgress` (lines 365-378 — inline equivalent) | **OPEN** (AD-008) | Replace inline block with `computePlannedPct` call |
| Forecast Opening Date | `ganttEngine.calculateForecastOpening` | `cascadeEngine.computeCascadeImpact` (lines 122-128 — adds delay to lastTask.earlyFinish) | Partial — cascade version is a simplified approximation | Document difference: ganttEngine version is velocity-based; cascade version is arithmetic offset |
| Construction Completion Date | `ganttEngine.calculateKeyDates` | None — single owner | No | — |
| Discrepancy classification (match/pm-higher/discrepancy) | `discrepancyEngine.classifyDiscrepancy` + `discrepancySeverity` (AD-005 — commit a99f207) | `siteVisitEngine.computeSiteVisitData` and `projectSummaryEngine.computeProjectSummary` — both now call `classifyDiscrepancy`. `pmAlignmentEngine` uses a different granularity (score diff, not numeric delta — intentional different concern). | **PARTIAL** | Classification is unified. Numeric delta calculation (`calculateDiscrepancy`) remains the canonical numeric owner. The 3-format structural branching (Gantt WP / legacy WP / flat) is still separately implemented in siteVisitEngine and projectSummaryEngine — a shared `computeVisitItems(visit, gcReport)` helper could eliminate this. |
| Contractor Reliability Score | `dashboardService.getContractorReliability` (DB-driven: critical/total) | `contractorDriftEngine.computeContractorDriftProfile` (timeline-based reliabilityScore = 100 - abs(drift)*200) | VIOLATION — two different reliability formulas | Document and name them distinctly: "DB reliability" (dashboardService) vs "drift reliability" (contractorDriftEngine) |

---

## Detailed Analysis

### Overall Progress %

**Owner:** `progressEngine.calculateProjectProgress`

This is the correct canonical owner. Called from `useAllRows` (line 35) for dashboard consumption, and from `WeeklyReports` (line 196) for single-project view. Both call the same engine function with scope-aware weights.

**Secondary occurrence:** `reportService.create` at line 293-294 calculates `calculateProjectProgress(normalized.workPackageStatuses)` — this uses only the *current* report's statuses, not cumulative. This is intentional (it's a fallback when `cumulativeProgress` is not passed by the caller), but it is semantically different from the canonical definition. The comment at line 292 partially explains this.

**Risk:** Low. The reportService fallback is used only when the caller omits `cumulativeProgress`, which the WeeklyReports and ContractorReport pages do provide.

---

### Expected Progress % (the biggest violation)

**Formula:** `Math.min(100, Math.round((elapsedDays / totalDays) * 100))`

where `elapsedDays = max(0, ceil((referenceDate - start) / DAY_MS))` and `totalDays = ceil((end - start) / DAY_MS)`.

**Locations:**
1. `progressEngine.calculateProgressComparison` — lines 277-280 (uses `constructionEndDate` or `targetOpeningDate` as `end`)
2. `riskEngine.computeScheduleDeviation` — lines 66-68 (same formula, uses `constructionEndDate` then `targetOpeningDate`)
3. `riskEngine.computeProjectRiskScore` — lines 185-190 (inline, slight variation: uses `Math.round((Math.min(end-start, Math.max(0, now-start)) / (end-start)) * 100)`)
4. `ganttService.getProjectTrend` — lines 491-494 (uses `computePlannedPct` from spiEngine, which is per-WP not per-project)
5. `riskEngine.computeNoReportsRisk` — lines 122-125 (same formula)

**Verdict: VIOLATION.** The formula appears in 4–5 places. Variation #3 uses a slightly different Math.min/Math.max structure that avoids elapsedDays going negative differently. This could produce a 1-unit rounding difference in edge cases. **Recommended fix:** Extract to `src/utils/scheduleUtils.js`:

```js
export function computeExpectedPct(project, referenceDate = new Date()) {
  const start = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const end   = project.constructionEndDate
    ? new Date(project.constructionEndDate)
    : project.targetOpeningDate ? new Date(project.targetOpeningDate) : null;
  if (!start || !end || end <= start) return null;
  const totalDays   = Math.ceil((end - start) / DAY_MS);
  const elapsedDays = Math.max(0, Math.ceil((referenceDate - start) / DAY_MS));
  return Math.min(100, Math.round((elapsedDays / totalDays) * 100));
}
```

---

### Three SPIs — Naming Ambiguity

The system has three distinct SPI computations that answer different questions:

| Name | File | Formula | Inputs | Answers |
|------|------|---------|--------|---------|
| Report SPI | `evmEngine.computeEVM` | `progress / expectedPct` | Report-level overall progress | How far behind/ahead is this project based on its reporting cadence? |
| Gantt SPI | `spiEngine.computeSPIFromTasks` | `avg(actual_progress) / avg(planned_progress across tasks)` | Gantt DB task rows | How well are individual Gantt tasks tracking vs planned start/end windows? |
| Risk SPI | `riskEngine.computeProjectRiskScore` (inline) | `progress / pv` | Same as report SPI | Used only to add an EVM risk factor to risk score; no separate export |

These are not violations per se — they serve genuinely different purposes — but the identical names create confusion. The inline risk SPI at lines 248-254 is explicitly commented "Computed inline to avoid circular import with evmEngine." This is a correct trade-off.

---

### Discrepancy — Four Implementations

This is the most significant Source-of-Truth violation in terms of complexity and maintenance risk.

| Implementation | File | Input Format | Comparison Basis | Output |
|---------------|------|-------------|-----------------|--------|
| `calculateDiscrepancy` | `discrepancyEngine.js` | `{wpId, progress}` arrays | Numeric progress delta | `{ delta, status: ok/warning/critical }` |
| `computePmAlignmentItems` | `pmAlignmentEngine.js` | GC report + PM visit objects | Status-score diff (0-1 scale) | `{ diff, overstate, mismatchType, severity }` |
| `computeSiteVisitData` | `portfolioEngine.js` | visit.wps / pmWorkPackageStatuses / flat fields | Status rank OR numeric delta | `{ matches, discrepancies, pmAhead, matchRate }` |
| PM visit section | `projectSummaryEngine.js` | Same 3-format detection | Status rank OR numeric delta | Same stats shape as above |

`portfolioEngine.computeSiteVisitData` and `projectSummaryEngine` lines 102-158 are nearly identical in their 3-format detection and counting logic — this is the clearest duplication. Both could delegate to a shared helper.

---

### Action Priority — Two Systems

| System | File | Consumers | Output Shape |
|--------|------|-----------|-------------|
| `computeRecommendedActions` | `actionEngine.js` | `computeRiskRows`, `RiskDashboard` | `{ priority: 'HIGH'/'MEDIUM', action, reason }[]` (max 3) |
| `getCommands` | `commandEngine.js` | `Home`, `core/insights` | `{ id, severity: 'critical'/'warning'/'info', title, reason, action, projectCode }[]` |

Both engines look at: behind-schedule status, high/critical risk, opening at risk, missing report, additional works. The overlapping conditions produce similar (but not identical) outputs. `commandEngine` is more structured and config-driven; `actionEngine` is more narrative. The system should converge on one canonical "what to do" format and feed both consumers from it.

---

### Planned Progress % Duplication

`ganttService.refreshPlannedProgress` (lines 365-378) reimplements the `planned_progress` computation inline:

```js
pct = Math.min(100, (today - start) / (end - start) * 100);
```

This is functionally identical to `spiEngine.computePlannedPct`. The function should call `computePlannedPct` instead.

---

## Retail Historical Project Profile v1 — Canonical Field Ownership

> Added by migration 037 (schema) and 038 (import commit layer). These are stored facts, not calculated values — listed here (rather than the Summary Table above) to document canonical ownership and the one deliberate near-duplicate this profile introduces. Capture Once, Use Everywhere: every field below is written by BOTH live project creation/editing (`ProjectEditorModal.jsx` → `projectService.toDB()`) and historical import (`core/import/` → `commit_project_import_batch` RPC) — there is no separate historical-only schema.

| Field | Canonical column | Meaning | Notes |
|-------|------------------|---------|-------|
| Location Type | `projects.location_type` | `Mall` or `Street` (v1 application vocabulary only) | **No DB CHECK constraint** — deliberately TEXT NULL so a future evidence-backed value (e.g. Airport) can be added by editing `LOCATION_TYPE_VALUES` in `projectImportFieldMap.js`, never a migration. An unrecognized value is a warning, not a block. |
| Shopping Mall | `projects.shopping_mall_name` | Mall name, required when `location_type = 'Mall'` | Must never hold a street address or a generic "project name" — a spreadsheet column literally named "Project Name" is deliberately NOT a recognized alias (Phase 1 field-mapping debt fix, see `projectImportFieldMap.js`). |
| Street | `projects.street` | Street address, required when `location_type = 'Street'` | Pre-existing column (predates this profile); must be null whenever `location_type = 'Mall'`. |
| Project Type | `projects.project_type` | What kind of work/project is being performed (New Opening, Rebuilding, ...) | Free text, zero DB constraint. Unrecognized values warn, never block — see `PROJECT_TYPE_VALUES`. |
| Store Concept | `projects.store_concept` | Retail format/concept (Flagship, Standard, ...) | Free text, no DB enum, no hard-coded brand values. `STORE_CONCEPT_SUGGESTIONS` is a UI-suggestion list only, never validated against. |
| Total Area | `projects.store_size_sqm` | Total store area (sqm) | Pre-existing column. First live UI input added by Project Information Architecture v1 (`ProjectEditorModal.jsx`'s Areas section) — until then, historical import was its only real writer for most projects. Feeds `ganttEngine`'s size-modifier calculation; also displayed in `ProjectDetailModal.jsx`. |
| Sales Area | `projects.sales_area_sqm` | Sales floor area (sqm) | **Not the same field as `scope.zoneAreas.sales`.** `scope.zoneAreas` is a V2-template-only, Gantt-zone-weighting input (`computeZoneWeights`/`zonedWeightsEngine.js`), scoped to projects using the zoned Gantt template. `sales_area_sqm` is the template-independent canonical historical/benchmark fact. These two are intentionally NOT reconciled by this migration — doing so would require touching the Gantt weighting engine, which is out of scope. A future task may decide to pre-fill `scope.zoneAreas` from these canonical fields at V2 template setup time. |
| Back of House Area | `projects.back_of_house_area_sqm` | BOH area (sqm) | Same distinction as Sales Area above, vs. `scope.zoneAreas.boh`. |
| Actual Construction Start | `projects.actual_construction_start_date` | Observed historical fact | Distinct from `construction_start_date` (planned/target, user-editable) and never reused from any forecast field. |
| Actual Construction Completion | `projects.actual_construction_completion_date` | Observed historical fact | **Not the same field as `construction_completion_date`**, which is a CPM/Gantt forecast owned exclusively by `ganttService` (`ganttEngine.calculateKeyDates`, recalculated on every Gantt regeneration). The `actual_` column is a one-time observed fact, never engine-recalculated. |
| Actual Opening | `projects.actual_opening_date` | Observed historical fact | **Not the same field as `forecast_opening_date`** (CPM forecast) or `target_opening_date` (planned/target). |
| Target Opening | `projects.target_opening_date` | Planned/target opening date | Pre-existing column, unchanged by this migration — listed here only to disambiguate from the two fields above. |
| Budget | `projects.budget` (`NUMERIC(14,2)`) | Planned cost | Requires `currency_code` whenever set. Unknown stays NULL, never `0`. |
| Actual Cost | `projects.actual_cost` (`NUMERIC(14,2)`) | Real cost | Same currency requirement and NULL-not-zero rule as Budget. |
| Currency | `projects.currency_code` | ISO 4217 3-letter code, one per project (v1 scope) | Validated at the application layer against `ISO_4217_CURRENCY_CODES` (`projectImportFieldMap.js`) — a 3-letter regex alone never proves a real currency; an unrecognized-but-well-formed code warns rather than blocks. No FX conversion is implemented anywhere. |
| General Contractor | `projects.general_contractor` / `projects.contractor_email` | GC company name / contact | Pre-existing columns, sufficient for v1 historical import — a missing OpenDay account never blocks importing a GC name as a historical fact. The richer `project_stakeholders` table remains a separate, project-scoped mechanism, not required here. |

Import commit path: `core/import/` (pure, Supabase-free) produces a `CREATE`/`SKIP`/`BLOCK` plan per row; `commit_project_import_batch` (migration 038) is the one trusted RPC that writes `CREATE` rows to `public.projects`, re-verifying each identity is still free at write time (stale-plan protection) and never performing UPDATE/MERGE/UPSERT. `public.import_jobs` holds batch-level audit metadata (row counts + a bounded per-row outcome summary), never a duplicate copy of canonical project data.

---

## Project Information Architecture v1 — Portfolio's derived LOCATION is not a stored field

Added to align Add New Project / Portfolio / Project Information around the canonical fields above (no schema change). `location_type`, `shopping_mall_name`, and `street` remain the only stored facts. Portfolio's LOCATION column and `ProjectDetailModal`'s "Identity & Location" section both derive their displayed value from those three columns via one shared helper, `describeProjectLocation` (`core/presentation/projectInfoPresentationModel.js`, re-exported through `hooks/useProjectInfoPresentation.js` per the pages/components-never-import-`core/`-directly architecture rule):

- `location_type = 'Mall'` → LOCATION = `shopping_mall_name`
- `location_type = 'Street'` → LOCATION = `street`
- no `location_type` → LOCATION is null (rendered as "—"/"-")

There is no `projects.location` column and none should be added — this is presentation logic only, computed on read exactly like every other derived value in this document, never persisted, never a second source of truth for the mall-name/street-address facts.
