// masterCatalogWeightEngine.test.mjs — Slice 5E.1: proves the Master Catalog
// weight contract + canonical resolver through the REAL, unmodified
// progressEngine.calculateProjectProgress (not a reimplementation), against
// a small deterministic schema-v2 fixture (NOT the real 221-WP catalog).
//
// Run: node src/engines/masterCatalogWeightEngine.test.mjs

import { calculateProjectProgress } from './progressEngine.js';
import { computeMasterCatalogEffectiveWeights } from './masterCatalogWeightEngine.js';
import { resolveProjectProgressWeights } from '../core/projects/weights/resolveProjectProgressWeights.js';
import { buildMasterCatalogProgressTemplate } from '../core/projects/weights/buildMasterCatalogProgressTemplate.js';
import { computeEffectiveWeights } from './templateWeightsEngine.js';
import {
  materializeRetailFitoutV2TemplateData,
  MASTER_CATALOG_SCHEMA_VERSION,
} from '../domains/construction/templates/versionedScopeTemplate.js';
import { buildV2ProgressTemplate } from '../core/projects/weights/buildV2ProgressTemplate.js';
import { resolveProjectScopeSelection } from '../core/projects/scope/getScopeWPIds.js';

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

// ── Small deterministic schema-v2 fixture (NOT the real 221-WP catalog) ─────
const FIXTURE_DATA = {
  schemaVersion: MASTER_CATALOG_SCHEMA_VERSION,
  model: 'zoned',
  templateType: 'retail-fitout-v2',
  label: 'Weight Engine Test Fixture',
  zones: [
    {
      id: 'project_wide', label: 'Project-Wide', areaBasis: 'NONE', anchorPct: 40,
      categories: [
        {
          id: 'electrical', label: 'Electrical', categoryFactor: 3,
          workPackages: [
            { id: 'panel', label: 'Panel', baseEffort: 3, constructionProgressEligible: true },
            { id: 'lighting', label: 'Lighting', baseEffort: 1, constructionProgressEligible: true },
            { id: 'generator', label: 'Generator', baseEffort: 8, constructionProgressEligible: true },
            { id: 'busbar', label: 'Busbar', baseEffort: 5, constructionProgressEligible: true },
          ],
        },
        {
          id: 'readiness', label: 'Pre-Handover & Readiness', categoryFactor: 1,
          workPackages: [
            { id: 'authority_approval', label: 'Authority Approval', constructionProgressEligible: false },
            { id: 'training', label: 'Training', constructionProgressEligible: false },
          ],
        },
        {
          id: 'refrigeration', label: 'Refrigeration', categoryFactor: 6,
          workPackages: [
            { id: 'display_units', label: 'Refrigerated Display Units', baseEffort: 2, constructionProgressEligible: true },
            { id: 'cold_room', label: 'Cold Room', baseEffort: 6, constructionProgressEligible: true },
          ],
        },
      ],
    },
    {
      id: 'sales', label: 'Sales Area', areaBasis: 'SALES_AREA', defaultWeight: 45,
      categories: [
        {
          id: 'furniture', label: 'Furniture & Joinery', categoryFactor: 10,
          workPackages: [
            { id: 'cash_desk', label: 'Cash Desk', baseEffort: 2, constructionProgressEligible: true },
            { id: 'display_shelving', label: 'Display Shelving', baseEffort: 2, constructionProgressEligible: true },
          ],
        },
        {
          id: 'retail_tech', label: 'Retail Technology', categoryFactor: 3,
          workPackages: [
            { id: 'esl', label: 'ESL', baseEffort: 1, constructionProgressEligible: true },
            { id: 'queue_mgmt', label: 'Queue Management', baseEffort: 1, constructionProgressEligible: true },
            { id: 'wayfinding', label: 'Wayfinding', baseEffort: 1, constructionProgressEligible: true },
            { id: 'digital_screen', label: 'Digital Screen', baseEffort: 1, constructionProgressEligible: true },
            { id: 'interactive', label: 'Interactive Display', baseEffort: 1, constructionProgressEligible: true },
          ],
        },
      ],
    },
    {
      id: 'boh', label: 'Back of House', areaBasis: 'BOH_AREA', defaultWeight: 20,
      categories: [
        {
          id: 'storage', label: 'Furniture & Storage', categoryFactor: 2,
          workPackages: [
            { id: 'shelving', label: 'Stockroom Shelving', baseEffort: 1, constructionProgressEligible: true },
            { id: 'lockers', label: 'Lockers', baseEffort: 1, constructionProgressEligible: true },
          ],
        },
        {
          id: 'finishes', label: 'Wall Finishes', categoryFactor: 2,
          workPackages: [
            { id: 'painting', label: 'Painting', baseEffort: 1, constructionProgressEligible: true },
            { id: 'flooring', label: 'Floor Tile', baseEffort: 1, constructionProgressEligible: true },
          ],
        },
      ],
    },
  ],
  dependencies: [],
  defaultScope: { workPackageIds: ['panel', 'lighting', 'busbar', 'cash_desk', 'display_shelving', 'shelving', 'lockers', 'painting', 'flooring'] },
};

