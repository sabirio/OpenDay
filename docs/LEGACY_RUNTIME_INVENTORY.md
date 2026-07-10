# Legacy runtime inventory

| Module | Type | Previous consumers | Current consumers | Replacement | Status |
| --- | --- | --- | --- | --- | --- |
| `evaluateProjectState` | compatibility adapter | `useAllRows`, canonical orchestrator, tests | canonical orchestrator, tests | `runOpenDayOrchestrator` | COMPATIBILITY ONLY |
| `computePortfolioMissing` | deprecated runtime calculation | Weekly Reports | none | `computeCanonicalMissingSummary` | REMOVED |
| `riskEngine.computeTrend` raw replay | deprecated runtime calculation | Risk row model | compatibility export backed by `riskCompatibilityEngine` | canonical progress-history replay in future | COMPATIBILITY ONLY |
| `riskCompatibilityEngine` | compatibility adapter | N/A | canonical orchestrator and risk trend | canonical risk facts/history | ACTIVE TEMPORARY |
| `projectSummaryEngine` | compatibility adapter | drawer model/tests | canonical orchestrator/tests | canonical report/view facts | COMPATIBILITY ONLY |
| `workPackages.js` | deprecated runtime configuration | historical report/site-visit fallback consumers | explicit allowlist | master library/domain templates | DEPRECATED |
| `reportWeights.js` | deprecated runtime calculation/config | historical report calculations | explicit allowlist | canonical template weights | DEPRECATED |
| `legacyReportEngine.js` | compatibility adapter | Weekly historical reports | Weekly historical reports | historical canonical replay | COMPATIBILITY ONLY |
| `001`–`009` migrations | historical migration | database history | database history | none | DO NOT REMOVE — MIGRATION HISTORY |
| canonical fixtures | test fixture | tests | tests | none | TEST ONLY |
| `src/core/canonical/*` | active canonical module | read side | read side | none | ACTIVE |

Deletion criteria for compatibility modules: zero production imports, equivalent historical replay where needed, targeted tests, guard update, full build. Historical migrations are never runtime-removal candidates.

