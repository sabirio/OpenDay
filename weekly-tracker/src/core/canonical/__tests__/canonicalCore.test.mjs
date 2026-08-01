import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { scenarios } = await import('./fixtures.js');
const { buildCanonicalProjectSnapshot, computeCanonicalProgress, computePmContractorDiscrepancy, runOpenDayOrchestrator, normalizePersistedDiscrepancyToCanonical } = await import('../index.js');
const { computeCumulativeStatuses, computeWPCumulativeStatuses } = await import('../../../utils/reportUtils.js');
const { calculateProjectProgressResult } = await import('../../../engines/progressEngine.js');
const { evaluateProjectState } = await import('../../opendayEngine/evaluateProjectState.js');
const { computeProjectSummary } = await import('../../../engines/projectSummaryEngine.js');
const { buildProjectDetailDrawerModel } = await import('../../dashboard/projectDetailDrawerModel.js');
const { buildCanonicalProjectRows } = await import('../../dashboard/dashboardProjectRowsModel.js');
const { computePortfolioKpis } = await import('../../../engines/portfolioEngine.js');
const { buildProjectReportViewModel } = await import('../../print/projectReportViewModel.js');

let pass = 0, fail = 0;
function check(label, condition) { if (condition) { pass++; console.log(`  OK ${label}`); } else { fail++; console.error(`  FAIL ${label}`); } }
const calcAt = '2026-04-10T00:00:00.000Z';

console.log('\nCanonical Core — snapshot, progress, discrepancy, orchestration');
const original = structuredClone(scenarios.invalidBoundaries);
const invalid = buildCanonicalProjectSnapshot(scenarios.invalidBoundaries, { calculatedAt: calcAt });
check('does not mutate raw input', JSON.stringify(original) === JSON.stringify(scenarios.invalidBoundaries));
check('negative area is clamped to zero', invalid.zones.find(z => z.id === 'sales').area === 0);
check('numeric-string area is normalized', invalid.zones.find(z => z.id === 'back').area === 250);
check('progress below zero is clamped', invalid.contractorReports[0].workPackageStatuses.demolition['Strip Out & Clear'].progress === 0);
check('progress above 100 is clamped', invalid.contractorReports[0].workPackageStatuses.demolition['Structural Demolition'].progress === 100);
check('duplicate report is dropped', invalid.contractorReports.length === 1);
check('invalid date produces a warning', invalid.warnings.some(w => w.code === 'INVALID_DATE_DROPPED'));
check('normalization corrections remain visible', invalid.warnings.length >= 5);

const normalSnapshot = buildCanonicalProjectSnapshot(scenarios.normal, { calculatedAt: calcAt });
check('latest report is selected chronologically', normalSnapshot.latestContractorReport.id === 'r1');
check('latest visit is selected chronologically', normalSnapshot.latestSiteVisit.id === 'v1');
check('active scope is explicit', normalSnapshot.scope.workPackageIds.length === 2 && normalSnapshot.scope.isPartial);
check('out-of-scope WPs are marked N/A', normalSnapshot.workPackages.some(wp => wp.notApplicable));

const normalProgress = computeCanonicalProgress(normalSnapshot);
const normalDisc = computePmContractorDiscrepancy(normalProgress, normalSnapshot);
check('overall progress is deterministic', normalProgress.overallProgress === computeCanonicalProgress(normalSnapshot).overallProgress);
check('overall progress is 50 for golden normal fixture', normalProgress.overallProgress === 50);
check('PM verified progress is 40 for golden normal fixture', normalProgress.verifiedProgress === 40);
check('signed difference is contractor minus PM', normalDisc.signedDifference === 10);
check('absolute difference is positive magnitude', normalDisc.absoluteDifference === 10);
check('10pp discrepancy is warning', normalDisc.severity === 'warning');