const ZONE_AREAS = { sales: 800, boh: 150 };

function wpStatuses(activeIds, progressByWp = {}) {
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const out = {};
  for (const wp of template.workPackages) {
    if (!activeIds.includes(wp.id)) continue;
    if (!out[wp.phaseId]) out[wp.phaseId] = {};
    out[wp.phaseId][wp.label] = { progress: progressByWp[wp.id] ?? 100 };
  }
  return out;
}

console.log('\n1. V1 unchanged (byte-identical delegation)');
{
  const v1Data = materializeRetailFitoutV2TemplateData();
  const v1Template = buildV2ProgressTemplate({}, null, null, { data: v1Data });
  const scopeWPIds = v1Template.workPackages.slice(0, 5).map(wp => wp.id);
  const phaseWeights = Object.fromEntries(v1Template.phases.map(p => [p.id, p.progressWeight]));
  const viaResolver = resolveProjectProgressWeights({ template: v1Template, workPackages: v1Template.workPackages, scopeWPIds, phaseWeights });
  const viaDirect = computeEffectiveWeights(v1Template.workPackages, scopeWPIds, phaseWeights);
  check('resolveProjectProgressWeights delegates byte-identical to computeEffectiveWeights for v1 (no schemaVersion 2)',
    JSON.stringify(viaResolver.effectiveWeights) === JSON.stringify(viaDirect));
  check('v1 phaseWeights passthrough is null (use template\'s own static weights, unchanged)', viaResolver.phaseWeights === null);
}

console.log('\n2. V2 simple normalization — sums to 1');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const scopeWPIds = FIXTURE_DATA.defaultScope.workPackageIds;
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, scopeWPIds, template.groupShares);
  const sum = Object.values(effectiveWeights).reduce((a, b) => a + b, 0);
  check('all eligible selected resolved weights sum to 1 (within floating-point tolerance)', Math.abs(sum - 1) < 1e-9);
}

console.log('\n3. Eligibility — Readiness WP contributes ZERO Construction Progress influence');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const scopeWPIds = ['panel', 'authority_approval'];
  const statuses = {
    electrical: { Panel: { progress: 0 } },
    readiness: { 'Authority Approval': { progress: 100 } },
  };
  const progress = calculateProjectProgress(statuses, scopeWPIds, null, template);
  check('progress reflects ONLY the eligible WP (Panel at 0%), ignoring the ineligible one at 100%', progress === 0);
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, scopeWPIds, template.groupShares);
  check('ineligible WP never appears in the effective-weight map', !('authority_approval' in effectiveWeights));
}

