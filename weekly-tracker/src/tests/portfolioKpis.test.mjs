// portfolioKpis.test.mjs - computePortfolioKpis consistency tests.
// Run: node src/tests/portfolioKpis.test.mjs

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computePortfolioKpis } = await import('../engines/portfolioEngine.js');

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else           { fail++; console.error(`  FAIL ${label}`); }
}

const now = new Date();
const old = new Date(now.getTime() - 8 * 86_400_000);

const projects = [
  { id: 'p1', projectStatus: 'Active',    projectType: 'New Opening' },
  { id: 'p2', projectStatus: 'Active',    projectType: 'Rebuilding' },
  { id: 'p3', projectStatus: 'Completed', projectType: 'New Opening' },
  { id: 'p4', projectStatus: 'Active',    projectType: 'Refit' },
];

const allRows = [
  {
    progress: 20,
    riskLevel: 'CRITICAL',
    missingReport: true,
    daysToOpening: 10,
    latestReport: { projectScheduleStatus: 'At Risk', activitiesBlocked: 'Yes', supportRequired: 'No' },
  },
  {
    progress: 60,
    riskLevel: 'LOW',
    missingReport: false,
    daysToOpening: 45,
    latestReport: { projectScheduleStatus: 'On Track', activitiesBlocked: 'No', supportRequired: 'Yes' },
  },
  {
    progress: 100,
    riskLevel: 'LOW',
    missingReport: false,
    daysToOpening: -1,
    latestReport: { projectScheduleStatus: 'Completed', activitiesBlocked: 'No', supportRequired: 'No' },
  },
  {
    progress: 45,
    riskLevel: 'HIGH',
    missingReport: true,
    daysToOpening: null,
    latestReport: { projectScheduleStatus: 'Delayed', activitiesBlocked: 'Yes', supportRequired: 'Yes' },
  },
];

const reports = [
  { reportingDate: now.toISOString().slice(0, 10) },
  { submittedAt: now.toISOString() },
  { reportingDate: old.toISOString().slice(0, 10) },
];

console.log('\ncomputePortfolioKpis - consistency');

const kpis = computePortfolioKpis(projects, allRows, reports);

check('total projects comes from projects.length', kpis.total === 4);
check('active count uses projectStatus', kpis.active === 3);
check('newOpening count uses project.projectType', kpis.newOpening === 2);
check('rebuilding count uses project.projectType', kpis.rebuilding === 1);
check('atRisk counts bad schedule rows', kpis.atRisk === 2);
check('critical counts CRITICAL risk rows', kpis.critical === 1);
check('missing counts row missingReport', kpis.missing === 2);
check('blocked counts activitiesBlocked=Yes', kpis.blocked === 2);
check('support counts supportRequired=Yes', kpis.support === 2);
check('avgProgress averages precomputed row progress', kpis.avgProgress === 56);
check('openingSoon is row-derived and excludes overdue/null', kpis.openingSoon === 1);
check('reportsThisWeek uses reportingDate/submittedAt within 7 days', kpis.reportsThisWeek === 2);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
