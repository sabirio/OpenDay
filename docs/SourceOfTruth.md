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
