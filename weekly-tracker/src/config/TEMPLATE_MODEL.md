# Canonical Template Model — OpenDay

## Decision (Wave 4)

| Layer | File/Source | Role | Status |
|---|---|---|---|
| Domain seed | `domains/construction/templates/constructionRetailV1.js` | Defines all WPs, phases, weights for H&M/Retail construction | ✅ CANONICAL |
| Flatten adapter | `config/masterTaskLibrary.js` | Flat `WORK_PACKAGES`/`PHASES` lists mirroring `constructionRetailV1` (same ids/labels/phaseIds), plus lookup helpers (`getWPById`, `getPhaseById`, `getWPsByPhase`, `getScopedGanttWorkPackages`). **Correction (Wave 4.5):** despite the "flatten adapter" name and its own header comment claiming to be derived, this is a **hand-maintained parallel literal**, not a programmatic `.flatMap()`/derivation of `constructionRetailV1` — the two files must be kept in sync manually. Confirmed when adding `openingBlocker` to `constructionRetailV1` required no corresponding code change here. | ✅ CANONICAL (but see drift risk note) |
| Template → WP resolution | `config/projectTemplates.js` | Resolves a template choice (`standard_with_demo` / `standard_no_demo` / `custom`) to a concrete WP-id set. **Already built on top of `masterTaskLibrary`** (imports `PHASES`, `WORK_PACKAGES`, `getWPsByPhase`). Called directly by `engines/ganttEngine.js`'s `buildProjectWPs()` — the function that generates the Gantt schedule for every new project. | ✅ CANONICAL — **not legacy** (see note below) |
| DB templates | `src/data/templatesApi.js` + Supabase `templates` table | Persisted, project-pinned templates with copy-on-write versioning | ✅ CANONICAL |
| Status scoring | `config/statusScores.js` | `WP_STATUS_SCORES`/`WP_STATUS_OPTIONS`/`getWPStatusScore`/`compareWPTaskStatus` — format-agnostic task-status→score vocabulary (`'Completed'/'In Progress'/'Not Started'/'Delayed'`). Scores both canonical Gantt-format and legacy WP-format statuses; extracted from `workPackages.js` (P1.1) because it was being imported unconditionally by canonical Weekly Reports rendering code despite living in the legacy file. | ✅ CANONICAL |
| Legacy compat | `config/workPackages.js` | Old (pre-Gantt) weekly-report WP list, flat task-name vocabulary (e.g. `"HVAC ducts"`, `"Electrical conduits & cabling"`). Still the active fallback path when a project has no Gantt schedule (see `ContractorReport.jsx`/`SiteVisitReport.jsx` header comments). Re-exports `config/statusScores.js` for its remaining legacy consumers. | ⚠️ LEGACY — kept as fallback, do not import in new Gantt-based code |
| Legacy compat | `config/reportWeights.js` | Even older status/phase weights, 4-phase model (`Demolition works` / `Construction works` / `Testing & Commissioning` / `Handover`) with its own flat task-name vocabulary. Used only by `reportUtils.computeCumulativeStatuses()` and `pmAlignmentEngine`/`dashboardConstants` for that same old shape. | ⚠️ LEGACY — kept for historical/compat calculations only |

## ⚠️ Correction vs. the original wave plan

The wave-4 brief assumed `projectTemplates.js` was legacy-only ("DO NOT import for new project creation flows"). That is **incorrect**: `engines/ganttEngine.js:64` calls `resolveTemplateWPs()` from this file inside `buildProjectWPs()` — the core function that generates the Gantt schedule for **every new project** (called from `Projects.jsx`, `seed.mjs`, etc.). Marking it deprecated would misdirect future work. It is documented above as CANONICAL instead.

## Rules

1. New engines MUST read WP definitions from `constructionRetailV1` or `masterTaskLibrary`.
2. New pages MUST NOT import from `workPackages.js` or `reportWeights.js`.
3. `projectTemplates.js` remains a legitimate import for template→WP-scope resolution (Gantt generation, template presets UI). It is not a deprecation target.
4. ✅ DONE (Wave 4.5): `openingReadinessEngine.js` reads `constructionRetailV1` directly — see section below.
5. DB `templates` (via `templatesApi.js`) is canonical for project-pinned custom template persistence (copy-on-write).

## Known remaining `workPackages.js` / `reportWeights.js` importers

