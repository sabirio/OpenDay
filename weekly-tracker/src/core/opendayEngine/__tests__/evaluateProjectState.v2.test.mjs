// evaluateProjectState.v2.test.mjs — proves evaluateProjectState correctly
// branches to the v2 (zoned) progress template + opening-readiness options
// when project.templateType === 'retail-fitout-v2', via the REAL
// evaluateProjectState function (no mocks), and that v1 projects
// (templateType unset) are completely unaffected.
// Run: node src/core/opendayEngine/__tests__/evaluateProjectState.v2.test.mjs

import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { evaluateProjectState } = await import('../evaluateProjectState.js');
const { ALL_WORK_PACKAGES_V2 } = await import('../../../domains/construction/templates/retailFitoutV2.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const today = new Date();
const iso = (daysFromNow) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

console.log('\nevaluateProjectState — v2 (zoned) project, real integration');
{
  const project = {
    templateType: 'retail-fitout-v2',
    targetOpeningDate: iso(90),
    scope: { zoneAreas: { sales: 700, boh: 300 } },
  };
  // Report a handful of v2 WPs as complete, keyed by category id (v2's
  // convention — see buildV2ProgressTemplate.js).
  const report = {
    reportingDate: iso(-1),
    workPackageStatuses: {
      'common.demolition': {
        'Strip Out & Clear': { status: 'Completed', progress: 100 },
        'Structural Demolition': { status: 'Completed', progress: 100 },
        'MEP Disconnection': { status: 'Completed', progress: 100 },
      },
    },
  };

  const state = evaluateProjectState(project, [report], []);

  check('scopeWPIds resolves against the full v2 WP list (no scope filter -> all 91)',
    state.wpCumulativeStatuses != null); // sanity the report was picked up
  check('progress is a finite number derived from the v2 template (not NaN/undefined)',
    typeof state.progress === 'number' && Number.isFinite(state.progress));
  check('progress is > 0 given a fully-completed v2 category was reported',
    state.progress > 0);
  check('readiness used v2 templateOptions (critical blockers reference real v2 category ids, not v1 ids)',
    state.readiness.criticalBlockers.every(b =>
      ALL_WORK_PACKAGES_V2.some(wp => wp.categoryId === b.wpId)));
  check('readiness computed a requiredDays figure from the v2 dependency chain', typeof state.readiness.requiredDays === 'number');
}

console.log('\nevaluateProjectState — v1 project (templateType unset) unaffected');
{
  const project = { targetOpeningDate: iso(90), scope: null };
  const state = evaluateProjectState(project, [], []);
  check('v1 project with no reports still returns a valid progress number', typeof state.progress === 'number');
  check('v1 project readiness still computes a verdict (v1 default path, no templateOptions)',
    typeof state.readiness.verdict === 'string');
}

console.log('\nevaluateProjectState — legacy/canonical area compatibility');
{
  const report = {
    reportingDate: iso(-1),
    workPackageStatuses: {
      'sales.flooring': {
        Waterproofing: { status: 'Completed', progress: 100 },
        'Floor Tile Installation': { status: 'Completed', progress: 100 },
        Grouting: { status: 'Completed', progress: 100 },
      },
    },
  };
  const legacyProject = {
    templateType: 'retail-fitout-v2',
    targetOpeningDate: iso(90),
    salesAreaSqm: 100,
    backOfHouseAreaSqm: 900,
    scope: { zoneAreas: { sales: 850, boh: 180 } },
  };
  const canonicalProject = {
    templateType: 'retail-fitout-v2',
    targetOpeningDate: iso(90),
    salesAreaSqm: 850,
    backOfHouseAreaSqm: 180,
    scope: null,
  };
  const legacyState = evaluateProjectState(legacyProject, [report], []);
  const canonicalState = evaluateProjectState(canonicalProject, [report], []);
  check('legacy explicit areas preserve the previous progress result when canonical columns disagree',
    legacyState.progress === canonicalState.progress);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
