# Progress Semantic Model

## Three canonical progress concepts

### 1. Contractor Raw Progress
- Field: `contractor_reports.overall_progress`
- Meaning: simple (unweighted) average of contractor-submitted WP percentages for one report submission
- Engine: `contractorReportService.computeOverallProgress()` — module-private, `sum / count`, no phase/WP weighting
- Note: this is the contractor's own raw view, not the official project progress. Do not treat it as authoritative for risk/readiness/dashboard calculations.

### 2. Official Progress Snapshot
- Field: `progress_history.overall_progress`
- Meaning: official cumulative project progress at a point in time, written on report submission
- Engine: `progressEngine.js` (`calculateProjectProgressResult` / `calculateProjectProgress`) → written by `reportService.create()` and `contractorReportService.submitReport()`
- Note: this is the authoritative historical record used for dashboards, risk, and week-over-week comparisons.
- ⚠️ **Boundary risk (documented, not fixed this wave):** `contractorReportService.submitReport()` writes this field via `meta.cumulativeProgress ?? report.overall_progress ?? computeOverallProgress(wpProgressArray)`. The sole current caller (`ContractorReport.jsx`) always supplies `cumulativeProgress` (computed via the canonical `calculateProjectProgressResult`), so the `computeOverallProgress()` fallback is dead in practice today — but the code path exists, meaning a future caller that omits `cumulativeProgress` would silently write the *raw contractor average* into the *official* snapshot. See Step 6.6 comment in the source.

### 3. Task-Level Actual Progress
- Field: `project_gantt_tasks.actual_progress`
- Meaning: latest actual % complete for each WP in the Gantt schedule
- Writer: `ganttService.batchUpdateWPProgress()` (thin pass-through of contractor-submitted per-WP percentages — no independent calculation)
- Note: derived cache from contractor report WP submissions; source of truth for Gantt visualization and `spiEngine`'s SPI/critical-path calculations.

## Canonical calculation engine

- `progressEngine.js` is the single source of truth for **weighted** progress calculations (`calculatePhaseProgress` → `calculateProjectProgress` → `calculateProjectProgressResult`).
- Confirmed consumers-only (no independent calc): `riskEngine.js`, `contractorEngine.js`, `portfolioEngine.js`, `useAllRows.js` — all call `calculateProjectProgressResult()` / `calculateProjectProgress()` rather than re-implementing weighting.
- `portfolioEngine.js` additionally does a **portfolio-level average of already-computed per-project progress values** (`allRows.reduce(...)/allRows.length`) — this is a different aggregation layer (many-projects average), not a duplicate of the per-project weighted calculation. Not a violation.
- No page or service should implement weighted progress outside `progressEngine.js`.

## `reportUtils.js` — mixed file, not purely legacy

Unlike `workPackages.js`/`reportWeights.js` (purely legacy, superseded), `reportUtils.js` is a **mix**:

| Function | Status | Reason |
|---|---|---|
| `PHASE_ORDER`, `getStatusScore()`, `computeCumulativeStatuses()`, `estimateProgressFromStatuses()` | ⚠️ `@legacy` (already marked in source) | Old 4-phase flat-status format only (`demolitionStatus`/`constructionStatuses`/etc). Superseded by `progressEngine.calculateProjectProgressResult()`. |
| `isWPReport()`, `mergeGanttWPStatuses()` (private), `computeWPCumulativeStatuses()` | ✅ **canonical-adjacent — do NOT mark legacy** | `progressEngine.js` itself imports and calls these directly (lines 31–35, 199–200) to build the Gantt-format cumulative status object it computes progress from. They are part of the canonical pipeline, physically located in this file. |
| `getPackageProgressMap()` | 🪦 dead code | Exported but zero external callers found (grepped whole `src/` tree). Not removed this wave — no-delete rule. |

**Consequence:** a file-level `@legacy` banner (as a literal reading of a generic "mark the whole file legacy" instruction might suggest) would be **incorrect** here — it would misdirect a future reader into thinking `computeWPCumulativeStatuses`/`isWPReport` should also be avoided/migrated, when in fact the canonical engine depends on them being right here. The existing **per-function** `@legacy` JSDoc banners (already present in the source, predating this wave) are the accurate and sufficient marking — see the top-of-file note added in Wave 6 for a file-level map pointing to this document.

## Legacy

- `reportUtils.js` — see mixed-file breakdown above. Do not add *new* calculation logic to the legacy-marked functions; canonical-adjacent functions may continue to evolve alongside `progressEngine.js`.
- `workPackages.js`, `reportWeights.js` — fully legacy (see `TEMPLATE_MODEL.md`), consumed by `reportUtils.js`'s legacy functions.
