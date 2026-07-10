# Canonical Core audit

Audit date: 2026-07-10. Evidence: runtime imports/exports/call sites, tests, services, schemas, migrations, pages, hooks and existing architecture documentation. No production database was contacted.

## 1. Calculation inventory

| Metric / result | Function | File | Inputs | Consumers | Source-of-truth candidate | Duplicate |
| --- | --- | --- | --- | --- | --- | --- |
| Overall weighted progress | `calculateProjectProgress`, `calculateProjectProgressResult` | `src/engines/progressEngine.js` | cumulative WP statuses, scope, template | project state, contractor submit model, risk/portfolio/migration utilities | Existing progress engine | Re-orchestrated in risk trend, portfolio missing, report impact |
| Contractor progress | same + `computeWPCumulativeStatuses` | progress engine + `reportUtils.js` | contractor reports | Dashboard/Home/Weekly Reports/submit | Canonical progress wrapper over existing engine | Several callers choose/sort reports themselves |
| PM verified progress | per-WP `observed_progress`; comparison functions | `discrepancyEngine.js`, `pmAlignmentEngine.js`, `siteVisitEngine.js` | latest visit + referenced GC report | PM results, Risk, Weekly Reports | Canonical active-scope PM aggregate; existing per-WP functions retained | No previous official project-level PM aggregate |
| Planned progress | `computeExpectedPct`, `computePlannedPct`, Gantt planned average | `scheduleUtils.js`, `spiEngine.js`, `ganttService.js` | project dates or task dates | risk, SPI, dashboard | Compatibility schedule output | Calendar and task/Gantt semantics intentionally differ |
| WP/phase progress | `calculateActivityProgress`, `calculatePhaseProgress` | `progressEngine.js` | WP entries + duration weights | progress/project summary | Existing progress engine | Legacy `computePackageProgress` fallback |
| Zone/category weights | `computeZoneWeights`, `computeZonedEffectiveWeights`, `buildV2ProgressTemplate` | `zonedWeightsEngine.js`, core project weights | area, active zones/categories | v2 progress/readiness/forms | Existing zoned weights engine | UI previews consume core models, not formulas directly |
| Effective WP weights | `computeEffectiveWeights`, `normalizeWeightsTo100` | `templateWeightsEngine.js` | template, active scope | progress, Weight Audit, templates | Existing template weights engine | legacy report weights remain for historical format |
| Discrepancy | `computeWPObservationDiscrepancy`, `calculateDiscrepancy`, `classifyDiscrepancy` | `discrepancyEngine.js` | GC/PM progress/status | submit adapter, PM UI, tests | Canonical discrepancy result for project aggregate; existing per-WP persistence unchanged | Thresholds differ: persisted WP 20/10 vs generic >25/10 |
| Alignment/confidence | `computePmAlignmentItems`, `computeConfidenceLevel`, contractor drift | `pmAlignmentEngine.js`, `contractorDriftEngine.js` | reports + visits | risk, health, contractor scores | Compatibility engines | Separate status-based and progress-based comparisons |
| Risk result | `computeProjectRiskScore` | `riskEngine.js` | project, raw reports, already-calculated progress, visits, readiness | project state, project summary, Risk Dashboard | Compatibility adapter in orchestrator | Risk trend recalculates historical progress; project summary also orchestrates risk |
| Opening readiness | `computeOpeningReadiness` | `openingReadinessEngine.js` | cumulative statuses, date, scope, template options | project state, project summary, command/insights | Compatibility adapter in orchestrator | Two callers construct v2/scope inputs separately |
| Schedule result | progress comparison, SPI, Gantt engines | `progressEngine.js`, `spiEngine.js`, `ganttEngine.js` | project/history/task dates | Dashboard, Weekly Reports, Risk | Compatibility schedule output | Calendar SPI and Gantt SPI are separate documented meanings |

Observed calculation paths: six progress orchestration paths (project state, submit, risk trend, portfolio missing, report impact, migration backfill), four discrepancy/alignment families, two readiness orchestration callers, and three schedule semantics (calendar expectation, Gantt task plan, report/history comparison).

## 2. Consumer map

