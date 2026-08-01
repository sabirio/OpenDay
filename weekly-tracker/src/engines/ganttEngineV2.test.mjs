// ganttEngineV2.test.mjs — proves buildProjectWPsV2 + calculateGantt +
// calculateKeyDates work end-to-end for the zoned v2 template, using the
// REAL (unmodified for v1) ganttEngine.js functions plus DEPENDENCY_RULES_V2.
// Run: node src/engines/ganttEngineV2.test.mjs

import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildProjectWPsV2, calculateGantt, calculateKeyDates, addDays } = await import('./ganttEngine.js');
const { DEPENDENCY_RULES_V2 } = await import('../config/dependencyRulesV2.js');
const { resolveEffectiveV2ZoneAreas } = await import('../core/projects/areas/resolveProjectArea.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const PROJECT_START = new Date('2025-01-01');
const TARGET_OPENING = new Date('2025-06-01'); // ~151 days
const ZONE_AREAS = { sales: 700, boh: 300 };

console.log('\nbuildProjectWPsV2');
{
  const wps = buildProjectWPsV2(ZONE_AREAS, PROJECT_START, TARGET_OPENING, 1000);
  check('produces WPs for all 3 zones', new Set(wps.map(w => w.phaseId)).size === 3);
  check('every WP has a positive duration_days', wps.every(w => w.duration_days >= 1));
  check('phaseId is set to zone id (backward-compat DB column), not category id',
    wps.every(w => ['common', 'sales', 'boh'].includes(w.phaseId)));
  check('categoryId is carried separately (in-memory only, not a DB column)',
    wps.some(w => w.categoryId === 'common.mep_backbone'));

  const critical = wps.find(w => w.id === 'common.mep_backbone.hvac_equipment');
  check('isBlocker flag carried through from the v2 template', critical?.isBlocker === true);
}

console.log('\ncalculateGantt + DEPENDENCY_RULES_V2 — real schedule');
{
  const wps = buildProjectWPsV2(ZONE_AREAS, PROJECT_START, TARGET_OPENING, 1000);
  const gantt = calculateGantt(wps, DEPENDENCY_RULES_V2, PROJECT_START);
  check('gantt result covers every WP', gantt.length === wps.length);
  check('no negative float anywhere', gantt.every(w => w.float_days >= 0));
  check('at least one WP is on the critical path', gantt.some(w => w.isCritical));

  // Floor prep drying lag: construction can't start until 10 days after screed finishes.
  const screed = gantt.find(w => w.id === 'common.floor_prep.screed');
  const wallMarking = gantt.find(w => w.id === 'common.construction.wall_marking');
  check('common.construction starts >= screed finish + 10-day drying lag',
    wallMarking.earlyStart.getTime() >= addDays(screed.earlyFinish, 10).getTime());

  // Cross-zone: common MEP backbone must finish before sales MEP install starts.
  const backboneFinish = Math.max(...gantt.filter(w => w.phaseId === 'common' && w.categoryId === 'common.mep_backbone').map(w => w.earlyFinish.getTime()));
  const salesMepStart = Math.min(...gantt.filter(w => w.categoryId === 'sales.mep_install').map(w => w.earlyStart.getTime()));
  check('sales.mep_install starts only after common.mep_backbone fully finishes', salesMepStart >= backboneFinish);

  // Cross-zone: both zones' snagging must finish before the integrated systems test.
  const salesSnagFinish = gantt.find(w => w.id === 'sales.commissioning.snagging')?.earlyFinish.getTime();
  const bohSnagFinish   = gantt.find(w => w.id === 'boh.commissioning.snagging')?.earlyFinish.getTime();
  const integratedStart = gantt.find(w => w.id === 'common.commissioning.integrated_systems_test')?.earlyStart.getTime();
  check('integrated systems test starts only after both zones finish snagging',
    integratedStart >= salesSnagFinish && integratedStart >= bohSnagFinish);

  // Key dates using the v2-specific markers.
  const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(
    gantt, 'common.commissioning.integrated_systems_test', 'common.handover.keys_possession', null
  );
  check('constructionCompletionDate resolved via the v2 marker', constructionCompletionDate instanceof Date);
  check('projectedOpeningDate resolved via the v2 marker', projectedOpeningDate instanceof Date);
  check('constructionCompletionDate is before projectedOpeningDate', constructionCompletionDate < projectedOpeningDate);
}

console.log('\nbuildProjectWPsV2 — size modifier + scope narrowing');
{
  const small = buildProjectWPsV2(ZONE_AREAS, PROJECT_START, TARGET_OPENING, 300);
  const large = buildProjectWPsV2(ZONE_AREAS, PROJECT_START, TARGET_OPENING, 3000);
  const smallWP = small.find(w => w.id === 'common.mep_backbone.hvac_equipment');
  const largeWP = large.find(w => w.id === 'common.mep_backbone.hvac_equipment');
  check('larger store (>2000 sqm) gets longer durations than smaller store (<500 sqm)',
    largeWP.duration_days > smallWP.duration_days);

  const dropBoh = buildProjectWPsV2(ZONE_AREAS, PROJECT_START, TARGET_OPENING, 1000, { activeZoneIds: ['common', 'sales'] });
  check('dropping boh zone excludes its WPs from seeding', !dropBoh.some(w => w.phaseId === 'boh'));
}

console.log('\nbuildProjectWPsV2 — canonical/legacy area equivalence');
{
  const legacyProject = {
    store_size_sqm: 1100,
    sales_area_sqm: 1000,
    back_of_house_area_sqm: 100,
    scope: { zoneAreas: { sales: 850, boh: 180 } },
  };
  const canonicalProject = {
    store_size_sqm: 1100,
    sales_area_sqm: 850,
    back_of_house_area_sqm: 180,
    scope: { zones: ['common', 'sales', 'boh'] },
  };
  const legacy = buildProjectWPsV2(
    resolveEffectiveV2ZoneAreas(legacyProject), PROJECT_START, TARGET_OPENING, 1100,
  );
  const canonical = buildProjectWPsV2(
    resolveEffectiveV2ZoneAreas(canonicalProject), PROJECT_START, TARGET_OPENING, 1100,
  );
  check('equivalent effective old/new areas produce identical area-driven WP durations',
    JSON.stringify(legacy.map(wp => [wp.id, wp.duration_days]))
      === JSON.stringify(canonical.map(wp => [wp.id, wp.duration_days])));

  const legacyGantt = calculateGantt(legacy, DEPENDENCY_RULES_V2, PROJECT_START);
  const canonicalGantt = calculateGantt(canonical, DEPENDENCY_RULES_V2, PROJECT_START);
  check('equivalent effective old/new areas produce identical generated Gantt dates',
    JSON.stringify(legacyGantt.map(wp => [wp.id, wp.earlyStart, wp.earlyFinish]))
      === JSON.stringify(canonicalGantt.map(wp => [wp.id, wp.earlyStart, wp.earlyFinish])));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