console.log('\n4. High-effort addition — Electrical + Generator increases Electrical\'s contribution');
{
  // Includes a sibling project-wide category (Refrigeration's display_units)
  // so Electrical has something to grow its SHARE relative to — with no
  // sibling active, Electrical would already hold its whole group's 100%
  // and adding Generator could only redistribute internally, not grow it.
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const before = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'display_units', 'cash_desk'], template.groupShares);
  const after = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'generator', 'display_units', 'cash_desk'], template.groupShares);
  const electricalBefore = (before.effectiveWeights.panel ?? 0) + (before.effectiveWeights.lighting ?? 0);
  const electricalAfter = (after.effectiveWeights.panel ?? 0) + (after.effectiveWeights.lighting ?? 0) + (after.effectiveWeights.generator ?? 0);
  check('adding a high-effort WP (Generator) increases Electrical\'s total contribution', electricalAfter > electricalBefore);
}

console.log('\n5. Low-effort addition — bounded change');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const before = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'cash_desk'], template.groupShares);
  const after = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'esl', 'cash_desk'], template.groupShares);
  const salesBefore = before.effectiveWeights.cash_desk ?? 0;
  const salesAfter = after.effectiveWeights.cash_desk ?? 0;
  const relativeChange = Math.abs(salesAfter - salesBefore) / salesBefore;
  check('adding a small Optional WP (ESL) in a different group changes Sales\'s share only modestly (<15%)', relativeChange < 0.15);
}

console.log('\n6. Remove half category scope — contribution falls');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const full = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'generator', 'busbar', 'cash_desk'], template.groupShares);
  const half = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'cash_desk'], template.groupShares);
  const electricalFull = (full.effectiveWeights.panel ?? 0) + (full.effectiveWeights.lighting ?? 0) + (full.effectiveWeights.generator ?? 0) + (full.effectiveWeights.busbar ?? 0);
  const electricalHalf = (half.effectiveWeights.panel ?? 0) + (half.effectiveWeights.lighting ?? 0);
  check('removing half of Electrical\'s selected scope makes its total contribution decline (not merely redistribute internally)', electricalHalf < electricalFull);
}

console.log('\n7. Dormant category — one low-effort WP does not trigger full-category activation cliff');
{
  // Includes cash_desk/shelving so all 3 groups stay active at their normal
  // baseline shares -- otherwise Project-Wide would be the ONLY selected
  // group and get renormalized up to 100%, which would inflate
  // Refrigeration's relative share and invalidate the "modest share"
  // threshold below (a renormalization effect already proven correct by
  // test 10, not what this test is checking).
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const dormant = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'generator', 'busbar', 'cash_desk', 'shelving'], template.groupShares);
  const oneSmall = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'generator', 'busbar', 'display_units', 'cash_desk', 'shelving'], template.groupShares);
  const fullScope = computeMasterCatalogEffectiveWeights(template.workPackages, ['panel', 'lighting', 'generator', 'busbar', 'display_units', 'cold_room', 'cash_desk', 'shelving'], template.groupShares);
  check('Refrigeration is absent from effectiveWeights while dormant', !('display_units' in dormant.effectiveWeights) && !('cold_room' in dormant.effectiveWeights));
  check('one small Refrigeration WP gets a modest (not full-budget) share', oneSmall.effectiveWeights.display_units > 0 && oneSmall.effectiveWeights.display_units < 0.15);
  check('Refrigeration\'s full genuine scope contributes materially MORE than the one-small-WP case (no all-or-nothing cliff)',
    (fullScope.effectiveWeights.display_units + fullScope.effectiveWeights.cold_room) > (oneSmall.effectiveWeights.display_units * 2));
}

console.log('\n8. Furniture (few WPs, high categoryFactor) legitimately outweighs a finely decomposed discipline');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  // Electrical: 4 WPs, categoryFactor 3. Furniture: 2 WPs, categoryFactor 10 (deliberately high, reflecting real importance).
  const scopeWPIds = ['panel', 'lighting', 'generator', 'busbar', 'cash_desk', 'display_shelving'];
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, scopeWPIds, template.groupShares);
  const electricalTotal = ['panel', 'lighting', 'generator', 'busbar'].reduce((s, id) => s + (effectiveWeights[id] ?? 0), 0);
  const furnitureTotal = ['cash_desk', 'display_shelving'].reduce((s, id) => s + (effectiveWeights[id] ?? 0), 0);
  check('Furniture (2 WPs) outweighs Electrical (4 WPs) when its categoryFactor reflects genuine importance — WP count alone does not determine importance',
    furnitureTotal > electricalTotal);
}

