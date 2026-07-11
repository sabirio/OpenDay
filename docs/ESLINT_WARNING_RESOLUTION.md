# ESLint Warning Resolution

| Stage | Errors | Warnings |
| --- | ---: | ---: |
| Sprint 5 initial | 0 | 32 |
| Contractor block | 0 | 30 |
| PM Site Visit block | 0 | 26 |
| Phase 4 (this pass) — final | 0 | **0** |

The 26→0 pass re-verified the actual warning list fresh (not carried over
from the table above) rather than assuming the prior stage's count was
still accurate — confirmed 26 = 16 `no-restricted-imports` + 6
`react-hooks/set-state-in-effect` + 4 `react-hooks/exhaustive-deps`
before starting.

## Category A/B — React Hooks correctness (10 warnings, 9 fixed + 1 documented disable)

| # | Rule | File | Before | Fix |
|--:|---|---|---|---|
| 1 | `set-state-in-effect` | `hooks/useWeeklyGanttTasks.js` | `setLoading(true)` synchronous at top of effect | Consolidated `tasks`/`loading` into one `{key, tasks}` state; `loading` is now derived (`key !== projectId`) instead of an imperative flag. Also fixed `resizeTask`'s setter accordingly. |
| 2 | `set-state-in-effect` | `hooks/useProjectAuditLog.js` | Same pattern, 3 separate state vars | Same consolidation: `{key, logs, error}`, all 3 outputs derived from key match. |
| 3 | `set-state-in-effect` | `pages/RiskDashboard.jsx` | `setGanttSpiLoading(true)` at top of a 3-way `Promise.all` effect, **and no `alive`/cancellation guard at all** | Consolidated `projectTrends`/`discHistory`/`reliabilityMap`/loading into `{idsKey, ...}`; added the missing `alive` guard — a real correctness fix (a stale response for a since-changed project set could previously overwrite fresher state), not just a lint fix. |
| 4 | `set-state-in-effect` + `exhaustive-deps` | `pages/WeeklyReports.jsx` | `setActiveTemplate(null)` at top of effect; deps `[selectedProject?.id, selectedProject?.templateId]` didn't cover the direct `if (!selectedProject)` read | Consolidated to `{key, template}`; effect now reads only two primitives (`resolvedProjectId`/`resolvedProjectTemplateId`), not the `selectedProject` object itself (which is a fresh reference every render from two different code paths) — satisfies exhaustive-deps without re-triggering on irrelevant object-identity churn. |
| 5 | `set-state-in-effect` | `pages/WeightAudit.jsx` | `setTemplate(null)` unconditionally at top, then conditionally fetch | Split into a directly-derivable case (`mode==='project'` with no `templateId` → `template` is `null`, no effect needed at all) and a fetch-needing case (`{key, template}` pattern, same as above). |
| 6 | `set-state-in-effect` | `App.jsx` (logout reset) | 8 `setX()` calls inline in the effect's `if (!isAuthenticated)` branch | This one is pure synchronous local-state reset with no async/external work — moved out of the effect entirely, into React's own documented "adjust state when a prop changes" render-time pattern (guarded by a `prevIsAuthenticated` comparison so it still fires exactly once per transition). Confirmed via an isolated test that extracting to a named function alone doesn't satisfy the rule reliably (shape-sensitive), so this is a structural fix, not a rename. |
| 7 | `exhaustive-deps` | `hooks/useWeeklyReportReviewModel.js` | deps listed 9 individual `input.x` fields but the callback received the whole `input` object | Reads/destructures the same 9 fields and reconstructs an equivalent object for the call (confirmed via reading `buildWeeklyReportReviewModel`'s signature that these are the *only* 9 fields it uses) — satisfies exhaustive-deps without recomputing on every caller-side object literal. |
| 8 | `exhaustive-deps` | `hooks/useGanttMetrics.js` | Missing `containerW`/`layout`... — wait, this was actually the *other* missing-deps case: `ganttMetrics.size` read in a guard, not listed | Replaced the `ganttMetrics.size > 0` "already loaded" guard — which had a real, separate pre-existing bug (switching to a *different* project set while stale metrics were cached from a prior set would never re-fetch, since size was already > 0) — with a proper `idsKey`-based cache key. `projects` stays in the deps array (same as before); the internal key-match guard makes redundant re-renders a no-op instead of skipping legitimately-needed re-fetches. |
| 9 | `exhaustive-deps` | `components/GanttChart.jsx` | Missing `containerW`/`layout` in a "scroll to today on zoom change" effect | **Documented disable, not fixed** — see below. |
| — | `exhaustive-deps` | `pages/WeeklyReports.jsx` | (same effect as #4) | Resolved as a side effect of #4's restructuring. |

### #9 — the one justified `eslint-disable` in this category

`GanttChart.jsx`'s "scroll to today" effect deliberately depends only on
`[layout?.chartWidth, zoom]`, not the full `layout`/`containerW` values it
reads inside. This is intentional: `layout` is recomputed on every
task/progress edit (a separate `useMemo`), and including it (or
`containerW`, which `layout` is derived from) as a dependency would yank
the user's current scroll position back to "today" on every unrelated
data change — clearly not the intended UX (the whole point of the narrow
dependency list is "only recenter when zoom or the timeline's actual
scale changes"). Mechanically adding the missing deps would be a real UX
regression, not a fix. Documented inline with the full reasoning; disable
is scoped to this one line only.

## Category G — legacy compatibility imports (16 warnings, all resolved via documented disable, not migration)

All 16 `no-restricted-imports` warnings (13 files, `config/workPackages`
and/or `config/reportWeights`) were **not migrated** — they were resolved
via a targeted, documented `eslint-disable-next-line` on each import line.

This was a deliberate call, not the default choice: this project's own
`src/tests/architectureGuard.test.mjs` already contains a formally
audited `ALLOWED_LEGACY_IMPORTERS` allowlist listing these exact 13
files, with its own header explaining each is "guarded behind
`ganttTasks.length === 0` / `isWPReport()` / `!visit.wps` /
`@legacy`-marked code paths" — i.e. these are intentional, live,
previously-reviewed legacy-report-compatibility fallback paths, not
accidental debt. Migrating any of them to the canonical
`masterTaskLibrary`/`constructionRetailV1` modules would mean rewriting
real legacy-report display/calculation behavior — squarely inside this
task's hard constraints ("не менять business semantics", "не менять
Canonical Core", "не менять progress formulas"). Doing that as a side
effect of an ESLint cleanup would be exactly the kind of unauthorized
scope expansion the task prohibits.

Each disabled line carries its own comment citing
`architectureGuard.test.mjs`'s `ALLOWED_LEGACY_IMPORTERS` as the source of
truth, rather than inventing new per-file justification — so a future
migration effort (if one is ever undertaken) has one place to check,
consistent with how the architecture guard itself already tracks this.

This is the one place in this pass where the task's aspirational "0
warnings without suppressions" and its own hard constraints
("no Canonical Core / business-semantics changes") were in direct
tension — the hard constraints won. Flagged explicitly here rather than
silently choosing one and not mentioning the conflict.

## Regression discipline

Ran after every category (not just at the end): `npm test` (76/76,
1822/1822 throughout, no change), `npm run typecheck` (clean throughout),
`npm run check:architecture` (25/25 throughout — the legacy-import
disables do not touch the allowlist itself, so this guard's own checks
are unaffected), `npm run build` (clean throughout). Also re-ran the
live Playwright specs (`mobile-field-workflows.spec.js`,
`dialog-accessibility.spec.js`, `error-state-sanitization.spec.js` — 13
tests) after the hooks refactoring, plus an ad-hoc smoke check of the
three pages whose data-loading hooks changed but weren't otherwise
covered (Weekly Reports, Risk Dashboard incl. the Gantt SPI tab, Weight
Audit) for console/page errors — all clean (one pre-existing, unrelated
`fetchActiveTemplate` `PGRST116` console error was confirmed to be a
local-fixture data-completeness artifact — no active template row seeded
— not a regression from this pass).

## Final state

```
npm run lint  ->  0 errors, 0 warnings
```
