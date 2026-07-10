# Read-side canonical architecture

## Runtime flow

```text
service-adapted project/report/visit arrays
→ buildCanonicalProjectRows (once per project per memoized input set)
→ runOpenDayOrchestrator
→ canonical snapshot/progress/discrepancy
→ compatibility schedule/readiness/risk rules
→ attached row.canonical result
→ Dashboard / Home / Weekly Reports / Risk models
```

Dashboard and Home share `useAllRows`; the hook delegates to `dashboardProjectRowsModel` and never invokes legacy `evaluateProjectState` directly. Project Detail reuses the attached orchestrator result and does not run it again. Weekly Reports obtains current chronology/latest/progress from the same result; its report-date detail calculations remain explicitly historical adapters.

Portfolio engines may aggregate canonical project facts but may not import project progress calculators. Risk rules receive canonical current progress and prepared compatibility PM facts; historical trend replay remains isolated in `riskCompatibilityEngine`.

Opening Readiness receives canonical active scope plus the single orchestration timestamp. Print/PDF has `buildProjectReportViewModel(orchestratorResult)`; the existing browser-print mechanism remains unchanged.

## Time model

`runOpenDayOrchestrator(raw, { calculatedAt })` validates or creates one ISO timestamp. It is propagated through snapshot, planned progress, current/previous schedule comparison, freshness, missing-report status, confidence, readiness, contractor schedule score, risk and Project Summary. Invalid input is replaced at the entry point with an explicit warning.

## Compatibility boundaries

- `evaluateProjectState`: private compatibility composition used only by Canonical Core.
- `projectSummaryEngine`: compatibility output shape for the existing drawer.
- `riskCompatibilityEngine`: raw historical/item-level preparation required to retain established risk semantics.
- historical Weekly Report impact: report-date replay, not current project state.
- write-side submit/persistence paths: outside this architecture.