Audited P1.1. `src/tests/architectureGuard.test.mjs` enforces this exact list — any new
importer (or an already-fixed file regressing) fails `npm test` until the allowlist there
is deliberately updated.

- `engines/legacyReportEngine.js`, `engines/pmAlignmentEngine.js`, `engines/projectSummaryEngine.js`,
  `engines/siteVisitEngine.js` — legacy-format branches only (guarded by `ganttTasks.length === 0` /
  `visit.wps.length === 0` / equivalent checks). `engines/progressDeltaEngine.js` was fixed in P1.1
  (its `WP_STATUS_SCORES` import moved to `config/statusScores.js`) and no longer appears here.
- `utils/reportUtils.js`, `config/dashboardConstants.js` — the `@legacy`-marked exports of these
  files still import both `workPackages.js` and `reportWeights.js`; their canonical exports
  (`isWPReport`, `mergeGanttWPStatuses`, `WP_COLS`, etc.) do not.
- `components/contractor/{formHelpers,LegacyWPSection,ReportingWorkPackagesSection,WorkPackageProgressSection}.js(x)`,
  `components/sitevisit/{ComparisonResultsView,gcReferenceHelpers,SiteVisitFormView}.jsx` — no-Gantt
  submit/comparison fallback branches for Contractor Report / PM Site Visit.
- `pages/WeeklyReports.jsx`, `pages/SiteVisitReport.jsx` — the old (non-Gantt) weekly-report UI flow,
  kept as the fallback path for projects without a generated Gantt schedule. `pages/ContractorReport.jsx`
  was fixed in P1.1 (delegates entirely to the subcomponents above, no direct import) and no longer
  appears here. `components/weekly/{PhaseTimeline,PhaseStepper,sharedUtils,shared}.jsx` were fixed in
  P1.1 (moved to `config/statusScores.js`) and no longer appear here either.

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

**A3 update (2026-07-06) — time-to-close awareness:** `constructionRetailV1.js`'s blocker WPs now also carry `typicalClearDays` (int, typical close-out duration) and `responsibleRole` (`'GC'|'PM'|'Landlord'`) — same canonical source as `openingBlocker`, no `masterTaskLibrary.js` propagation needed for the same reason as above. `computeOpeningReadiness()` now also keeps each blocker's real `wp.id` (not just phaseId+label) so it can place blockers in `dependencyRules.js`'s dependency graph and compute `requiredDays`/`slack`/`verdict`/`criticalChain` via a critical-path-method longest-path calculation — see `src/engines/openingReadinessEngine.js` header comments and `src/engines/__tests__/openingReadinessEngine.test.mjs` for the algorithm and worked examples. Also fixed in the same pass: a blocker WP with no report data at all (`status` is `null`/`undefined`) now counts as an active blocker (effectively "Not Started") instead of being silently skipped — previously this understated both the blocker count and requiredDays for any project where the contractor hadn't yet reported on that phase.

## Versioned project scope-template contract (2026-07-28)

- `templates.family` is the stable routing family; `family_id` remains the
  immutable version-lineage UUID. `company_id = NULL` is the global OpenDay
  default, while a non-null value is private to that company.
- New `retail-fitout-v2` projects resolve the active company template first
  and the active global template second, then persist that exact
  `projects.template_id`. `template_type` remains for routing compatibility,
  while project-specific selections and overrides remain in `project.scope`.
- `resolveProjectScopeTemplate()` is the canonical read path. A valid V2 pin
  resolves persisted `templates.data`; an historical V2 project without a
  valid persisted V2 pin deliberately uses the certified static compatibility
  definition. No historical project is inferred, rewritten, or silently
  upgraded.
- Once any project references a template version, its semantic data, family,
  ownership, lineage, and version are immutable at the database boundary.
  Editing creates a new version; changing the active default affects only new
  projects.
- V2 work-package IDs are historical identities shared by Gantt, contractor
  reports, site visits, and evidence. Version creation never silently renames
  an existing identity.
- `retailFitoutV2.js` and `dependencyRulesV2.js` remain the deterministic
  bootstrap definition and explicit legacy compatibility source. Runtime
  semantics for pinned projects come from the resolved persisted version.

## Master Catalog contract foundation — schemaVersion 2 (Slice 5C, 2026-07-28)