console.log('\n9. Empty category — zero ghost weight');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const { effectiveWeights, phaseWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, ['cash_desk'], template.groupShares);
  check('a category with zero selected WPs (electrical, refrigeration, retail_tech, storage, finishes) contributes no entries at all',
    Object.keys(effectiveWeights).length === 1 && effectiveWeights.cash_desk !== undefined);
  check('phaseWeights contains only the one active category (furniture) — no ghost entries for empty categories',
    Object.keys(phaseWeights).length === 1 && phaseWeights.furniture > 0);
  check('the single active WP absorbs its ENTIRE group share (nothing left ghosted elsewhere)',
    Math.abs(effectiveWeights.cash_desk - phaseWeights.furniture) < 1e-9);
}

console.log('\n10. Empty group — zero ghost weight, surviving groups renormalize');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  // Select nothing from BOH at all.
  const scopeWPIds = ['panel', 'cash_desk'];
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, scopeWPIds, template.groupShares);
  const sum = Object.values(effectiveWeights).reduce((a, b) => a + b, 0);
  check('with BOH entirely unselected, Project-Wide + Sales still sum to exactly 1 (BOH\'s share fully redistributed, no ghost weight)',
    Math.abs(sum - 1) < 1e-9);
  check('BOH group baseline share (9.6) does not silently survive anywhere', !('shelving' in effectiveWeights) && !('lockers' in effectiveWeights));
}

console.log('\n11. Sales/BOH area ratio');
{
  const template = buildMasterCatalogProgressTemplate({ sales: 800, boh: 150 }, { data: FIXTURE_DATA });
  check('Project-Wide anchor is fixed at 40 regardless of area', template.groupShares.project_wide === 40);
  check('Sales share is proportionally larger than BOH share given 800 vs 150 sqm', template.groupShares.sales > template.groupShares.boh);
  check('group shares sum to 100', Math.abs(template.groupShares.project_wide + template.groupShares.sales + template.groupShares.boh - 100) < 1e-9);

  const templateSmallBoh = buildMasterCatalogProgressTemplate({ sales: 200, boh: 200 }, { data: FIXTURE_DATA });
  check('equal Sales/BOH area produces roughly equal Sales/BOH shares (ratio-based, not magnitude-based)',
    Math.abs(templateSmallBoh.groupShares.sales - templateSmallBoh.groupShares.boh) < 1);
}

console.log('\n12. Missing-area fallback behavior — explicit template metadata, not a hardcoded v1 business value');
{
  const templateNoArea = buildMasterCatalogProgressTemplate({}, { data: FIXTURE_DATA });
  check('with no area entered, Sales/BOH fall back to the template\'s own explicit defaultWeight ratio (45:20), not v1\'s hardcoded value reused silently',
    Math.abs(templateNoArea.groupShares.sales - (60 * 45 / 65)) < 0.5
    && Math.abs(templateNoArea.groupShares.boh - (60 * 20 / 65)) < 0.5);
  check('Project-Wide anchor is unaffected by missing area', templateNoArea.groupShares.project_wide === 40);
}

console.log('\n13. baseEffort not used by Gantt/schedule generation (duration separation)');
{
  const fs = await import('node:fs');
  const ganttEngineSrc = fs.readFileSync(new URL('./ganttEngine.js', import.meta.url), 'utf8');
  check('ganttEngine.js source never references baseEffort or categoryFactor', !/baseEffort|categoryFactor/.test(ganttEngineSrc));
  const ganttOrchestrationSrc = fs.readFileSync(new URL('../core/gantt/ganttOrchestrationModel.js', import.meta.url), 'utf8');
  check('ganttOrchestrationModel.js source never references baseEffort or categoryFactor', !/baseEffort|categoryFactor/.test(ganttOrchestrationSrc));
}

