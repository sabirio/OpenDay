# UI State Matrix

Audit date: 2026-07-11. Evidence labels distinguish browser tests from source inspection.

| Screen | Loading | Empty | Error / retry | Stale refresh | Evidence |
| --- | --- | --- | --- | --- | --- |
| Login/Auth | Auth progress without business metrics | N/A | Sanitized credential message; input retained | Session restoration does not replace visible data | Browser + tests |
| Projects | Loading state before project cards/table | No-project action | Global sanitized load error and retry | Last project list retained during refresh | Browser error injection + source |
| Dashboard | Global/project load gate prevents false 0% | Contextual no-data state | Sanitized load failure | Existing project state remains visible | Tests + source |
| Risk Dashboard | Loading separated from computed zero risks | No risks after successful load | Read retry only | Previous risk rows retained | Tests + source |
| Contractor Reports/history | Schedule/report loading is explicit | No reports / no scoped WPs distinct | Alert, preserved draft, stable request-id retry | Draft remains local | Production-preview browser |
| PM Site Visits/history | Source and Gantt loading explicit | No visits / filter result distinct | Alert, preserved observations, stable retry | Draft recovery restores filter/position | Production-preview browser |
| Opening Readiness | Load gate before readiness output | Insufficient-data explanation | Read failure is not a readiness value | Previous snapshot retained | Tests + source |
| Gantt | Status/loading UI; no fictional schedule | Empty schedule message | Safe read retry | Current chart remains during refresh | Tests + source |
| Project Detail/Editor | Async detail/template loading | Missing optional sections labeled | Sanitized save error; edits preserved | Reopen reloads baseline | Modal browser tests + source |

Loading uses status semantics where implemented; errors use alert semantics on critical surfaces. Empty results are shown only after successful reads. Full network-injected stale-state coverage across every row remains an accepted non-blocking test-depth limitation.
