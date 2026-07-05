# Canonical Template Model — OpenDay

## Decision (Wave 4)

| Layer | File/Source | Role | Status |
|---|---|---|---|
| Domain seed | `domains/construction/templates/constructionRetailV1.js` | Defines all WPs, phases, weights for H&M/Retail construction | ✅ CANONICAL |
| Flatten adapter | `config/masterTaskLibrary.js` | Flat `WORK_PACKAGES`/`PHASES` lists mirroring `constructionRetailV1` (same ids/labels/phaseIds), plus lookup helpers (`getWPById`, `getPhaseById`, `getWPsByPhase`, `getScopedGanttWorkPackages`). **Correction (Wave 4.5):** despite the "flatten adapter" name and its own header comment claiming to be derived, this is a **hand-maintained parallel literal**, not a programmatic `.flatMap()`/derivation of `constructionRetailV1` — the two files must be kept in sync manually. Confirmed when adding `openingBlocker` to `constructionRetailV1` required no corresponding code change here. | ✅ CANONICAL (but see drift risk note) |
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
4. ✅ DONE (Wave 4.5): `openingReadinessEngine.js` reads `constructionRetailV1` directly — see section below.
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

## openingReadinessEngine canonical source (Wave 4.5)

- **Source:** `constructionRetailV1.js` → `openingBlocker: 'critical' | 'soft' | false` field on each of the 32 WPs (product-owner-approved classification: 12 × `'critical'`, 2 × `'soft'`, 18 × `false`).
- **Granularity change:** the old `workPackages.js` model stored `openingBlocker` on individual *tasks* within a WP (`wp.tasks[].openingBlocker`); the new model stores it directly on the *WP* itself, one value per WP.
- **Consolidation (business decision, not a gap):** four legacy "soft"/"critical" concepts with no separate canonical WP — Fire alarm testing, Security/access control testing, IT/POS integration testing, BMS commissioning — are consolidated into `comm.full_test: 'critical'`. Two more — Certificates & warranties, Authority approvals & permits — are consolidated into `handover.inspection: 'critical'`.
- **Legacy source removed:** `workPackages.js` is no longer imported by `openingReadinessEngine.js`.
- **Keying fix (found during implementation, not in the original wave brief):** `buildBlockerMap()` must key its output map by **`wp.phaseId`** (e.g. `"testing"`), not `wp.id` (e.g. `"test.electrical"`). The real `wpCumulativeStatuses.workPackageStatuses` shape produced by `mergeGanttWPStatuses()` (`utils/reportUtils.js`) is `{ [phaseId]: { [wpLabel]: {status,progress} } }` — phase-keyed outer, WP-label-keyed inner. `wp.id` never appears as a key in that structure. Keying by `wp.id` (as a literal reading of the original brief would have done) would make every blocker lookup silently return `null` — no blockers ever detected, regardless of real site status. Verified empirically with an isolated logic check before committing (fire-test / plumbing-test scenario) — see commit for details.
- **`masterTaskLibrary.js` propagation:** not needed. Nothing reads `openingBlocker` from `masterTaskLibrary.WORK_PACKAGES` — the engine reads `constructionRetailV1` directly, bypassing `masterTaskLibrary` for this field entirely.
- **Tests:** no dedicated `openingReadinessEngine` test file exists. TODO for a future pass — not added in this PR (out of scope per wave rules).
- Date resolved: 2026-07-05

## masterTaskLibrary sync risk (Wave 4 backlog)

- `masterTaskLibrary.WORK_PACKAGES` is a manually maintained literal, NOT a programmatic derivation from `constructionRetailV1`.
- Risk: any new field added to `constructionRetailV1` WPs must be manually propagated to `masterTaskLibrary`.
- **Verified (2026-07-05):** the `openingBlocker` field added in Wave 4.5 (`60c77ee`) is confirmed **absent** from `masterTaskLibrary.WORK_PACKAGES` — a real gap, not just a theoretical risk.
- **Verified (2026-07-05):** no consumer of `masterTaskLibrary.WORK_PACKAGES` reads `.openingBlocker` — grepped the whole `src/` tree; the only consumer of `.openingBlocker` anywhere is `openingReadinessEngine.js` itself, which reads `constructionRetailV1` directly and never touches `masterTaskLibrary` for this field. **No action required before Wave 6** — the gap is inert today.
- If a future consumer of `masterTaskLibrary.WORK_PACKAGES` needs `openingBlocker`, add the field there at that time (re-check this section first — this codebase has already shown a pattern of doc claims going stale, e.g. the "flatten adapter" mislabel corrected in Wave 4.5).
- Long-term fix (P2, not scheduled): refactor `masterTaskLibrary` to derive its WP list from `constructionRetailV1` programmatically (e.g. `constructionRetailV1.phases.flatMap(...)`), eliminating the dual-maintenance risk permanently.
