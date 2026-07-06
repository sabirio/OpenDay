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

const { computePortfolioKpis, computePortfolioAnalytics } = await import('../engines/portfolioEngine.js');
const { getCommands } = await import('../engines/commandEngine.js');

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

// computePortfolioAnalytics — architecture-conformance pin (V3 audit follow-up
// to F1/F2/F3): extracted verbatim from a local IIFE in SummaryPanel.jsx.
console.log('\ncomputePortfolioAnalytics - pinned against pre-refactor SummaryPanel.jsx output');
{
  const rows = [
    { evm: { SPI: 0.9 },  monteCarlo: { pOnTime: 40 } },
    { evm: { SPI: 1.05 }, monteCarlo: { insufficient_data: true, pOnTime: 10 } },
    { evm: null,          monteCarlo: { pOnTime: 60 } },
  ];
  const a = computePortfolioAnalytics(rows);
  check('avgSPI averages only rows with a computed SPI, rounded to 2dp (0.98)', a.avgSPI === 0.98);
  check('mcRiskyCount excludes insufficient_data rows even if pOnTime < 50 (1)', a.mcRiskyCount === 1);

  const noEvm = computePortfolioAnalytics([{ evm: null }]);
  check('no rows with SPI -> avgSPI null, mcRiskyCount 0', noEvm.avgSPI === null && noEvm.mcRiskyCount === 0);

  const empty = computePortfolioAnalytics([]);
  check('empty rows -> avgSPI null, mcRiskyCount 0', empty.avgSPI === null && empty.mcRiskyCount === 0);
}

// OPT-1 fix: metric-definition collision between the AT RISK/CRITICAL cards
// and Priorities Today. Root cause (confirmed live via real engine calls
// before this fix): a project can self-report "On Track" and score riskLevel
// LOW (the aggregate risk score's "Opening not achievable" factor only fires
// once readiness.verdict === 'NOT_ACHIEVABLE', a stricter bar than
// readiness.status === 'At Risk') while computeOpeningReadiness() still
// finds real, named blockers — so the cards showed 0/0 while Priorities
// Today correctly flagged the same project. Cards are now driven by the same
// openingReadiness status ladder as commandEngine (see
// core/insights/severity/openingSeverity.js), not two independent checks.
console.log('\ncomputePortfolioKpis - openingReadiness-aware atRisk/critical (OPT-1, metric-definition collision fix)');
{
  const collisionProjects = [
    { id: 'aa0011', projectStatus: 'Active', projectType: 'New Opening' },
  ];
  const collisionRows = [
    {
      progress: 92,
      riskLevel: 'LOW',
      missingReport: false,
      daysToOpening: 66,
      latestReport: { projectScheduleStatus: 'On Track', activitiesBlocked: 'No', supportRequired: 'No' },
      readiness: { status: 'At Risk', criticalBlockers: [1, 2, 3, 4], softBlockers: [1] },
    },
  ];
  const collisionKpis = computePortfolioKpis(collisionProjects, collisionRows, []);
  check('OPT-1: On Track + LOW risk but readiness.status=At Risk still counts toward atRisk (was 0 before this fix)',
    collisionKpis.atRisk === 1);
  check('OPT-1: readiness.status=At Risk (not Critical/Overdue) does NOT count toward critical',
    collisionKpis.critical === 0);

  // Same fixture through getCommands (the Priorities Today path) must agree:
  // the card's "this project is at-risk" boolean must match whether
  // Priorities actually surfaces an opening_at_risk command for it.
  const commands = getCommands({
    project: collisionProjects[0],
    progressComparison: null,
    prevProgressComparison: null,
    riskScore: { level: collisionRows[0].riskLevel, factors: [] },
    openingReadiness: collisionRows[0].readiness,
    latestReport: collisionRows[0].latestReport,
    missingReport: false,
  });
  const openingCommand = commands.find(c => c.id === 'opening_at_risk');
  check('guard: card atRisk flag <-> Priorities opening_at_risk command agree',
    (collisionKpis.atRisk === 1) === Boolean(openingCommand));
  check('Priorities severity is "warning" for At Risk, matching the card NOT counting it as critical',
    openingCommand?.severity === 'warning');

  // Escalate to Critical/Overdue: both card AND Priorities severity must escalate together.
  const criticalRows = [{ ...collisionRows[0], readiness: { ...collisionRows[0].readiness, status: 'Critical' } }];
  const criticalKpis = computePortfolioKpis(collisionProjects, criticalRows, []);
  check('readiness.status=Critical now counts toward BOTH atRisk and critical cards',
    criticalKpis.atRisk === 1 && criticalKpis.critical === 1);
  const criticalCommands = getCommands({
    project: collisionProjects[0], progressComparison: null, prevProgressComparison: null,
    riskScore: { level: 'LOW', factors: [] }, openingReadiness: criticalRows[0].readiness,
    latestReport: criticalRows[0].latestReport, missingReport: false,
  });
  check('guard: Critical status escalates Priorities severity to "critical", matching the card',
    criticalCommands.find(c => c.id === 'opening_at_risk')?.severity === 'critical');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
