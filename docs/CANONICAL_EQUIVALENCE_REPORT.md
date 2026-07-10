# Canonical equivalence report

Comparison tolerance: 0.01 percentage point. Fixtures and executable assertions are in `src/core/canonical/__tests__`.

| Scenario | Metric | Previous result | Canonical result | Difference | Status | Explanation |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Normal | overall progress | 50 | 50 | 0 | MATCH | Existing scoped `progressEngine` is reused |
| Normal | PM progress | N/A | 40 | N/A | EXPECTED NORMALIZATION DIFFERENCE | No previous official project aggregate; active-scope mean of existing PM observations |
| Normal | discrepancy | N/A | +10 | N/A | EXPECTED NORMALIZATION DIFFERENCE | New explicit sign is contractor − PM |
| Partial scope | overall progress | 75 | 75 | 0 | MATCH | Excluded WP is not counted; existing effective reweighting is reused |
| Partial scope | discrepancy | N/A | 0 | N/A | EXPECTED NORMALIZATION DIFFERENCE | Both canonical facts are 75 |
| Missing data | overall progress | 0 | 0 | 0 | MATCH | Display baseline retained; contractor/PM facts are separately `null` |
| Conflicting | overall progress | 90 | 90 | 0 | MATCH | Latest cumulative contractor state retained |
| Conflicting | PM progress | N/A | 40 | N/A | EXPECTED NORMALIZATION DIFFERENCE | Out-of-scope PM row is excluded |
| Invalid boundaries | overall progress | 50 | 50 | 0 | MATCH | Values clamp to 0/100 before the same weighted engine |
| Invalid boundaries | data quality | silent/inconsistent | warnings | N/A | KNOWN LEGACY DEFECT | Negative area, invalid date, duplicate id and clamping are visible warnings |
| All scenarios | readiness | existing engine output | same object/output | 0 | MATCH | Compatibility adapter, no formula change |
| All scenarios | risk | existing engine output | same object/output | 0 | MATCH | Compatibility adapter, no formula change |

No unresolved overall-progress difference was observed. Project-level PM progress/discrepancy had no prior official aggregate contract, so these are not represented as legacy numeric matches. Persisted per-WP discrepancy semantics remain unchanged.

## Sprint 3 consumer equivalence

| Consumer/scenario | Previous | Canonical | Difference | Status |
| --- | --- | --- | --- | --- |
| Dashboard normal progress | 50 | 50 | 0 | MATCH |
| Dashboard normal risk | legacy raw preparation | canonical compatibility preparation | 0 | MATCH |
| Dashboard normal readiness | direct compatibility path | orchestrator output | 0 | MATCH |
| Dashboard missing project | 0 / missing | 0 / missing | 0 | MATCH |
| Home/Portfolio average, 50 + missing | 25 | 25 | 0 | MATCH |
| Project Detail | full previous summary | reused orchestrator compatibility summary | 0 | MATCH |
| Weekly Reports current progress | shared row progress | canonical progress | 0 | MATCH |
| Readiness all five fixtures | existing engine | same compatibility output with fixed time | 0 | MATCH |
| Risk all five fixtures | existing rules | same compatibility rules/input adapter | 0 | MATCH |
| Print read model | page-derived facts | canonical object references | N/A | MATCH BY SOURCE |