Adds a second, explicit template **contract version** for `retail-fitout-v2`
family templates — a distinct axis from the zoned/flat model above.
`schemaVersion` (`templates.data.schemaVersion`) is the contract version,
always read explicitly, never inferred from field presence:

- **schemaVersion 1** (legacy, unchanged): today's certified 91-WP template
  and every template like it. `getScopeWPIds()`'s existing "empty/null scope
  = full template" shorthand is preserved byte-for-byte — this slice does not
  touch it.
- **schemaVersion 2** (Master Catalog): a distinct, explicit contract for
  future comprehensive-catalog templates (e.g. the planned 221-WP Retail
  Fit-Out catalog). **This slice adds only the contract — no schemaVersion 2
  template with real catalog content exists yet.** No v1 template is
  reinterpreted as v2, and no v1 semantics silently extend to it.

### Three distinct concepts — do not conflate

1. **Master Catalog** — the full set of work packages a schemaVersion 2
   template defines (`data.zones[].categories[].workPackages[]`, same
   zones→categories→workPackages physical shape as v1).
2. **Default Scope** — `data.defaultScope.workPackageIds`, the template's own
   canonical "what a brand-new project starts with" list. This is the
   **single source of truth** for default selection — there is no parallel
   `defaultSelected: true/false` flag persisted per WP; UI/presentation
   derives default-selected state purely by membership in this array
   (`getDefaultScopeWorkPackageIds()`).
3. **Project Scope** — `project.scope.workPackages`, one project's own
   selection, initialized from Default Scope at creation
   (`buildNewProjectDraft`) and independently mutable afterward. Editing a
   project's scope never mutates the template's `defaultScope` (verified:
   `getDefaultScopeWorkPackageIds()` always returns a fresh array copy).

### null / `[]` / explicit-ids semantics — schema-version-dependent, never ambiguous

`resolveProjectScopeSelection({ scope, workPackages, schemaVersion })`
(`core/projects/scope/getScopeWPIds.js`) is the **one** canonical resolver for
this — engines, Gantt generation, and reports all call it instead of each
deciding null/empty/schemaVersion meaning themselves:

| schemaVersion | `scope` absent / `workPackages` absent | `scope.workPackages: []` | `scope.workPackages: [ids]` |
|---|---|---|---|
| 1 / legacy (unversioned) | full template (unchanged `getScopeWPIds` shorthand) | full template (unchanged shorthand) | exactly those ids |
| 2 (Master Catalog) | **zero** selected | **zero** selected | exactly those ids (unknown ids dropped) |

Schema v2 never uses emptiness as shorthand for "everything" — a real,
explicit id list (`FULL_CATALOG` helper or equivalent) would be required to
select the whole catalog, and this slice does not add one. "Reset to
Default" (`resolveResetProjectScopeSelection`) always restores
`defaultScope.workPackageIds`, never the full catalog and never a prior
customization.

### catalogClass and applicabilityTags — descriptive metadata only

- `catalogClass: 'core' | 'optional' | 'specialized'` (optional, per WP) is
  **purely descriptive** — "core" does **not** mean mandatory. It has no
  effect on weights, Gantt scheduling, progress calculation, or whether a PM
  can remove the WP from a project's scope.
