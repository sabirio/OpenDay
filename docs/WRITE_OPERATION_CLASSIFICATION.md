# Write operation classification

| Operation | Tier | Reason |
| --- | --- | --- |
| Contractor Report submit | Tier 1 | report, items, history and Gantt must commit together |
| PM Site Visit submit | Tier 1 | header, observations, discrepancies, history/cache must commit together |
| Project create/update/delete | Tier 2 | important entity mutation; DB authorization/audit required |
| Template/scope/assignment/role mutation | Tier 2 | authorization and predictable conflict handling required |
| Photo upload/link/delete | Tier 3 | Storage and SQL require controlled compensation, not fake atomicity |

Tier 1 receives implementation priority. Tier 2 remains on existing single-row/RLS paths unless a proven defect blocks integrity. Tier 3 receives a documented pending/finalize/cleanup model; no production deletion is automated in this sprint.