| Consumer | Progress source | Risk source | Readiness source | Discrepancy source | Local calculations |
| --- | --- | --- | --- | --- | --- |
| Dashboard | `useAllRows` → `evaluateProjectState` | project state + dashboard model | project state | site-visit/contractor models | sorting/filtering/display only |
| Portfolio/Home | `useAllRows` | project/portfolio engines | project state/insights | contractor score | portfolio aggregation in engines |
| Project Summary drawer | previously `computeProjectSummary`; now canonical orchestrator compatibility output | orchestrator adapter | orchestrator adapter | project summary compatibility | none in model/UI |
| Weekly Reports | weekly review/report-impact models | report engine outputs | project/report outputs | site-visit engine | display selection; no overall recomputation |
| Contractor Report | submit model calls progress engine | N/A | N/A | N/A | write flow retained; form state only |
| PM Site Visit | submit model calls per-WP discrepancy | N/A | N/A | persisted per-WP discrepancy | write flow retained |
| Risk Dashboard | `useAllRows` + risk row model | risk engines | base project state | alignment/drift engines | view sorting/filtering |
| Opening Readiness UI | project state/read model | risk output | readiness engine via project state | N/A | presentation mapping only |
| PDF/print | receives page/view values | inherited | inherited | inherited | formatting only |
| Hooks | thin wrappers around core/presentation | forwarded | forwarded | forwarded | React memo/filter state only |
| Services | Supabase reads/writes and DB adapters | none intended | none | site-visit write delegates to engine model | no canonical orchestration; write paths unchanged |

## 3. Raw data sources

- Supabase: `projects`, `reports`, `contractor_reports`, `contractor_report_wps`, `site_visits`, `site_visit_wps`, `site_visit_discrepancies`, `project_gantt_tasks`, `progress_history`, `templates`, `audit_log`, profiles/invites and storage `site-photos`.
- RPC: `submit_contractor_report`; invite/auth helpers are not calculation inputs.
- Runtime: App/Auth context arrays, service-adapted camelCase records, form-local draft state for write screens.
- Static/domain sources: `constructionRetailV1`, `retailFitoutV2`, `masterTaskLibrary`, dependency rules, risk/threshold/weight config.
- Evidence: photo paths/metadata on reports and visits; canonical snapshot carries supplied evidence without deriving metrics.

## 4. Duplicate calculations and recommendation

- Progress formula is largely single-sourced, but report sorting, latest selection, cumulative-status construction and scope/template resolution occur in multiple orchestrators. Canonicalize those responsibilities in snapshot + progress wrapper while retaining `progressEngine` mathematics.
- PM discrepancy has incompatible sign/threshold conventions. Persisted site-visit WP delta is `PM − GC` with 20/10 thresholds; generic classifier uses magnitude >25/10. Canonical project aggregate explicitly uses `contractor − PM` and generic severity without changing stored rows.
- Project summary duplicated latest report/visit selection and readiness/risk orchestration. It is the first migrated consumer and now receives the canonical orchestrator's compatibility summary.
- Risk accepts calculated current progress, but recalculates historical progress for trend and derives PM mismatch from raw records. Keep as a compatibility adapter for Sprint 2.
- Readiness math itself is single-sourced; input resolution was duplicated between project state and project summary. Canonical orchestration now owns the migrated consumer path.

## 5. Current orchestrators

Before Sprint 2, `evaluateProjectState()` was the strongest per-project orchestrator. It takes one project plus already-filtered reports/visits and calls progress, risk, readiness, confidence, contractor and health engines. It does not normalize corrupt raw data, expose stable progress/discrepancy contracts, or own Supabase loading. Parallel paths remain in report impact, site-visit impact, portfolio state, project summary and write models.

Sprint 2 adds `runOpenDayOrchestrator(rawProjectData)` as the stable boundary. Schedule, readiness and risk outputs deliberately delegate to the existing `evaluateProjectState` compatibility path. Unmigrated pages still use existing orchestration.

## 6. Canonicalization risks

- Numeric strings, invalid dates, duplicate ids, negative area and out-of-range progress existed at service/schema boundaries with inconsistent treatment.
- `0` was often used for both measured zero and unavailable data; canonical results preserve nullable source facts while keeping `overallProgress` as the current 0 display baseline.
- Template resolution differs for v1 pinned templates and v2 area/category templates; both paths must remain explicit.
- Legacy `workPackages`/`reportWeights` fallbacks remain required for historical non-Gantt reports.
- Latest records were selected with several date keys and invalid-date behavior. Snapshot centralizes deterministic ascending sort and warnings.
- PM aggregate has no previous official project-wide contract. The new active-scope mean is documented as a new canonical view of existing observations, not a replacement for persisted per-WP discrepancy.
- Existing risk/readiness use the wall clock internally; their compatibility outputs are not fully deterministic under a supplied `calculatedAt` yet.