- `applicabilityTags` (optional, per WP; controlled vocabulary across
  `projectType`/`location`/`retailProfile`/`system` dimensions — see
  `versionedScopeTemplate.js`'s `APPLICABILITY_TAG_VOCAB`) is structure- and
  vocabulary-validated only (`validateMasterCatalogTemplateData`). **It does
  not drive any automatic scope selection or recommendation logic in this
  slice** — that is explicitly reserved for a future, separately-approved
  slice.

### What this slice does NOT do

No schemaVersion 2 template with real content exists after this slice — the
next slice (after separate approval) materializes the approved Retail
Fit-Out Master Catalog as a new immutable template version. This slice adds
only: the schemaVersion 2 contract + validation (`isMasterCatalogTemplateData`,
`validateMasterCatalogTemplateData`), migration 042 (additive `templates`
CHECK-constraint widening, no RLS change, no row rewrite), the canonical
resolver plumbing above, and a small deterministic 5-WP test fixture
(`domains/construction/templates/masterCatalogSchemaV2.test.mjs`) — never the
real catalog.

## Master Catalog weight contract & canonical engine (Slice 5E.1, 2026-07-29)

Adds the Construction Progress WEIGHT contract and engine for schemaVersion 2
(Master Catalog) templates — no real values authored, no activation.

**Model** (Slice 5E-R's "responsive category effort," approved):
`resolvedWeight(wp) = groupShare(group) × [categoryFactor(category(wp)) ×
baseEffort(wp)] / Σ calibratedEffort over eligible+selected WPs in the same
group`. Deliberately two effective layers only (Group → calibrated WP
effort) — a separately-normalized "category share" layer is algebraically
redundant once `categoryFactor` is folded into each WP's calibrated effort,
and is not implemented. Group share: Project-Wide is a fixed `anchorPct`
(value not yet assigned); Sales/BOH split the remainder by the canonical
Sales Area/BOH Area ratio, reusing `computeZoneWeights()` unchanged via a
`areaBasis`/`anchorPct`/`defaultWeight` → `weightMode`/`fixedWeight`/
`defaultWeight` adapter. Missing-area fallback is the template's own
explicit `defaultWeight` per group — never a silently-inherited v1 business
value.

**Construction Progress eligibility is WP-level** (corrected from Slice
5E-R's category-level proposal — the real approved catalog mixes eligible
and ineligible facts inside the same category). The canonical example:
Pre-Handover & Readiness contains `project_wide.pre_handover.snagging`
("Snagging & Punch-List Resolution") — Construction, eligible — alongside
`project_wide.pre_handover.authority_approvals` ("Authority Approval"),
`common.pre_opening.test_reports` ("Test Reports"),
`project_wide.pre_handover.final_cleaning` ("Final Cleaning"),
`common.pre_opening.final_walkthrough` ("Final Readiness Walkthrough"), and
`project_wide.pre_handover.training` ("Staff & System Training") — all
Readiness/Document/Handover, **not** eligible. (An earlier draft of this
contract incorrectly described Final Readiness Walkthrough as eligible;
corrected here — it is a readiness/verification fact, not construction
work, exactly like the others in this category.) `constructionProgressEligible: false`
WPs contribute **zero** (not near-zero) to both the numerator and
denominator, while remaining fully in Project Scope, reportable, and
visible to Opening Readiness and the general scope resolver — see
`masterCatalogWeightEngine.test.mjs` tests 3 and 16.

**Canonical resolver**: `core/projects/weights/resolveProjectProgressWeights.js`,
called from inside `progressEngine.js` (never by outer consumers) —
schemaVersion 1 delegates byte-identical to the certified
`computeEffectiveWeights()`; schemaVersion 2 routes to
`engines/masterCatalogWeightEngine.js`'s `computeMasterCatalogEffectiveWeights()`.
The actual formula lives in `engines/`, matching every other calculation in
this codebase (architecture-guard enforced) — `core/` only validates,
routes, and assembles the flattened template.

**Duration is NOT coupled to progress weight for schemaVersion 2** —
`baseEffort`/`categoryFactor` are never read by `ganttEngine.js` or
`ganttOrchestrationModel.js` (guarded by test), and `durationPct`/
`duration_pct` are never read by the new weight engine. Schedule/duration
authoring for the Master Catalog is explicitly undesigned and deferred.

**⚠️ ACTIVATION BLOCKER — retained from Slice 5E's audit, not yet resolved:**
`progress_history` currently stores a resolved scalar percentage plus raw
per-WP status, but no weight/scope/template provenance — two fields that
already anticipate this (`snapshot.effective_weights`, `report.snapshotWeights`)
are read by `explainAdapters.js`/`progressEngine.js` today but are **never
written anywhere**. **The Master Catalog template MUST NOT be switched to
`is_active = true` (or otherwise made reachable by normal project creation)
until `progress_history` writes capture, at minimum: `templateId`,
`templateVersion`, `schemaVersion`, `selectedWpIds`, a derived
`selectedScopeFingerprint`, the resolved `effectiveWeights` table, and
`calculationVersion`.** Without this, a scope or weight-authoring change
after a project has recorded progress would silently and retroactively
change what earlier percentages meant, with no record it happened. Not
implemented in this slice (no schema change, no migration) — this is a
prerequisite for a future activation slice, not for 5E.1/5E.2.

## Retail Fit-Out v2 — zoned (zone → category → work-package) template (2026-07-07)

A second, fully isolated template model was added end-to-end: seeding, dependencies, scope,
weighting, opening-readiness, and both submission forms. **Zero changes to v1's observable
behavior** — every v1 test (pre-existing + new) still passes unchanged.

### New files (v2, fully isolated from v1 — no shared ids, no shared code path)

| File | Role |
|---|---|
| `domains/construction/templates/retailFitoutV2.js` | Certified bootstrap and legacy-unpinned compatibility definition: `CATEGORY_LIBRARY`, `retailFitoutV2` (zones→categories, weights), `ALL_WORK_PACKAGES_V2`, `getWPByIdV2()`. 91 WPs across 23 categories across 3 zones (common/sales/boh). |
| `domains/construction/templates/versionedScopeTemplate.js` | Deterministic persisted-data materializer, V2 shape checks, company/global default selection, and the canonical pinned/legacy project resolver used by runtime adapters. |
| `config/dependencyRulesV2.js` | Real (non-flat) FS dependency chain — see file header for the full common/per-zone/cross-zone sequence description. |
| `core/projects/weights/computeZoneWeights.js` | `zoneWeight = 0.65 * (zoneArea / (salesArea+bohArea))`, common fixed at 35%. Pre-existing from an earlier session, verified unchanged. |
| `core/projects/weights/buildV2ProgressTemplate.js` | Converts zone areas + active zones/categories into the `{workPackages, phases}` shape `progressEngine.calculateProjectProgress()` already accepts as a custom `template` — **the only integration point needed; `progressEngine.js` itself is untouched.** Each category becomes one synthetic "phase" (`progressWeight = zoneWeight% × categoryShare%`); each WP's `phaseId` is set to its **category** id. |
| `core/projects/grouping/getWPGrouping.js` | Single source of truth for "how should this WP be grouped/labelled" — v1→phase, v2→zone+category. Never trust a stored DB label; always resolve live. Also exports `groupGanttTasksByZone()`, shared by both submission forms. |
| `core/projects/scope/buildV2OpeningReadinessOptions.js` | Builds `openingReadinessEngine.computeOpeningReadiness()`'s 4th-param `templateOptions` for v2 — remaps each blocker WP's `phaseId` from zone id to **category** id (must match `buildV2ProgressTemplate`'s keying convention). |
| `components/projects/ZonedScopeConfigurator.jsx` | Zone→category→WP scope picker with live weight-% preview. |

### Key bridging decision: category = synthetic "phase"

v2's progress/readiness math reuses the *existing, unmodified* `progressEngine.calculateProjectProgress()`
and `openingReadinessEngine.computeOpeningReadiness()` by treating each v2 **category** as one
atomic "phase" unit. This means **`workPackageStatuses` for a v2 project is keyed by category id
at the top level**, not zone id — even though `project_gantt_tasks.phase_id`/`phase_label` are
seeded with the **zone** id/label (kept only for `GanttChart.jsx`'s v1 phase-band rendering
back-compat). Any code that reads/writes v2 WP statuses must resolve the grouping id via
`getWPGrouping()`, never via the stored `phase_id` column.

### Bugs found and fixed as a necessary side effect (not pre-existing wave items)

1. **`ganttEngine.js`: dead `dependencies` parameter.** `calculateGantt()`, `calculateForecastOpening()`,
   `recalculateOnDelay()` all accepted a `dependencies`/`dependencyRules` argument but silently ignored
   it, always using the hardcoded v1 `DEPENDENCY_RULES` internally. Caught by the v2 test suite (rules
   passed in were never applied); fixed with v1-identical default parameters so v1 behavior is
   byte-unchanged — verified by re-running all pre-existing v1 Gantt tests directly.
2. **`ContractorReport.jsx`: v2 progress synthesized under the wrong key.** The client-side
   `workPackageStatuses` synthesis (used to compute `cumulativeProgress`, which becomes
   `progress_history.overall_progress`) keyed each task by `task.phaseId` — correct for v1, but for
   v2 that column holds the **zone** id, not the category id `buildV2ProgressTemplate` expects. Fixed
   to resolve the key via `getWPGrouping()` for v2 (`categoryId`), branching only for
   `isZonedTemplate(project.templateType)`; v1's `task.phaseId` path is untouched. Also added the
   missing `scopeWPIds`/v2 `template` arguments to the `calculateProjectProgressResult()` call, which
   previously always used v1 defaults regardless of project type.
3. **`ProjectEditorModal.jsx`: "Scope configured" button false-positive.** Found live, via Playwright.
   The button keys off `project.scope?.workPackages != null`, so an area-only legacy scope object is
   not mistaken for a saved WP selection. Canonical-area projects now enter Total/Sales/BOH once in
   Project Areas; the shared area resolver supplies v2 weights and Gantt inputs without persisting
   another numeric copy in `scope`. Existing projects with explicit historical `scope.zoneAreas`
   retain those values through scope reset/edit for backward compatibility.

4. **`projectSummaryEngine.js`: detail-summary readiness still used the v1 blocker graph.** `evaluateProjectState()`
   already passed v2 `ALL_WORK_PACKAGES_V2` + `buildV2OpeningReadinessOptions()` into
   `computeOpeningReadiness()`, but the project-detail summary path still called it with
   `masterTaskLibrary.WORK_PACKAGES` only. That could make detail-drawer opening KPIs disagree with the
   v2 priority/readiness model. Fixed by sharing the same v2-aware inputs in summary code; v1 keeps the
   default v1 templateOptions path.

### ASSUMPTIONs (reversible, made autonomously per the task's delegation rules)

- ID scheme: `{zone}.{category_slug}.{wp_slug}` (e.g. `common.mep_backbone.hvac_equipment`) — machine
  keys only, never shown to users.
- Category weights (hand-assigned per zone, normalized to 100 within zone) and equal-duration-split
  within a category — same no-differentiating-data fallback pattern `constructionRetailV1.js` and
  `normalizeWeightsTo100.js` already use.
- `openingBlocker` classification (`'critical'|'soft'|false`) per WP — safety-critical MEP/commissioning/
  handover items critical; training/cleaning/BMS-integration soft; routine construction/finishing false.
  Same vocabulary `openingReadinessEngine.js` already reads for v1.
- Dependency chain lag durations beyond the two explicitly-reasoned ones (10-day screed cure carried
  over from v1; 2-day waterproofing cure) are nominal placeholders — see `dependencyRulesV2.js` header.
- "Current phase" display for v2 in `contractorReportAdapter.js` uses zone-then-category file order as
  a deterministic "furthest along" proxy (categories have no explicit `order` field, unlike v1 phases)
  — display-only, not used by any calculation engine.

### Verification

- 60/60 test suites, 1439/1439 individual checks green (`npm run test`); 0 lint errors (`npm run lint`,
  same 32 pre-existing warnings baseline); production build succeeds (`npm run build`).
- Live end-to-end Playwright verification (not just unit tests): created a real v2 project through the
  UI (template picker → 700/300 m² zone areas → scope configurator, confirmed live weight preview
  35%/45.5%/19.5% and 91 WPs/23 categories/3 zones → Create Project), confirmed Gantt seeding produced
  real scheduled dates, confirmed the Contractor Report form renders all 3 zone blocks with correct
  category sub-headers and real WP rows/sliders, confirmed category-level progress aggregation (13%
  for 1-of-8 WPs marked Completed), then cleaned up the test project.

## masterTaskLibrary sync risk (Wave 4 backlog)

- `masterTaskLibrary.WORK_PACKAGES` is a manually maintained literal, NOT a programmatic derivation from `constructionRetailV1`.
- Risk: any new field added to `constructionRetailV1` WPs must be manually propagated to `masterTaskLibrary`.
- **Verified (2026-07-05):** the `openingBlocker` field added in Wave 4.5 (`60c77ee`) is confirmed **absent** from `masterTaskLibrary.WORK_PACKAGES` — a real gap, not just a theoretical risk.
- **Verified (2026-07-05):** no consumer of `masterTaskLibrary.WORK_PACKAGES` reads `.openingBlocker` — grepped the whole `src/` tree; the only consumer of `.openingBlocker` anywhere is `openingReadinessEngine.js` itself, which reads `constructionRetailV1` directly and never touches `masterTaskLibrary` for this field. **No action required before Wave 6** — the gap is inert today.
- If a future consumer of `masterTaskLibrary.WORK_PACKAGES` needs `openingBlocker`, add the field there at that time (re-check this section first — this codebase has already shown a pattern of doc claims going stale, e.g. the "flatten adapter" mislabel corrected in Wave 4.5).
- Long-term fix (P2, not scheduled): refactor `masterTaskLibrary` to derive its WP list from `constructionRetailV1` programmatically (e.g. `constructionRetailV1.phases.flatMap(...)`), eliminating the dual-maintenance risk permanently.
