// projectSummaryEngineV2.test.mjs — verifies the project detail summary uses
// the v2 opening-readiness graph for retail-fitout-v2 projects instead of
// falling back to v1 blocker WPs.
// Run: node src/engines/projectSummaryEngineV2.test.mjs

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

const { computeProjectSummary } = await import('./projectSummaryEngine.js');
const { ALL_WORK_PACKAGES_V2 } = await import('../domains/construction/templates/retailFitoutV2.js');

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

console.log('\ncomputeProjectSummary — v2 opening readiness');
{
  const project = {
    templateType: 'retail-fitout-v2',
    targetOpeningDate: iso(75),
    scope: { zoneAreas: { sales: 700, boh: 300 } },
  };
  const latestReport = {
    reportingDate: iso(-1),
    projectScheduleStatus: 'On Track',
    activitiesBlocked: 'No',
  };
  const wpCumulativeStatuses = {
    workPackageStatuses: {
      'common.demolition': {
        'Strip Out & Clear': { status: 'Completed', progress: 100 },
        'Structural Demolition': { status: 'Completed', progress: 100 },
        'MEP Disconnection': { status: 'Completed', progress: 100 },
      },
    },
  };

  const summary = computeProjectSummary(project, [latestReport], [], 4, wpCumulativeStatuses);
  const v2CategoryIds = new Set(ALL_WORK_PACKAGES_V2.map(wp => wp.categoryId));

  check('opening status is computed', typeof summary.opening.status === 'string');
  check('critical blockers are resolved from v2 category ids, not v1 phase ids',
    summary.opening.criticalBlockers.every(blocker => v2CategoryIds.has(blocker.wpId)));
  check('required v2 blocker graph creates a non-empty blocker set',
    summary.opening.blockerCount > 0);
}

console.log('\ncomputeProjectSummary — v1 default still works');
{
  const project = { targetOpeningDate: iso(75), scope: null };
  const summary = computeProjectSummary(project, [], [], 0, { workPackageStatuses: {} });
  check('v1 summary still returns opening status', typeof summary.opening.status === 'string');
  check('v1 summary still returns risk level', typeof summary.risk.level === 'string');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