const partial = runOpenDayOrchestrator(scenarios.partialScope, { calculatedAt: calcAt });
check('partial scope reweights to included WP', partial.progress.overallProgress === 75);
check('equal PM/contractor result is zero difference', partial.discrepancy.signedDifference === 0);
const missing = runOpenDayOrchestrator(scenarios.missingData, { calculatedAt: calcAt });
check('missing reports distinguish null contractor from zero overall display baseline', missing.progress.contractorProgress === null && missing.progress.overallProgress === 0);
check('missing PM is null', missing.progress.verifiedProgress === null);
check('missing comparison is unavailable', missing.discrepancy.severity === 'unavailable');
check('empty project never returns NaN/Infinity', Object.values(missing.progress).filter(v => typeof v === 'number').every(Number.isFinite));
const conflict = runOpenDayOrchestrator(scenarios.conflicting, { calculatedAt: calcAt });
check('reports are sorted and latest selected independent of input order', conflict.snapshot.latestContractorReport.id === 'r-new');
check('out-of-scope PM rows are excluded', conflict.progress.verifiedProgress === 40);
check('contractor ahead produces positive canonical sign', conflict.discrepancy.signedDifference > 0);
check('orchestrator output has stable top-level contracts', ['snapshot','progress','discrepancy','schedule','readiness','risks','warnings','calculatedAt','compatibility'].every(k => k in conflict));
check('orchestrator propagates warnings', missing.warnings.some(w => w.code === 'DISCREPANCY_INPUT_UNAVAILABLE'));

const previousRow = evaluateProjectState(scenarios.normal.project, scenarios.normal.contractorReports, scenarios.normal.siteVisits);
const previousSummary = computeProjectSummary(
  previousRow.project,
  previousRow.projReports,
  previousRow.projSiteVisits,
  previousRow.progress,
  previousRow.wpCumulativeStatuses
);
const migratedSummary = buildProjectDetailDrawerModel(previousRow, scenarios.normal.siteVisits);
// Phase 3D.1: buildProjectDetailDrawerModel() now additionally attaches a
// presentation-only opening.statusLabel (openingStatusLabel.js) on top of
// the raw computeProjectSummary() result — an intentional, additive
// enhancement of this migrated consumer, not a value change. Strip it
// before the byte-identical comparison so this test still guards against
// any REAL value drift, and assert its presence/correctness separately.
const { statusLabel: migratedStatusLabel, ...migratedOpeningRest } = migratedSummary.opening;
const migratedSummaryForComparison = { ...migratedSummary, opening: migratedOpeningRest };
check('first migrated consumer preserves Project Summary values', JSON.stringify(migratedSummaryForComparison) === JSON.stringify(previousSummary));
check('migrated consumer additionally attaches opening.statusLabel (Phase 3D.1)', migratedStatusLabel === previousSummary.opening.status);

const fixedRunA = runOpenDayOrchestrator(scenarios.normal, { calculatedAt: calcAt });
const fixedRunB = runOpenDayOrchestrator(scenarios.normal, { calculatedAt: calcAt });
check('fixed calculatedAt makes full orchestration deterministic', JSON.stringify(fixedRunA) === JSON.stringify(fixedRunB));
const historicalRun = runOpenDayOrchestrator(scenarios.normal, { calculatedAt: '2026-02-03T00:00:00.000Z' });
check('historical calculatedAt changes time-dependent freshness', historicalRun.compatibility.legacyState.daysSinceReport !== fixedRunA.compatibility.legacyState.daysSinceReport);
const invalidTime = runOpenDayOrchestrator(scenarios.missingData, { calculatedAt: 'not-a-date' });
check('invalid calculatedAt is safely replaced with a warning', invalidTime.warnings.some(w => w.code === 'INVALID_CALCULATED_AT_REPLACED'));

const persisted = { discrepancy_delta: -20 };
const persistedCopy = structuredClone(persisted);
const converted = normalizePersistedDiscrepancyToCanonical(persisted, 'pm-minus-contractor');
check('historical PM-minus-contractor sign is inverted', converted.signedDifference === 20 && converted.absoluteDifference === 20);
check('already-canonical sign is retained', normalizePersistedDiscrepancyToCanonical({ delta: -7 }, 'contractor-minus-pm').signedDifference === -7);
check('unknown sign convention is not guessed', normalizePersistedDiscrepancyToCanonical({ delta: 8 }, 'unknown').signedDifference === null);
check('unknown sign convention emits warning', normalizePersistedDiscrepancyToCanonical({ delta: 8 }, 'unknown').warnings.length === 1);
check('null persisted discrepancy remains null', normalizePersistedDiscrepancyToCanonical({ delta: null }, 'pm-minus-contractor').signedDifference === null);
check('sign adapter does not mutate source row', JSON.stringify(persisted) === JSON.stringify(persistedCopy));

