# Contractor vs PM Comparison Model

## ⚠️ Correction vs. the original wave brief

The wave-7 brief assumed a single canonical comparison engine (`pmAlignmentEngine.js`) with everything else as derived cache/view. That does not hold structurally: **`pmAlignmentEngine.js` never reads `contractor_report_wps` / `site_visit_wps` at all.** It operates on the older in-memory `workPackageStatuses` / `pmWorkPackageStatuses` shape (the `workPackages.js` taxonomy), and answers a genuinely different question over a different time-scope.

Reality is **two parallel systems answering two different questions**, not one canonical engine with caches:

| System | Question answered | Reads | Writes |
|---|---|---|---|
| **Per-visit discrepancy** (`siteVisitService.submitSiteVisit()`) | "How far off was *this* site visit from the contractor's most recent report?" | Raw `gc_progress`/`gc_status`/`observed_progress`/`observed_status` passed in per WP by the caller | `site_visit_wps.discrepancy_*`, `site_visit_discrepancies`, `project_gantt_tasks` (via cache writer) |
| **Cross-time drift/alignment** (`pmAlignmentEngine.js` + `contractorDriftEngine.js`) | "Does this contractor show a *pattern* of over/understating progress across many reports and visits?" | In-memory `workPackageStatuses`/`pmWorkPackageStatuses` (legacy shape) fetched by the caller — no direct DB reads of its own | Nothing — pure functions; consumed live by `RiskDashboard.jsx` for reliability score / drift pattern |

Both are canonical for their own question. Neither supersedes the other.

## Canonical data sources

- Per-visit discrepancy: `gc_progress`/`gc_status` (from the contractor's Gantt task) vs `observed_progress`/`observed_status` (PM's site-visit input), passed into `siteVisitService.submitSiteVisit()` by the caller (`SiteVisitReport.jsx`).
- Cross-time drift: `report.workPackageStatuses` (contractor reports) vs `visit.pmWorkPackageStatuses` (PM site visits) — the legacy per-task-name format, not the Gantt DB tables.

## Canonical engines (two, scoped to different questions)

### 1. Per-visit discrepancy — `siteVisitService.submitSiteVisit()`
- Formula: status-rank delta (`STATUS_RANK`: completed=2/in_progress=1/not_started=0/delayed=-1/blocked=-2) as primary signal when neither side reports numeric progress; otherwise raw progress-point delta.
- Thresholds: `absDelta >= 20 → 'critical'`, `>= 10 → 'warning'`, else `'ok'`.
- This is the DB-writing, authoritative calculation for what gets persisted as "this visit's discrepancy."
- Rule: no other file should independently recompute this specific per-visit discrepancy from raw gc/pm values — read the already-computed result instead.

### 2. Cross-time drift/alignment — `pmAlignmentEngine.js`
- Formula: `WP_STATUS_SCORES` (0–1 scale) diff between GC status and PM-observed status. Thresholds: `diff > 0.75 → CRITICAL`, `> 0.4 → HIGH`, `> 0.15 → MEDIUM`, `<= 0.15 → Match`.
- Consumed by `contractorDriftEngine.js` (sums/averages `diff` across a timeline of visits to detect systematic-overstatement / panic-report / front-loading patterns) and `RiskDashboard.jsx` (`computeConfidenceLevel`, reliability scoring).
- Has a legacy format path (`computePmAlignmentItemsLegacy`) for the very old column-based report shape (`demolitionStatus`/`constructionStatuses`/etc, using `reportWeights.js` key lists) — see @legacy marker added in Wave 7.
- Rule: no other file should independently recompute cross-visit alignment/drift trend — read this engine's output instead.

## Derived / cache layers

| Layer | Role | Authority |
|---|---|---|
| `site_visit_discrepancies` table | Stored snapshot of per-visit discrepancies at submit time | Cache only — source is `siteVisitService.submitSiteVisit()`'s inline calc |
| `project_gantt_tasks.discrepancy_*` (via `ganttService.updateGanttDiscrepancy()`) | Gantt UI cache | Confirmed pure cache writer — takes already-computed values as parameters, does zero calculation itself. Do not use as a source of truth. |
| `site_visit_wps.discrepancy_status/delta` | Per-WP discrepancy fields | Stored derived — written once at `submitSiteVisit()` time, alongside the row insert |
| `dashboardService.getDiscrepancyHistory()` / `getContractorReliability()` | Read `site_visit_discrepancies` for dashboard display | Confirmed pure readers — no independent calculation |

## Write path (per-visit discrepancy)

1. PM submits site visit → `siteVisitService.submitSiteVisit()`
2. Discrepancy computed inline (status-rank + progress-delta formula above) from the caller-supplied gc/pm values
3. Results written to `site_visit_wps.discrepancy_*` (per-WP) and `site_visit_discrepancies` (summary rows, only for WPs with `absDelta > 0`)
4. `ganttService.updateGanttDiscrepancy()` pushes the same values into `project_gantt_tasks` (Gantt UI cache)
5. The service returns `{ siteVisit, discrepancies }` to the caller

## Known violations (found in Wave 7, not fixed — TODO wave7)

`SiteVisitReport.jsx` contains **two** independent re-implementations that do not read the already-computed result:

1. **Gantt-format success view** (`if (submitted && savedVisit?._ganttFormat)`): recomputes confirmed/discrepancy/pmAhead counts inline from component state (`ganttTasks`, `pmWpObservations`), using its own copy of `STATUS_RANK` and a **different tolerance** (`PROGRESS_TOL = 5`) than `siteVisitService`'s threshold (10/20). It does not read `savedVisit.discrepancies` — the actual result already returned by `submitSiteVisit()` — at all. Two formulas computing a similar-but-not-identical number, one of which (the DB-written one) is authoritative.
2. **Legacy comparison view** (`if (submitted && savedVisit)`, using the file-local `comparisonResult()` function): a **third**, independently-implemented status-score formula (match/discrepancy/pm-higher), operating on the old `workPackages.js` WP list — distinct from both `siteVisitService`'s formula and `pmAlignmentEngine`'s formula.

Neither is removed this wave (no-delete rule) — both marked `// TODO wave7` in the source.

## Legacy

- `pmAlignmentEngine.computePmAlignmentItemsLegacy()` — handles the old flat-column `reports` format (marked `@legacy` in Wave 7).
- `SiteVisitReport.jsx`'s legacy comparison view (`comparisonResult()` + `WORK_PACKAGES` from `workPackages.js`) — the non-Gantt fallback path, kept per the established dual-format pattern documented in `TEMPLATE_MODEL.md`.
