# Canonical Template Model — OpenDay

## Decision (Wave 4)

| Layer | File/Source | Role | Status |
|---|---|---|---|
| Domain seed | `domains/construction/templates/constructionRetailV1.js` | Defines all WPs, phases, weights for H&M/Retail construction | ✅ CANONICAL |
| Flatten adapter | `config/masterTaskLibrary.js` | Flat `WORK_PACKAGES`/`PHASES` lists derived from `constructionRetailV1`, plus lookup helpers (`getWPById`, `getPhaseById`, `getWPsByPhase`, `getScopedGanttWorkPackages`) | ✅ CANONICAL |
| Template → WP resolution | `config/projectTemplates.js` | Resolves a template choice (`standard_with_demo` / `standard_no_demo` / `custom`) to a concrete WP-id set. **Already built on top of `masterTaskLibrary`** (imports `PHASES`, `WORK_PACKAGES`, `getWPsByPhase`). Called directly by `engines/ganttEngine.js`'s `buildProjectWPs()` — the function that generates the Gantt schedule for every new project. | ✅ CANONICAL — **not legacy** (see note below) |
| DB templates | `src/data/templatesApi.js` + Supabase `templates` table | Persisted, project-pinned templates with copy-on-write versioning | ✅ CANONICAL |
| Legacy compat | `config/workPackages.js` | Old (pre-Gantt) weekly-report WP list, flat task-name vocabulary (e.g. `"HVAC ducts"`, `"Electrical conduits & cabling"`). Still the active fallback path when a project has no Gantt schedule (see `ContractorReport.jsx`/`SiteVisitReport.jsx` header comments). | ⚠️ LEGACY — kept as fallback, do not import in new Gantt-based code |
| Legacy compat | `config/reportWeights.js` | Even older status/phase weights, 4-phase model (`Demolition works` / `Construction works` / `Testing & Commissioning` / `Handover`) with its own flat task-name vocabulary. Used only by `reportUtils.computeCumulativeStatuses()` and `pmAlignmentEngine`/`dashboardConstants` for that same old shape. | ⚠️ LEGACY — kept for historical/compat calculations only |

## ⚠️ Correction vs. the original wave plan

The wave-4 brief assumed `projectTemplates.js` was legacy-only ("DO NOT import for new project creation flows"). That is **incorrect**: `engines/ganttEngine.js:64` calls `resolveTemplateWPs()` from this file inside `buildProjectWPs()` — the core function that generates the Gantt schedule for **every new project** (called from `Projects.jsx`, `seed.mjs`, etc.). Marking it deprecated would misdirect future work. It is documented above as CANONICAL instead.

## Rules

1. New engines MUST read WP definitions from `constructionRetailV1` or `masterTaskLibrary`.
2. New pages MUST NOT import from `workPackages.js` or `reportWeights.js`.
3. `projectTemplates.js` remains a legitimate import for template→WP-scope resolution (Gantt generation, template presets UI). It is not a deprecation target.
4. `openingReadinessEngine.js` TODO: replace its `workPackages.js` import with `constructionRetailV1`/`masterTaskLibrary` (Wave 4, Step 4.5).
5. DB `templates` (via `templatesApi.js`) is canonical for project-pinned custom template persistence (copy-on-write).

## Known remaining `workPackages.js` / `reportWeights.js` importers (not touched this wave)

Out of scope for Wave 4 (the wave brief only targets `openingReadinessEngine.js` for the engine layer); listed here for future waves:

- `engines/legacyReportEngine.js`, `engines/pmAlignmentEngine.js`, `engines/projectSummaryEngine.js`,
  `engines/siteVisitEngine.js`, `engines/progressDeltaEngine.js` — still import `workPackages.js`.
- `utils/reportUtils.js` — imports both `workPackages.js` and `reportWeights.js` (its `computeCumulativeStatuses()` is the actual consumer of the old 4-phase model).
- `components/weekly/*` (`PhaseTimeline.jsx`, `PhaseStepper.jsx`, `sharedUtils.js`, `shared.jsx`) and `pages/WeeklyReports.jsx`, `pages/ContractorReport.jsx`, `pages/SiteVisitReport.jsx` — the old (non-Gantt) weekly-report UI flow, kept as the fallback path for projects without a generated Gantt schedule.

## `getScopeWPIds()` is the single entry point

All progress/risk/readiness calculations resolve active WPs through:

```js
getScopeWPIds(project.scope, canonicalWorkPackages)
```

where `canonicalWorkPackages` = `masterTaskLibrary.WORK_PACKAGES` or `constructionRetailV1.workPackages`. See `SCOPE_MODEL.md` (Wave 5) for the full scope-authority model.
