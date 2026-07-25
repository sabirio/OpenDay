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
| Location Type | `projects.location_type` | `Mall` or `Street` (v1 application vocabulary only) | **No DB CHECK constraint** — deliberately TEXT NULL so a future evidence-backed value (e.g. Airport) can be added in one place, never a migration. An unrecognized value is a warning, not a block. |
| Shopping Mall | `projects.shopping_mall_name` | Mall name, required when `location_type = 'Mall'` | Must never hold a street address or a generic "project name" — a spreadsheet column literally named "Project Name" is deliberately NOT a recognized alias (Phase 1 field-mapping debt fix, see `projectImportFieldMap.js`). |
| Street | `projects.street` | Street address, required when `location_type = 'Street'` | Pre-existing column (predates this profile); must be null whenever `location_type = 'Mall'`. |
| Project Type | `projects.project_type` | What kind of work/project is being performed (New Opening, Rebuilding, ...) | Free text, zero DB constraint. Unrecognized values warn, never block. |
| Store Concept | `projects.store_concept` | Retail format/concept (Flagship, Standard, ...) | Free text, no DB enum, no hard-coded brand values. UI-suggestion list only, never validated against. |
| Total Area | `projects.store_size_sqm` | Total store area (sqm) | Pre-existing column. First live UI input added by Project Information Architecture v1 (`ProjectEditorModal.jsx`'s Areas section) — until then, historical import was its only real writer for most projects. Feeds `ganttEngine`'s size-modifier calculation; also displayed in `ProjectDetailModal.jsx`. |
| Sales Area | `projects.sales_area_sqm` | Sales floor area (sqm) | **Not the same field as `scope.zoneAreas.sales`.** `scope.zoneAreas` is a V2-template-only, Gantt-zone-weighting input (`computeZoneWeights`/`zonedWeightsEngine.js`), scoped to projects using the zoned Gantt template. `sales_area_sqm` is the template-independent canonical historical/benchmark fact. These two are intentionally NOT reconciled by this migration — doing so would require touching the Gantt weighting engine, which is out of scope. A future task may decide to pre-fill `scope.zoneAreas` from these canonical fields at V2 template setup time. |
| Back of House Area | `projects.back_of_house_area_sqm` | BOH area (sqm) | Same distinction as Sales Area above, vs. `scope.zoneAreas.boh`. |
| Actual Construction Start | `projects.actual_construction_start_date` | Observed historical fact | Distinct from `construction_start_date` (planned/target, user-editable) and never reused from any forecast field. |
| Actual Construction Completion | `projects.actual_construction_completion_date` | Observed historical fact | **Not the same field as `construction_completion_date`**, which is a CPM/Gantt forecast owned exclusively by `ganttService` (`ganttEngine.calculateKeyDates`, recalculated on every Gantt regeneration). The `actual_` column is a one-time observed fact, never engine-recalculated. |
| Actual Opening | `projects.actual_opening_date` | Observed historical fact | **Not the same field as `forecast_opening_date`** (CPM forecast) or `target_opening_date` (planned/target). |
| Target Opening | `projects.target_opening_date` | Planned/target opening date | Pre-existing column, unchanged by this migration — listed here only to disambiguate from the two fields above. |
| Budget | `projects.budget` (`NUMERIC(14,2)`) | Planned project cost | Requires `currency_code` whenever set. Unknown stays NULL, never `0`. Add New Project and Edit Project both expose it. |
| Actual Cost | `projects.actual_cost` (`NUMERIC(14,2)`) | Real known project cost (not a forecast, estimate, remaining budget, committed cost, or CPI) | Same currency requirement and NULL-not-zero rule as Budget. **Add New Project does not request it** — at creation time the real cost generally doesn't exist yet, and showing the field would invite a fabricated `0`. **Edit Project exposes it** (Project Information Architecture v1 cleanup) so an operational project's actual cost can be recorded through the normal project workflow instead of only via Import. Project Information always displays it (read + write both flow through the one shared `ProjectEditorModal` → `projectService` path — no second financial model). |
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

---

## Project vocabularies — one canonical shared source

Location Type, Project Type, and Store Concept previously had two literal definitions — one in `core/import/projectImportFieldMap.js` (Import) and a hand-mirrored copy in `config/projectVocabulary.js` (Project UI) — a One Source of Truth violation flagged and removed in the Project Information Architecture v1 cleanup.

**Canonical owner:** `config/projectVocabulary.js` (`PROJECT_TYPE_OPTIONS`, `LOCATION_TYPE_OPTIONS`, `STORE_CONCEPT_SUGGESTIONS`) — a dependency-free config leaf, the same layer several other `core/*` modules already depend on elsewhere in this codebase, which makes it a legal neutral owner: Import depends on it, it depends on nothing project-specific.

`core/import/projectImportFieldMap.js` re-exports the same three arrays under its historic names (`PROJECT_TYPE_VALUES`, `LOCATION_TYPE_VALUES`, `STORE_CONCEPT_SUGGESTIONS`) so every existing Import consumer/test is unaffected. Add/Edit Project and Portfolio's Location Type filter consume the canonical names directly. `src/tests/projectVocabularyArchitecture.test.mjs` proves by reference identity (`===`) that no second literal array exists.

`ISO_4217_CURRENCY_CODES` was not touched by this cleanup (it was never mirrored) and still lives in `projectImportFieldMap.js`. It was missing KZT at the time this section was written; fixed in Project Exchange v1 below (a real Kazakhstan project's stored currency was being flagged as unrecognized).

---

## Project Exchange v1 — Import, Project Export, and the Blank Template share one field catalog

Project Export (Portfolio → "Export Projects") and the Blank Import Template (Import Projects → "Download Excel template") both read `core/import/projectImportFieldMap.js`'s `IMPORT_FIELD_CATALOG` directly — the exact same catalog Import's own mapping/normalization/validation already used. Neither introduces a second header, order, or field-vocabulary list. `src/export/xlsx/projectExportRow.js` derives its header row and per-field type handling entirely from that catalog; `src/export/xlsx/projectExportArchitectureGuard.test.mjs` proves this by source-text contract (no hard-coded header strings, `PROJECT_EXPORT_HEADERS` is byte-identical to `IMPORT_FIELD_CATALOG.map(f => f.label)`).

**Workbook generator (one function, two callers):** `buildProjectWorkbook(projects)` in `src/export/xlsx/buildProjectWorkbook.js` is the only module that touches the `xlsx` package in this directory (mirrors `core/import/parseImportFile.js`'s "one module touches xlsx" rule). Project Export calls it with the current Portfolio result set (after search/filters — exactly the rows the table is showing, no separate filter re-implementation); the Blank Template calls it with `[]`. There is no static `public/*.xlsx` file and no second hard-coded header list anywhere.

**KZT fix:** `ISO_4217_CURRENCY_CODES` now includes `KZT` — a real Kazakhstan project's stored `currency_code` was previously flagged `UNRECOGNIZED_CURRENCY` by Import despite being a perfectly valid stored value (the column itself has no FK/CHECK to this list). No other currency-model change; no FX; no currencies table.

**Deliberately excluded from Project Exchange v1** (all documented here rather than silently dropped):
- **Portfolio's derived `LOCATION`** — never a stored field (see the section above); the exchange catalog exports its two canonical sources, `Location Type` and `Shopping Mall Name`/`Street Address`, separately instead.
- **`construction_completion_date` / `forecast_opening_date` / `gantt_*`** — engine-owned forecasts (`ganttEngine.calculateKeyDates`), never editable Import/Export facts, exactly as already documented above.
- **`project_status`** — Import v1 has never written this column; adding it to the exchange catalog without matching Import support would create an Export column that silently fails to round-trip. Excluded pending an explicit future decision to make it Import-writable.
- **`project_manager`** (and the other stakeholder-manager columns) — no stable, human-readable, Import-safe identity contract exists yet (a spreadsheet name string isn't a safe assignment mechanism to an OpenDay user account). Excluded from v1; `general_contractor`/`contractor_email` remain included since they were already plain historical text fields in the frozen catalog, not user-account assignments.
- Every internal id (`id`, `company_id`, `template_id`, `created_by`, ...) — never exported, never expected in an uploaded file.

**Financial/date serialization:** Budget/Actual Cost export as bare numeric cells with Currency as its own column (`500000` / `KZT`, never a formatted `"500,000 KZT"` string) — Import already required this shape. Dates export as deterministic `YYYY-MM-DD` strings, matching Import's own unambiguous-date rule exactly. Null/unknown values export as blank cells, never a fabricated `0`/`"N/A"`/`"Unknown"`.

**Security/scope:** Export reads whatever `projectService.getAll()` (RLS-scoped, no client-side company filter needed) already returned to the page — it cannot broaden visibility, since it never queries anything itself; it only serializes rows the page already legitimately has. Pure read/download: no `projects`/`import_jobs`/report/Gantt row is ever written by generating or downloading a workbook.

---

## Project Exchange v1 completion patch — Planned Construction End (`construction_end_date`)

Closes the one round-trip gap found during Project Exchange v1 certification: `construction_end_date` already existed in the schema (migration 037) and in live Add/Edit Project, but Import's commit RPC never wrote it, so Export → Excel → Import into a fresh project silently dropped it. Migration 040 (`CREATE OR REPLACE` on `commit_project_import_batch`, same pattern as 039 — 037/038/039 are not edited) adds `construction_end_date` to the trusted INSERT, closing the gap. No schema change, no new table, no new column (the column already existed).

**Canonical header:** `Planned Construction End` — the one and only spreadsheet header for this field, added once to `IMPORT_FIELD_CATALOG`; Import mapping, Project Export, and the Blank Template all inherit it automatically from that single addition (no separate declaration anywhere).

**PLANNED vs FORECAST — the distinction this patch depends on:**
- `projects.construction_end_date` = **PLANNED** construction end. A user/project fact, entered and edited exactly like `construction_start_date` and `target_opening_date` (same table, same UI section, same Import catalog). Part of Project Exchange v1.
- `projects.construction_completion_date` = **FORECAST**, engine-owned. Computed exclusively by `ganttEngine.calculateKeyDates`, recalculated on every Gantt regeneration. Never editable, never part of Import/Export, unaffected by this patch.

These two are never to be confused despite the similar names — `construction_end_date` is a plan; `construction_completion_date` is the schedule engine's own prediction.

**Validation severity (deliberate, matches existing precedent):** `construction_end_date < construction_start_date` is a **WARNING** (`PLANNED_END_BEFORE_START`), not a BLOCK — the exact same severity already given to the sibling planned-date relationship (`target_opening_date` before `construction_start_date`, `OPENING_BEFORE_START`). Planned dates are estimates subject to revision; only **ACTUAL** (observed) date orderings are hard business impossibilities and are BLOCK-level both in `validateProjectImportRow.js` and in the RPC's own integrity floor. Consistently, migration 040 does **not** add a `construction_end_date` ordering check to the server-side integrity floor — a forged direct-RPC row with an invalid planned chronology still commits, persisted exactly as submitted (certified by `IMP-22` in `scripts/certification/certifyImportPhase2.mjs`), matching `target_opening_date`'s existing, unchanged behavior. This is a documented design choice, not an oversight.

---

## Projects IA v1 — Import is a Portfolio-owned operation, not a standalone product module

Portfolio owns the Project-lifecycle entry actions:

```
Portfolio (/projects)
├── Add New Project    (create one)
├── Import Projects    (create many, from spreadsheet)
├── Export Projects    (extract data)
└── Project → Project Information
```

**Canonical route:** `/projects/import` (was `/import/projects`). The old URL is a compatibility redirect only (`LegacyImportProjectsRedirect`, `<Navigate replace>`, mirrors the existing `pages/snags/LegacyFieldSnagRedirect.jsx` pattern) — both routes enforce the same `projects_import` permission via `<ProtectedRoute>` before any redirect happens, so there is no route-based permission bypass. There is exactly one Import implementation (`ImportProjectsPage` + `useImportWorkflow` + the Upload/Map/Preview/Result steps); the route move changed navigation and product ownership only, not the certified Import workflow itself, which is unchanged.

**Navigation:** "Import Projects" is no longer a top-level sidebar item (it was a peer of "Portfolio" before this patch — that implied it was its own product module, which contradicted the "capture once" mental model of a user who thinks "I manage Projects, then add/import/export"). It is reached only via the "Import Projects" action on Portfolio, gated by the same `projects_import` permission Portfolio already had access to check.

**Returning to Portfolio after Import:** the Result step's (and the workspace header's) "Back to Portfolio" both call the same `loadProjects()` App.jsx already uses on login before navigating to `/projects` — Import can create many projects in one commit, so refetching is simpler and more correct than reconstructing full canonical rows from the RPC's bounded per-row outcome summary just to splice them into client state. No manual client-side row injection.

---

# Historical Data Foundation v1

```
Live OpenDay Projects
+
Imported Historical Projects
        ↓
Canonical projects
        ↓
Historical Data Foundation
        ↓
future analytical engines (Benchmark, Cost/Schedule/Contractor Intelligence, Forecasting, AI)
```

**One canonical builder, no duplicate historical model.** `src/engines/historyEngine.js` exports `buildHistoricalProjectFacts(project)` — a pure projection over the exact same canonical project object `projectService.fromDB()` already produces. There is no `historical_projects` table, no `is_historical` column, and no second "imported vs. live" code path: a live OpenDay project and a project created by Import are the identical canonical shape, so the same builder produces valid Historical Project Facts for both (`historyEngine.test.mjs` certifies this with both an imported-shaped and a live-in-progress fixture). `src/engines/portfolioHistoryEngine.js` (mirrors the existing `riskEngine.js`/`portfolioRiskEngine.js` split) aggregates many projects' facts into a dataset and a data-coverage summary.

**No historical DB duplication.** No migration was added for this task (chain still ends at 040) — v1 calculates from canonical project facts already in `public.projects` at read time; nothing is persisted. Analytics operate only on whatever canonical projects the caller already legitimately has (existing company/RLS/project-access semantics) — this layer never queries Supabase itself.

**Per-dimension eligibility, not one global flag.** A project is not globally "historical = yes/no" — a project may be valid evidence for cost-per-m² analysis while having no actual construction dates at all. `buildHistoricalProjectFacts(project).eligibility` exposes seven independent booleans: `plannedSchedule`, `actualSchedule`, `openingPerformance`, `costPerTotalSqm`, `costPerSalesSqm`, `costVariance`, `contractorAttribution`. A later Benchmark Engine must check the relevant dimension(s) for its own analysis, never assume a project that's eligible for one dimension is eligible for all.

**Derived metrics (v1, never persisted):**

| Group | Metric | Formula |
|---|---|---|
| Planned schedule | `plannedConstructionDays` | `constructionEnd − constructionStart` (null if chronology invalid) |
| | `plannedPreOpeningDays` | `targetOpening − constructionEnd` (null if chronology invalid) |
| Actual schedule | `actualConstructionDays` | `actualConstructionCompletion − actualConstructionStart` (null if chronology invalid) |
| | `actualPreOpeningDays` | `actualOpening − actualConstructionCompletion` (null if chronology invalid) |
| Schedule variance (sign meaningful — never "delay"-labeled; early is legitimate) | `constructionStartVarianceDays` | `actualConstructionStart − constructionStart` |
| | `constructionCompletionVarianceDays` | `actualConstructionCompletion − constructionEnd` |
| | `openingVarianceDays` | `actualOpening − targetOpening` |
| Financial | `costVarianceAmount` | `actualCost − budget` |
| | `costVariancePercent` | `(actualCost − budget) / budget × 100` (null when budget is 0 — never divides by zero) |
| | `actualCostPerTotalSqm` / `actualCostPerSalesSqm` | `actualCost / totalArea` / `actualCost / salesArea` |
| | `budgetPerTotalSqm` / `budgetPerSalesSqm` | `budget / totalArea` / `budget / salesArea` |
| Area | `salesAreaRatio` / `backOfHouseAreaRatio` | `salesArea / totalArea` / `backOfHouseArea / totalArea` (0–1, not a percentage) |

All calendar-day differences reuse the canonical `diffDays` from `engines/dateMath.js` — a neutral date-math utility, not a Gantt-layout one. It was moved out of `engines/ganttLayout.js` (which now only re-exports it, unchanged, for its existing consumers) so History (and later Benchmark) depend on generic date arithmetic rather than on a Gantt-specific module; the formula itself is unchanged. `engines/ganttEngine.js` has its own separate, private, UTC-midnight-normalizing `diffDays` for CPM scheduling — a deliberately different formula for a different purpose, out of scope for this consolidation.

**Forecast fields are never historical truth.** `construction_completion_date`/`forecast_opening_date` (engine-owned CPM outputs, recalculated on every Gantt regeneration) are never read by `historyEngine.js` — actual performance uses only `actual_construction_completion_date`/`actual_opening_date`. Enforced by a dedicated architecture-guard check (`historyArchitectureGuard.test.mjs`) that fails if either forecast field is ever accessed as a property.

**Unknown ≠ zero.** A metric is `null` only when its required input is missing/unparseable — never when a genuine `0` is measured (e.g. `actualCost = 0` still yields `actualCostPerTotalSqm = 0`, not `null`). Division-by-zero-shaped inputs (e.g. `store_size_sqm = 0`) also yield `null`, never `Infinity`/`NaN`.

**Data quality issues (v1, minimal).** `buildHistoricalProjectFacts(project).qualityIssues` is a small deterministic array (`{code, field, message}`) flagging only analytical contradictions that would corrupt a derived metric — `PLANNED_END_BEFORE_START`, `PLANNED_OPENING_BEFORE_CONSTRUCTION_END`, `ACTUAL_COMPLETION_BEFORE_START`, `ACTUAL_OPENING_BEFORE_COMPLETION`, `SALES_AREA_EXCEEDS_TOTAL`, `NEGATIVE_AREA`, `NEGATIVE_MONEY`, `MONEY_WITHOUT_CURRENCY`. Missing optional data is never itself a quality issue — only internally-inconsistent *present* values are. The raw canonical dates/values are never rewritten; a quality issue only suppresses the specific derived metric(s) it would corrupt.

**Currency — no FX, ever.** Every financial metric stays denominated in the project's own `currencyCode`; `500 USD/m²` and `250000 KZT/m²` are never averaged or converted. `costPerTotalSqm`/`costPerSalesSqm`/`costVariance` eligibility all require a known `currencyCode` (a cost-per-sqm value computed without a known currency is still returned as a number by the metric itself, but is *not* eligible — eligibility signals analytical comparability, not mere numeric presence). `portfolioHistoryEngine.buildHistoricalDataCoverage()` may report `eligibleCostProjectsByCurrency` (counts per currency code) but never a cross-currency value. FX conversion is out of scope — Benchmark Engine v1 (below) enforces same-currency cohorts for absolute cost metrics instead of converting.

**Contractor attribution ≠ contractor scoring.** `eligibility.contractorAttribution` only says whether `general_contractor` is known/non-empty — it is not a score, rank, or quality judgment. Contractor Performance (a future engine) owns that.

**No benchmarking, no forecasting, no AI in this layer.** No averages, medians, percentiles, rankings, or outlier detection are computed here — this is Data Coverage (counts only), not Benchmark Engine. Those consume this same dataset later.

# Benchmark Engine v1

Answers "which genuinely comparable previous projects should this project be benchmarked against, and what does that cohort tell us?" — a project-profile benchmark of **what happened**, not a forecast of what will happen (Forecast Engine is separate, later work).

```
Live OpenDay Projects + Imported Historical Projects
        ↓
Canonical projects
        ↓
Historical Data Foundation (buildHistoricalProjectFacts / buildHistoricalProjectDataset)
        ↓
Benchmark Engine (buildProjectBenchmark / buildProjectBenchmarks)
        ↓
future Benchmark UI (not built in this task)
```

**Evidence over opinion — no similarity score.** `src/engines/benchmarkEngine.js` never computes an opaque similarity score, weighting, or AI ranking. Cohort membership is a deterministic, explainable rule set: every result's `cohort.criteria` states exactly why the compared projects were compared (country, projectType, storeConcept, locationType, area tolerance, currency).

**Consumes Historical Foundation, never recalculates it.** `buildProjectBenchmark`/`buildProjectBenchmarks` take `HistoricalProjectFacts`/`HistoricalProjectFacts[]` (from `historyEngine.js`/`portfolioHistoryEngine.js`) as input — they never recompute `actualCostPerTotalSqm`, `actualConstructionDays`, `openingVarianceDays`, `costVariancePercent`, or any eligibility flag, and never query Supabase or accept a raw DB project row. Authorization (which projects the caller is even allowed to see) stays entirely outside this engine, in whatever built the dataset.

**Exactly 5 supported v1 metrics:** `actualCostPerTotalSqm`, `actualCostPerSalesSqm`, `actualConstructionDays`, `openingVarianceDays`, `costVariancePercent`. No others without new evidence of need.

**Base compatibility (every metric, every tier).** A candidate must: not be the target itself (excluded by canonical identity — `identity.storeCode` — not array reference, so the same project appearing twice in a dataset is still excluded); be eligible for that metric per Historical Foundation's own `eligibility.*` flag; have the metric's value; share the target's `country` and `projectType` (both mandatory always — a benchmark never silently crosses a market or project-type boundary to inflate sample size).

**Deterministic 4-tier cohort selection**, evaluated strongest → broadest, first tier reaching `MIN_BENCHMARK_SAMPLE_SIZE = 3` wins (both constants centralized in the one `BENCHMARK_COHORT_POLICY` object, not scattered literals):

| Tier | Label | storeConcept | locationType | Total area tolerance |
|---|---|---|---|---|
| 1 | CLOSE_MATCH | required | required | ±25% |
| 2 | STRONG_MATCH | required | any | ±40% |
| 3 | BROAD_MATCH | any | any | ±50% |
| 4 | MARKET_PROJECT_TYPE | any | any | none |

Area tolerance is inclusive at both boundaries (target 1000m², Tier 1 → 750 and 1250 both included, 749 and 1251 excluded). If the target's own `storeConcept`/`locationType`/`totalArea` is unknown, tiers that require a *known* matching value on that field never match anything (a null target value is never treated as "matches every null candidate") — the search simply falls through to a broader tier. If no tier reaches the minimum, the result is `INSUFFICIENT_EVIDENCE` with `bestAvailableTier`/`bestAvailableSampleSize` exposed for transparency — never a benchmark fabricated from 1–2 projects.

**Currency boundary is metric-specific, not uniform.** `actualCostPerTotalSqm`/`actualCostPerSalesSqm` are absolute currency-per-area values, so they require the same `currencyCode` as the target (no FX in v1 — a different-currency project is excluded from the cohort, never converted). `costVariancePercent` is already dimensionless (a ratio of actual to budget in the project's own currency), so it does **not** require currency match — this is a deliberate v1 policy decision, not an oversight.

**Zero-actual-cost benchmark policy (Benchmark-only, not a Historical Foundation correction).** Historical Foundation correctly keeps `actualCost = 0` as a real, non-null fact. Benchmark Engine additionally excludes `actualCost <= 0` candidates from **cost-per-area** cohorts specifically (`actualCostPerTotalSqm`/`actualCostPerSalesSqm`) as not-meaningful comparable construction-cost evidence — a comparability policy layered on top of the raw fact, which is itself untouched. `costVariancePercent` does not apply this exclusion (a $0-actual-cost project can still have a meaningful, if extreme, budget variance).

**Median is the primary comparison center**, mean is still returned for transparency. Statistics (`min`, `max`, `mean`, `median`, `p25`, `p75`) use one documented deterministic percentile algorithm — linear interpolation between ranks (a.k.a. "PERCENTILE.INC") — with no outlier trimming in v1. `comparison.deltaFromMedian` preserves sign (e.g. `openingVarianceDays` cohorts and their median can legitimately be negative — early openings are never converted to absolute values or labeled "delay"). `comparison.percentFromMedian` is only computed for positive scalar cost/duration metrics (`actualCostPerTotalSqm`, `actualCostPerSalesSqm`, `actualConstructionDays`) when the median is non-zero — never for `openingVarianceDays` (signed, can legitimately be 0) or `costVariancePercent` (already a percent), and never `NaN`/`Infinity` when the median is 0.

**Cohort eligibility ≠ target comparison availability (fundamental product rule).** These are two different questions and Benchmark Engine v1 keeps them structurally separate:

- *"Can we select comparable historical projects for this target?"* — depends only on the target's **cohort-defining context**: `country`, `projectType`, and — for the two absolute cost-per-area metrics only — `currencyCode`. This is what `TARGET_NOT_ELIGIBLE` gates.
- *"Can we compare the target's own actual result against that cohort?"* — depends on whether the target **itself** already has a measured outcome: its own metric value, its own Historical Foundation `eligibility.*` flag, and (for cost-per-area metrics) a positive `actualCost`. This is `target.comparisonAvailable`, computed independently and never used to block cohort selection.

A brand-new or in-progress project — no actual cost, no actual dates, no actual opening yet — must still be able to receive full cohort statistics (`sampleSize`, `min`/`max`/`mean`/`median`/`p25`/`p75`) from genuinely comparable **finished** historical projects; it simply cannot yet see its own value plotted against that median. **A project does not need to be finished to receive a historical benchmark.** This is what makes Benchmark Engine usable as future Forecast Engine input for in-progress projects, not only a look-back report for completed ones.

**Three statuses, no judgmental labels.** `AVAILABLE` (a comparable cohort was found — regardless of whether the target has its own actual outcome yet), `INSUFFICIENT_EVIDENCE` (a cohort search was attempted but no tier reached the minimum sample size), `TARGET_NOT_ELIGIBLE` (the target itself lacks the **cohort-defining context** needed to search at all: missing `country`, missing `projectType`, or — for cost-per-area metrics only — missing `currencyCode`). Critically, `TARGET_NOT_ELIGIBLE` is **not** used merely because the target's own metric value is `null` — a target with full context but no actual outcome yet is `AVAILABLE` with `comparisonAvailable: false`. No `GOOD`/`BAD`/`HIGH RISK` labels anywhere.

**One stable result shape** across all 5 metrics and all 3 statuses: `{ metric, status, target, cohort, statistics, comparison }`, where `target` includes `comparisonAvailable` (`true` only when the target has its own valid, comparable metric value; `false` — never inferred from a falsy number, only from explicit null/eligibility/positive-cost checks — otherwise). `statistics` is populated whenever `status = AVAILABLE`, independent of `comparisonAvailable` (cohort evidence never depends on the target's own outcome). `comparison` (`deltaFromMedian`/`percentFromMedian`) is `null` whenever `comparisonAvailable` is `false`, and never fabricated as `0`. `cohort` always includes a `tiersEvaluated` log of all 4 tiers' criteria and sample sizes, so "why were these projects compared" is always answerable, even for an insufficient-evidence result.

**No persistence, no new migration.** No `project_benchmarks` table, no `benchmark_snapshots`/`benchmark_percentiles` columns, no cohort table — migration chain still ends at `040`. No "Benchmarks" top-level nav item, dashboard, or Portfolio analytics module — Benchmark is a Project-context view (see "Benchmark Product/UI Layer v1" below), not a standalone module.

**Per-metric cohorts, not one universal cohort.** The same target project can legitimately get a different cohort (different tier, different sample size, different member projects) for each of its 5 metrics, since eligibility is per-dimension (Historical Foundation's own model) — `buildProjectBenchmarks` never forces a single shared cohort across metrics.

# Benchmark Product/UI Layer v1

The UI layer that exposes Benchmark Engine v1 (above) to users. Benchmark is **not** a standalone OpenDay module — it answers a Project-scoped question ("how does *this* project compare with genuinely similar previous projects?"), so it lives inside the existing canonical Project detail surface, not the sidebar:

```
Project
├── Information   (unchanged — frozen Project Information IA)
└── Benchmark     (new — this task)
      ├── Cost / Total m²
      ├── Cost / Sales m²
      ├── Construction Duration
      ├── Opening Variance
      └── Cost Variance
```

`ProjectDetailModal.jsx` gained an Information/Benchmark tab switcher (`ProjectDetailTabs.jsx`, the same accessible `role="tablist"`/`role="tab"` pattern already used by Weekly Reports); Information's existing sections (Identity & Location, Classification, Areas, Planned/Actual/Forecast Dates, Financial, Stakeholders, Construction Phases, Contractor Link) are untouched and still the default tab.

**Data flow — UI never queries or recomputes.** `Projects.jsx` already holds the authorized `projects[]` collection (from `projectService.getAll()`); it now also passes that same collection into `ProjectDetailModal`, which passes it into `BenchmarkView`. The one new facade, `core/presentation/projectBenchmarkModel.js` (`buildProjectBenchmarkCards(project, projects)`), builds `HistoricalProjectFacts` for the target and the dataset and calls the frozen `buildProjectBenchmarks` — it never queries Supabase itself and never recomputes a cohort, a statistic, or a comparison delta; it only formats the numbers Benchmark Engine already produced. `hooks/useProjectBenchmark.js` is a thin `useMemo` wrapper (pure/synchronous computation, so no loading-spinner architecture was introduced). This is the same "UI → hook → core/presentation facade → engines" boundary `projectInfoPresentationModel.js`/`useProjectInfoPresentation.js` already established — pages/components/hooks still never import `engines/` directly.

**Five cards, one reusable component.** `BenchmarkCard.jsx` renders all 3 Benchmark Engine statuses:
- `AVAILABLE` — **Median** (primary statistic) and **Typical range** (P25–P75, explicitly not called a confidence interval) always shown, plus sample size ("N comparable projects"). **Your project** shows the target's own value and a **vs median** comparison line *only* when `comparisonAvailable` is `true`; otherwise it shows a plain "Actual … not available yet" sentence — never "No benchmark," never a fabricated zero, never a hidden card. Mean and full range live inside a collapsed **Comparison basis** disclosure alongside the cohort criteria, not on the main card face.
- `INSUFFICIENT_EVIDENCE` — "Not enough comparable history" plus the engine's own `bestAvailableSampleSize`/`BENCHMARK_COHORT_POLICY.minSampleSize` — no fabricated statistics.
- `TARGET_NOT_ELIGIBLE` — a short, human-facing sentence ("Country and Project Type are required…", "Currency is required to compare historical costs.") derived from which cohort-context fact is missing, never a raw engine string dump or stack trace.

**A project does not need to be finished to receive a historical benchmark** (the frozen Benchmark Engine rule this whole layer exists to expose): an in-progress target with full cohort context but no actual outcome yet renders all 5 cards as `AVAILABLE` with real statistics and `comparisonAvailable: false` — the UI proof that cohort selection and target comparison are separate concerns.

**Comparison basis = explainability, not a similarity score.** The disclosure leads with a "Match" row (the human tier label) then lists the criteria the *winning* cohort tier actually applied (country, project type, store concept, location type, area tolerance, currency — whichever the tier used), plus sample size, mean, and full range. There is no match/similarity percentage anywhere in this layer (Evidence Over Opinion). Technical tier identifiers (`CLOSE_MATCH`, `Tier 1`, …) are mapped to human labels ("Close match", "Strong match", "Broad match", "Market & project type") for that "Match" row — the technical names stay internal/test-only.

**Median is the visual headline, "Your project" is visually its own thing.** Per the UX/Product Audit v1: Median and "Your project" share the same card, so "Your project"'s value is visually distinguished (not just by its label) from Median's — otherwise the two numbers read with identical weight and a PM scanning quickly could momentarily confuse "what historically happened" with "what this project's own value is." This is a legibility distinction only, not a judgment color — it carries no good/bad meaning.

**No judgment, no FX, no forecasting, no AI.** Values are shown with their sign preserved (early openings and cost underruns are not "bad"); there is no Good/Bad/Excellent/Poor language anywhere. `percentFromMedian` is only rendered when the engine itself provides it (never independently calculated in React). No currency conversion — a cost card shows only the target's own currency cohort, even when other currencies exist in the historical dataset; `costVariancePercent` may combine currencies per the engine's own existing (unmodified) policy. This is deterministic historical evidence ("what happened"), not a forecast of what will happen — Forecast Engine remains future work.

**Financial visibility.** Benchmark introduces no new permission model. The Portfolio/Project detail surface (and therefore Benchmark, nested inside it) is already gated to the `projects` resource (`Admin`/`PM` roles only, `auth/rolePermissions.js`) at the route level; Project Information already shows every visible project's `budget`/`actualCost` unconditionally to any role that can reach that route. Benchmark's cost cards aggregate (median/range) over that exact same already-visible, already-authorized project collection — no new project or field becomes visible to a role that could not already see it.

**No persistence, no new top-level nav item, no new module.** Card computation is in-memory per render (memoized on `project`/`projects` identity); nothing is written to the database. `Benchmark` was not added to `auth/rolePermissions.js`'s `NAV_ITEMS`, and no `Analytics`/`Intelligence`/`Historical Data` module was created.