console.log('\n14. durationPct/duration_pct does not drive schema-v2 Construction Progress');
{
  const fs = await import('node:fs');
  const engineSrc = fs.readFileSync(new URL('./masterCatalogWeightEngine.js', import.meta.url), 'utf8');
  check('masterCatalogWeightEngine.js source never references durationPct or duration_pct', !/durationPct|duration_pct/.test(engineSrc));
  const buildSrc = fs.readFileSync(new URL('../core/projects/weights/buildMasterCatalogProgressTemplate.js', import.meta.url), 'utf8');
  check('buildMasterCatalogProgressTemplate.js source never references durationPct or duration_pct', !/durationPct|duration_pct/.test(buildSrc));
}

console.log('\n15. project scope selection respected');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const explicitIds = ['panel', 'cash_desk', 'shelving'];
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, explicitIds, template.groupShares);
  check('only the explicitly selected+eligible WPs appear in the resolved weight map',
    Object.keys(effectiveWeights).sort().join(',') === [...explicitIds].sort().join(','));
}

console.log('\n16. ineligible WP remains visible to non-progress scope resolver');
{
  const template = buildMasterCatalogProgressTemplate(ZONE_AREAS, { data: FIXTURE_DATA });
  const scope = { workPackages: ['panel', 'authority_approval'] };
  const resolvedScope = resolveProjectScopeSelection({ scope, workPackages: template.workPackages, schemaVersion: MASTER_CATALOG_SCHEMA_VERSION });
  check('resolveProjectScopeSelection (the general scope resolver, unrelated to progress weight) still returns the ineligible WP — it remains in Project Scope',
    resolvedScope.includes('authority_approval') && resolvedScope.includes('panel'));
  const { effectiveWeights } = computeMasterCatalogEffectiveWeights(template.workPackages, resolvedScope, template.groupShares);
  check('...but the SAME ineligible WP contributes nothing to Construction Progress weight', !('authority_approval' in effectiveWeights));
}

console.log('\n17. Architecture guard — consumer modules do not branch on MASTER_CATALOG_SCHEMA_VERSION');
{
  // Slice 5E.1A: business/use-case consumers must call the canonical
  // resolveProjectProgressTemplate()/resolveProjectProgressWeights()
  // resolvers rather than deciding the schemaVersion 1-vs-2 template
  // shape/formula themselves. This is a targeted denylist over the exact
  // named consumer files, NOT a blanket ban -- the canonical contract/
  // resolver files (versionedScopeTemplate.js, getScopeWPIds.js,
  // resolveProjectArea.js, newProjectScopeOrchestration.js,
  // resolveProjectProgressTemplate.js, resolveProjectProgressWeights.js)
  // legitimately reference MASTER_CATALOG_SCHEMA_VERSION and are
  // deliberately NOT in this list.
  const fs = await import('node:fs');
  const CONSUMER_FILES = [
    '../core/opendayEngine/evaluateProjectState.js',
    './contractorEngine.js',
    '../core/contractorReport/buildContractorReportSubmission.js',
    '../core/weekly/weeklyReportReviewModel.js',
  ];
  for (const relPath of CONSUMER_FILES) {
    const src = fs.readFileSync(new URL(relPath, import.meta.url), 'utf8');
    check(`${relPath.split('/').pop()} does not reference MASTER_CATALOG_SCHEMA_VERSION (routes through resolveProjectProgressTemplate/Weights instead)`,
      !/MASTER_CATALOG_SCHEMA_VERSION/.test(src));
  }
  // Guard against the check being vacuously true: confirm the canonical
  // resolver files DO legitimately reference it (proving the constant is
  // still real and used, just at the correct boundary).
  const resolverSrc = fs.readFileSync(new URL('../core/projects/weights/resolveProjectProgressTemplate.js', import.meta.url), 'utf8');
  check('the canonical resolveProjectProgressTemplate() resolver DOES legitimately reference MASTER_CATALOG_SCHEMA_VERSION (this is the intended boundary)',
    /MASTER_CATALOG_SCHEMA_VERSION/.test(resolverSrc));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