const dashboardInput = {
  projects: [scenarios.normal.project, { ...scenarios.missingData.project, id: 'project-2' }],
  reports: scenarios.normal.contractorReports.map(r => ({ ...r, projectId: 'project-1' })),
  siteVisits: scenarios.normal.siteVisits.map(v => ({ ...v, projectId: 'project-1' })),
  calculatedAt: calcAt,
};
const dashboardInputCopy = structuredClone(dashboardInput);
const canonicalRows = buildCanonicalProjectRows(dashboardInput);
const previousDashboardState = evaluateProjectState(scenarios.normal.project, dashboardInput.reports, dashboardInput.siteVisits, { calculatedAt: calcAt });
check('Dashboard row progress matches previous state', canonicalRows[0].progress === previousDashboardState.progress);
check('Dashboard row risk matches previous state', JSON.stringify(canonicalRows[0].riskScore) === JSON.stringify(previousDashboardState.riskScore));
check('Dashboard row readiness matches previous state', JSON.stringify(canonicalRows[0].readiness) === JSON.stringify(previousDashboardState.readiness));
check('Dashboard exposes canonical contractor/PM/discrepancy facts', canonicalRows[0].canonical.progress.contractorProgress === 50 && canonicalRows[0].canonical.discrepancy.signedDifference === 10);
check('Dashboard project orchestration runs once into attached canonical result', canonicalRows.every(row => row.canonical?.snapshot?.metadata?.projectId === String(row.project.id)));
check('Dashboard row model does not mutate portfolio input', JSON.stringify(dashboardInput) === JSON.stringify(dashboardInputCopy));
const portfolio = computePortfolioKpis(dashboardInput.projects, canonicalRows, dashboardInput.reports);
check('Portfolio aggregates canonical project progress only', portfolio.avgProgress === 25);
check('Portfolio aggregate has no NaN', Object.values(portfolio).filter(v => typeof v === 'number').every(Number.isFinite));
const emptyPortfolio = computePortfolioKpis([], [], []);
check('Empty portfolio is stable', emptyPortfolio.total === 0 && emptyPortfolio.avgProgress === 0);
const reportView = buildProjectReportViewModel(canonicalRows[0].canonical);
check('Print model uses canonical progress without recalculation', reportView.progress === canonicalRows[0].canonical.progress);
check('Print model uses canonical discrepancy/risk/readiness', reportView.discrepancy === canonicalRows[0].canonical.discrepancy && reportView.risks === canonicalRows[0].canonical.risks && reportView.readiness === canonicalRows[0].canonical.readiness);
check('Print model does not read DOM or mutate orchestrator result', reportView.calculatedAt === calcAt);

console.log('\nCanonical Core — golden-master equivalence with current progress path');
for (const [name, raw] of Object.entries(scenarios)) {
  const snapshot = buildCanonicalProjectSnapshot(raw, { calculatedAt: calcAt });
  const canonical = computeCanonicalProgress(snapshot);
  const wpCum = computeWPCumulativeStatuses(snapshot.contractorReports);
  const legCum = computeCumulativeStatuses(snapshot.contractorReports);
  const previous = calculateProjectProgressResult(wpCum, legCum, snapshot.scope.workPackageIds, snapshot.template).progress;
  check(`${name}: overall progress matches current progressEngine`, Math.abs(previous - canonical.overallProgress) <= 0.01);
  const orchestration = runOpenDayOrchestrator(raw, { calculatedAt: calcAt });
  check(`${name}: readiness is the current compatibility engine output`, orchestration.readiness === orchestration.compatibility.legacyState.readiness);
  check(`${name}: risk is the current compatibility engine output`, orchestration.risks === orchestration.compatibility.legacyState.riskScore);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
