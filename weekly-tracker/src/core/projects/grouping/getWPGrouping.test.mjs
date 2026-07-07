// getWPGrouping.test.mjs — v1 phase / v2 zone-category grouping contract.
// Run: node src/core/projects/grouping/getWPGrouping.test.mjs
import { getWPGrouping, isZonedTemplate, groupGanttTasksByZone } from './getWPGrouping.js';
import { V2_TEMPLATE_TYPE, retailFitoutV2 } from '../../../domains/construction/templates/retailFitoutV2.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\nV2_TEMPLATE_TYPE — F-04 shared-constant regression');
{
  check('V2_TEMPLATE_TYPE is exported and equals the literal every screen used to hardcode',
    V2_TEMPLATE_TYPE === 'retail-fitout-v2');
  check('retailFitoutV2.id is the SAME constant reference, not a second independent literal',
    retailFitoutV2.id === V2_TEMPLATE_TYPE);
  check('getWPGrouping(V2_TEMPLATE_TYPE, ...) behaves identically to the old raw-string call',
    JSON.stringify(getWPGrouping(V2_TEMPLATE_TYPE, 'common.mep_backbone.hvac_equipment')) ===
    JSON.stringify(getWPGrouping('retail-fitout-v2', 'common.mep_backbone.hvac_equipment')));
  check('isZonedTemplate(V2_TEMPLATE_TYPE) is still true after the refactor',
    isZonedTemplate(V2_TEMPLATE_TYPE) === true);
}

console.log('\ngetWPGrouping — v1 (phase model)');
{
  const g1 = getWPGrouping(undefined, 'demo.strip_out');
  check('v1, no templateType -> phase grouping', g1?.phaseId === 'demolition' && g1?.phaseLabel === 'Demolition');

  const g2 = getWPGrouping('standard_with_demo', 'mep.electrical');
  check('v1 named template -> phase grouping', g2?.phaseId === 'rough_in' && g2?.phaseLabel === 'Installation Works');

  check('v1 unknown wpId -> null', getWPGrouping('standard_with_demo', 'not.a.real.wp') === null);
}

console.log('\ngetWPGrouping — v2 (zone/category model)');
{
  const g3 = getWPGrouping('retail-fitout-v2', 'common.mep_backbone.hvac_equipment');
  check('v2 common zone WP resolves zone+category',
    g3?.zoneId === 'common' && g3?.zoneLabel === 'Common Works' &&
    g3?.categoryId === 'common.mep_backbone' && g3?.categoryLabel === 'MEP Backbone Works');

  const g4 = getWPGrouping('retail-fitout-v2', 'sales.flooring.tile');
  check('v2 sales zone WP resolves zone+category',
    g4?.zoneId === 'sales' && g4?.zoneLabel === 'Sales Area' &&
    g4?.categoryId === 'sales.flooring' && g4?.categoryLabel === 'Flooring Works');

  const g5 = getWPGrouping('retail-fitout-v2', 'boh.flooring.tile');
  check('sales and boh share the same category LABEL but distinct category IDs (zone-scoped, not shared)',
    g5?.categoryLabel === g4?.categoryLabel && g5?.categoryId !== g4?.categoryId);

  check('v2 unknown wpId -> null', getWPGrouping('retail-fitout-v2', 'not.a.real.wp') === null);
  check('v1 wpId looked up under v2 templateType -> null (no cross-template leakage)',
    getWPGrouping('retail-fitout-v2', 'demo.strip_out') === null);
}

console.log('\nisZonedTemplate');
{
  check("'retail-fitout-v2' is zoned", isZonedTemplate('retail-fitout-v2') === true);
  check("v1 templateTypes are not zoned", isZonedTemplate('standard_with_demo') === false && isZonedTemplate('custom') === false);
  check('undefined is not zoned', isZonedTemplate(undefined) === false);
}

console.log('\ngroupGanttTasksByZone — shared by WorkPackageProgressSection.jsx + SiteVisitFormView.jsx');
{
  const v2Tasks = [
    { id: 'common.mep_backbone.hvac_equipment', label: 'HVAC Equipment Installation' },
    { id: 'common.mep_backbone.electrical_panels', label: 'Electrical Panels & Distribution' },
    { id: 'sales.flooring.tile', label: 'Tiling' },
    { id: 'boh.flooring.tile', label: 'Tiling' },
  ];
  const zones = groupGanttTasksByZone(v2Tasks, 'retail-fitout-v2');
  check('groups into 3 zones (common/sales/boh)', zones.size === 3);
  check('common zone has 1 category with 2 tasks',
    zones.get('common').categories.size === 1 &&
    zones.get('common').categories.get('common.mep_backbone').tasks.length === 2);
  check('sales/boh flooring categories are distinct (zone-scoped ids), same label',
    zones.get('sales').categories.get('sales.flooring').categoryLabel ===
    zones.get('boh').categories.get('boh.flooring').categoryLabel);
  check('unknown wpId is silently skipped (no crash, no phantom zone)',
    groupGanttTasksByZone([{ id: 'not.a.real.wp' }], 'retail-fitout-v2').size === 0);

  const v1Tasks = [{ id: 'demo.strip_out' }];
  const v1Zones = groupGanttTasksByZone(v1Tasks, 'standard_with_demo');
  check('v1 templateType has no zoneId to group by -> empty map (v1 uses the flat byPhase path instead)',
    v1Zones.size === 0);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
