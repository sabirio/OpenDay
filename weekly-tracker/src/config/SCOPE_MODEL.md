# Project Scope — Canonical Model

## Decision (Wave 5)

| Field | Source | Role |
|---|---|---|
| `projects.scope` | Supabase `projects.scope` JSONB | ✅ CANONICAL selected scope |
| `project_gantt_tasks.is_archived` | Gantt table | ⚠️ Intended as a derived Gantt/UI flag, but **not currently kept in sync with scope removals** (see bug below) — NOT a scope source |
| `progress_history.snapshot.effective_weights` | History table | ⚠️ FROZEN snapshot — historical only |

## Rules

1. Active WPs for a project = `getScopeWPIds(project.scope, canonicalWorkPackages)` (`src/core/projects/scope/getScopeWPIds.js`) — a pure function, parameterized on the WP list, with no hardcoded data source. All current callers pass `masterTaskLibrary.WORK_PACKAGES`.
2. `is_archived` on Gantt tasks reflects scheduling state, NOT scope authority. Never filter active WPs by `is_archived` alone for progress/risk/SPI calculations — use `scope` (via `getScopeWPIds`) instead.
3. All progress/risk/readiness/SPI calculations MUST resolve WPs through `getScopeWPIds()` (or an equivalent scope-aware filter), not through `is_archived`.

## Scope shape

```json
{
  "workPackages": ["demolition", "construction", "fitout", "testing", "handover"],
  "weightOverrides": { "testing": 0.12 }
}
```

`getScopeWPIds()` also supports an optional `phases` key (`scope.phases`) to filter by phase instead of/in addition to individual WP ids.

## 🐛 Bug found and fixed (Wave 5, Step 5.4): SPI/critical-path ignored scope removal

`engines/spiEngine.js`'s `computeSPIFromTasks()` and `computeCriticalHealth()` filtered their working task set **only** by `!t.is_archived`. Auditing how `is_archived` actually gets set (Step 5.1) found:

- `ganttService.addWPToScope()` / `removeWPFromScope()` — the only functions that ever write `is_archived` in response to a scope change — are **never called anywhere in the codebase** (dead code).
- `generateAndSaveGantt()` / `regenerateGantt()` only `upsert()` rows for WPs in the **current** scope. A WP removed from scope simply stops being upserted — its existing `project_gantt_tasks` row is left untouched, still `is_archived: false`, forever.

Net effect: **removing a WP from a project's scope did not exclude it from SPI or critical-path-health calculations.** The stale task kept influencing both metrics indefinitely.

**Fix:** `computeSPIFromTasks(tasks, referenceDate, scopeWPIds)` and `computeCriticalHealth(tasks, referenceDate, scopeWPIds)` now accept an optional `scopeWPIds` (from `getScopeWPIds(project.scope, GANTT_WPS)`) and filter `!t.is_archived && (!scopeWPIds || scopeWPIds.includes(t.wp_id))`. `scopeWPIds` defaults to `null` (= no additional filtering) so existing callers that don't yet pass it are unaffected; call sites were updated to pass it where the project/scope was available. This does not change the SPI/critical-health arithmetic — only which tasks are included as input.

**Update (F-03 fix, diagnostic-audit follow-up):** `regenerateGantt()` now archives any previously-active row whose WP fell out of the newly-computed scope itself, right after its upsert — the real fix flagged above as a future pass. `addWPToScope()` / `removeWPFromScope()` were never wired into that flow (both remained dead code, zero callers) and were deleted in the dead-code cleanup pass rather than adopted, since building the archive logic directly into `regenerateGantt()` (the function that actually runs on every scope-affecting save) was the more minimally-invasive fix.

## Known duplication (not a bug, not fixed this wave)

`config/masterTaskLibrary.getScopedGanttWorkPackages(scope)` independently re-implements the same `scope.phases`/`scope.workPackages` filtering logic as `getScopeWPIds()`, returning a different (phase-grouped, task-labeled) shape for legacy-style display consumers (`WeeklyReports.jsx`). Both correctly read from canonical `project.scope` — this is a duplicate implementation, not a wrong-source bug. Worth consolidating in a future pass.
