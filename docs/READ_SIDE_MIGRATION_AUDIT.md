# Sprint 3 read-side migration audit

Audit date: 2026-07-10. Based on current production imports and call sites after Sprint 2; no database connection was made.

## Consumer inventory

| Consumer | Current calculation source | Canonical readiness | Local calculations | Write-side impact | Migration risk |
| --- | --- | --- | --- | --- | --- |
| Dashboard rows | `useAllRows` → `evaluateProjectState` | Ready: same raw inputs available | filtering/sorting only | None | Medium |
| Dashboard cards/summary | `buildDashboardModel`, portfolio engines over rows | Ready after rows migrate | portfolio aggregates | None | Medium |
| Project Detail Drawer | canonical orchestrator compatibility summary | Migrated Sprint 2 | none | None | Low |
| Home | shared `allRows`, `homeDashboardModel` | Ready with shared rows | portfolio aggregates/insights | None | Medium |
| Portfolio | portfolio engines over `allRows`; `computePortfolioMissing` still replays raw reports | Partial | aggregate calculations permitted | None | Medium |
| Weekly Reports list | weekly model + `computePortfolioMissing` | Needs historical/current adapter | chronology/latest/progress orchestration | Submit remains separate | High |
| Weekly Report detail | weekly review + report impact engines | Partial | historical report-specific calculations | None | High |
| Risk Dashboard | canonical candidate rows plus `computeRiskRowsModel` | Partial | risk dimensions/trends and alignment still use raw inputs | None | High |
| Opening Readiness UI | readiness embedded in `allRows` | Ready with orchestrator rows | presentation only | None | Medium |
| Project Summary | canonical orchestrator compatibility output | Migrated | none | None | Low |
| Print/PDF | current page/DOM print values | Needs report view model | date/formatting | Export mechanism unchanged | Medium |
| Contractor Report read-side | context/load + form prefill | Partial | draft/form state | **OUT OF SCOPE write path** | High |
| PM Site Visit read-side | Gantt/context + observation form | Partial | interactive comparison preview | **OUT OF SCOPE write path** | High |

## Runtime dependency map

| Module/function | Production consumers | Test consumers | Canonical replacement | Removable now |
| --- | --- | --- | --- | --- |
| `evaluateProjectState` | `useAllRows`; Canonical Core adapter | project-state and project-summary tests | `runOpenDayOrchestrator` | No; must become compatibility-only first |
| `progressEngine` | canonical core, submit, report/risk/portfolio/history paths | extensive | canonical progress for read-side; direct use retained write/history | No |
| `portfolioEngine` | dashboard/home/weekly models | portfolio tests | aggregate over canonical rows | Partially |
| legacy progress utilities in `reportUtils` | progress engine plus legacy adapters | many | progress engine/canonical boundary | No; mixed load-bearing module |
| `reportWeights` / `workPackages` | allowlisted historical report/runtime fallbacks | guard/legacy tests | templates/master library | No; historical compatibility consumers remain |
| discrepancy/alignment engines | submit preview/write, risk, summary | extensive | canonical discrepancy + explicit sign adapter | No |
| readiness engine | project-state and summary compatibility paths | readiness tests | snapshot input adapter through orchestrator | No |
| risk engine | project-state, risk row, summary, home | risk tests | canonical facts → compatibility rules | No |
| schedule utilities/engines | dashboard, reports, risk, gantt, forms | schedule/SPI tests | canonical schedule adapter | No; distinct semantics remain |

## Local calculation map

- Pages/components contain display sorting/filtering, date formatting, UI widths and portfolio timeline construction. The architecture guard already rejects formula-like reductions in pages/components.
- `Dashboard.jsx` sorts canonical candidate rows and builds calendar weeks; it does not calculate project progress.
- `RiskDashboard.jsx` sorts/filter rows and invokes core risk models; `PmAlignmentTab` still computes alignment items from raw visits/reports.
- `WeeklyReports` delegates main progress to read models but `computePortfolioMissing` reselects latest reports and recalculates progress.
- `ProjectCard`, `StatusMatrix`, `OverviewTab` read already-derived row facts.
- `DashboardWidgets` and `PrintHeader` use system time for view-only display; project-fact time must come from orchestrator.

## Canonical public boundary and tests

- Public API: `src/core/canonical/index.js`.
- Contracts: `src/core/canonical/types.js`.
- Orchestrator output: snapshot, progress, discrepancy, schedule, readiness, risks, warnings, calculatedAt and explicit compatibility payload.
- Sprint 2 equivalence: five fixtures, 45 canonical checks, Project Summary full-output comparison.
- Architecture guard prevents production consumers from importing Canonical Core internals.

## Write-side boundary — OUT OF SCOPE FOR SPRINT 3

- Contractor reports: `core/contractorReport/submitContractorReportModel.js`, `buildContractorReportSubmission.js`, `services/contractorReportService.js`, RPC `submit_contractor_report`.
- Site visits/discrepancy persistence: `core/siteVisit/submitSiteVisitModel.js`, `services/siteVisitService.js`, `ganttService.updateGanttDiscrepancy`.
- Progress history: contractor RPC/migrations and `projectService` reads; migration backfill is operational history tooling.
- Projects/Gantt: create/update/delete/project date and Gantt persistence services.
- Photos: `photoService.js` and upload hooks/components.
- Admin profile writes: `AdminUsers.jsx` (unrelated to calculation migration).

No Sprint 3 migration may change these calls, payloads, transactions, stored discrepancy sign, schema, RLS or migration files.

