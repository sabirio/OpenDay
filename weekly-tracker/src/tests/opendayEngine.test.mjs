// opendayEngine.test.mjs — P1.2 orchestration layer tests.
// Run: node src/tests/opendayEngine.test.mjs
//
// Imports the REAL src/core/opendayEngine/*.js files (not a stub mirror) via
// a Node ESM loader that appends '.js' to Vite-style extensionless relative
// imports — same technique as riskEngine.test.mjs / pmAlignmentEngine.test.mjs.
// This actually exercises evaluateProjectState/evaluatePortfolioState/
// evaluateReportImpact/evaluateSiteVisitImpact end to end, composing the
// real engines, not a hand-copied re-implementation.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    try {
      return await nextResolve(specifier + '.js', context);
    } catch {
      // Directory import (e.g. '../projects' -> '../projects/index.js') —
      // Vite resolves this at build time; Node ESM needs it explicit.
      return nextResolve(specifier + '/index.js', context);
    }
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { evaluateProjectState } = await import('../core/opendayEngine/evaluateProjectState.js');
const { evaluatePortfolioState } = await import('../core/opendayEngine/evaluatePortfolioState.js');
const { evaluateReportImpact } = await import('../core/opendayEngine/evaluateReportImpact.js');
const { evaluateSiteVisitImpact } = await import('../core/opendayEngine/evaluateSiteVisitImpact.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// ── Fixtures: realistic construction project on the current masterTaskLibrary schema ──

function makeProject(overrides = {}) {
  return {
    id: 501,
    storeCode: 'HM-501',
    shoppingMallName: 'Riverside Mall',
    constructionStartDate: '2026-01-01',
    constructionEndDate: '2026-06-30',
    targetOpeningDate: '2026-07-15',
    generalContractor: 'Acme Construction',
    contractorEmail: 'gc@acme.test',
    progressHistory: [],
    scope: null,
    ...overrides,
  };
}

// A small, real subset of masterTaskLibrary phase/WP labels (id/phaseId/label
// confirmed against src/config/masterTaskLibrary.js). Weighted-average math
// means a subset works fine: if every task present in a phase is at the same
// pct, that phase's pct equals it regardless of which subset of the phase's
// real WPs is included.
const ALL_COMPLETED_WPS = {
  demolition: {
    'Strip Out & Clear':      { status: 'Completed', progress: 100 },
    'Structural Demolition':  { status: 'Completed', progress: 100 },
  },
  floor_prep: {
    'Floor Screed / Levelling': { status: 'Completed', progress: 100 },
  },
  rough_in: {
    'Wall Marking & Setting Out': { status: 'Completed', progress: 100 },
    'Electrical Rough-In':        { status: 'Completed', progress: 100 },
  },
  finishes: {
    'Wall Finishes (plaster/paint/cladding)': { status: 'Completed', progress: 100 },
    'Ceiling Finishes':                       { status: 'Completed', progress: 100 },
  },
};

const ALL_NOT_STARTED_WPS = {
  demolition: {
    'Strip Out & Clear':      { status: 'Not Started', progress: 0 },
    'Structural Demolition':  { status: 'Not Started', progress: 0 },
  },
  floor_prep: {
    'Floor Screed / Levelling': { status: 'Not Started', progress: 0 },
  },
  rough_in: {
    'Wall Marking & Setting Out': { status: 'Not Started', progress: 0 },
    'Electrical Rough-In':        { status: 'Not Started', progress: 0 },
  },
};

const MIXED_WPS = {
  demolition: {
    'Strip Out & Clear':      { status: 'Completed', progress: 100 },
    'Structural Demolition':  { status: 'Completed', progress: 100 },
  },
  floor_prep: {
    'Floor Screed / Levelling': { status: 'Completed', progress: 100 },
  },
  rough_in: {
    'Wall Marking & Setting Out': { status: 'In Progress', progress: 60 },
    'Electrical Rough-In':        { status: 'In Progress', progress: 30 },
  },
  finishes: {
    'Wall Finishes (plaster/paint/cladding)': { status: 'Not Started', progress: 0 },
    'Ceiling Finishes':                       { status: 'Not Started', progress: 0 },
  },
};

function makeReport({ id, projectId, reportingDate, workPackageStatuses, overallProgress = 0 }) {
  return {
    id, projectId, submittedAt: reportingDate, reportingDate, weekNumber: 1,
    overallProgress, submittedBy: 'contractor-uid', projectScheduleStatus: 'On Track',
    workPackageStatuses, photos: [], risks: [], riskOwners: [], supportTypes: [],
    currentPackages: Object.keys(workPackageStatuses), currentPhases: Object.keys(workPackageStatuses),
    sourceTable: 'contractor_reports',
  };
}

const VALID_RISK_LEVELS   = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const VALID_READINESS     = ['No Date', 'Ready', 'At Risk', 'Critical', 'Overdue'];
const VALID_CONFIDENCE    = ['LOW', 'MEDIUM', 'HIGH'];

// ── A) evaluateProjectState — no reports yet (never-reported project) ─────────

console.log('\nA) evaluateProjectState — never-reported project');
{
  const project = makeProject();
  const state = evaluateProjectState(project, [], []);

  check('latestReport is null',            state.latestReport === null);
  check('wpCumulativeStatuses is null',     state.wpCumulativeStatuses === null);
  check('progress is 0',                    state.progress === 0);
  check('missingReport is true',            state.missingReport === true);
  check('daysSinceReport is null',          state.daysSinceReport === null);
  check('riskLevel is a valid level',       VALID_RISK_LEVELS.includes(state.riskLevel));
  check('confidence.level is valid',        VALID_CONFIDENCE.includes(state.confidence.level));
  check('readiness.status is valid',        VALID_READINESS.includes(state.readiness.status));
  check('health.score is 0-100',            state.health.score >= 0 && state.health.score <= 100);
}

// ── B) evaluateProjectState — all work packages Completed ─────────────────────

console.log('\nB) evaluateProjectState — fully complete report');
{
  const project = makeProject();
  const report = makeReport({ id: 1, projectId: project.id, reportingDate: '2026-06-01', workPackageStatuses: ALL_COMPLETED_WPS, overallProgress: 100 });
  const state = evaluateProjectState(project, [report], []);

  check('progress is exactly 100 when every listed task is Completed', state.progress === 100);
  check('latestReport resolved to the single report',  state.latestReport.id === 1);
  check('wpCumulativeStatuses populated',               state.wpCumulativeStatuses !== null);
  check('missingReport reflects report age (old date)', state.missingReport === true); // 2026-06-01 is >7 days before "today" in this fixture era
}

// ── C) evaluateProjectState — all work packages Not Started ───────────────────

console.log('\nC) evaluateProjectState — nothing started yet, reported today');
{
  const project = makeProject();
  const today = new Date().toISOString().slice(0, 10);
  const report = makeReport({ id: 2, projectId: project.id, reportingDate: today, workPackageStatuses: ALL_NOT_STARTED_WPS, overallProgress: 0 });
  const state = evaluateProjectState(project, [report], []);

  check('progress is exactly 0 when every listed task is Not Started', state.progress === 0);
  check('missingReport is false (reported today)',                     state.missingReport === false);
  check('daysSinceReport is 0',                                        state.daysSinceReport === 0);
}

// ── D) evaluateProjectState — mixed progress, structural invariants ────────────

console.log('\nD) evaluateProjectState — mixed progress (structural checks)');
{
  const project = makeProject();
  const today = new Date().toISOString().slice(0, 10);
  const report = makeReport({ id: 3, projectId: project.id, reportingDate: today, workPackageStatuses: MIXED_WPS, overallProgress: 45 });
  const state = evaluateProjectState(project, [report], []);

  check('progress is strictly between 0 and 100 for a mixed report', state.progress > 0 && state.progress < 100);
  check('riskScore.score is 0-100',           state.riskScore.score >= 0 && state.riskScore.score <= 100);
  check('riskLevel matches riskScore.level',  state.riskLevel === state.riskScore.level);
  check('priorityScore is a finite number',   Number.isFinite(state.priorityScore));
  check('readiness has a blockerCount field', typeof state.readiness.blockerCount === 'number');
  check('contScore has a totalScore field',   typeof state.contScore.totalScore === 'number');
}

// ── E) evaluateProjectState — no target opening date -> readiness "No Date" ────

console.log('\nE) evaluateProjectState — no target opening date');
{
  const project = makeProject({ targetOpeningDate: null });
  const state = evaluateProjectState(project, [], []);
  check('daysToOpening is null without a target date', state.daysToOpening === null);
  check('readiness.status is "No Date"',                state.readiness.status === 'No Date');
}

// ── F) evaluatePortfolioState — composes rows into portfolio KPIs/alerts, merges gantt ──

console.log('\nF) evaluatePortfolioState — two-project portfolio with gantt merge');
{
  const projectA = makeProject({ id: 601, storeCode: 'HM-601' });
  const projectB = makeProject({ id: 602, storeCode: 'HM-602', targetOpeningDate: '2026-07-20' });
  const today = new Date().toISOString().slice(0, 10);
  const reportA = makeReport({ id: 11, projectId: projectA.id, reportingDate: today, workPackageStatuses: ALL_COMPLETED_WPS, overallProgress: 100 });
  const reportB = makeReport({ id: 12, projectId: projectB.id, reportingDate: today, workPackageStatuses: ALL_NOT_STARTED_WPS, overallProgress: 0 });

  const rowA = evaluateProjectState(projectA, [reportA], []);
  const rowB = evaluateProjectState(projectB, [reportB], []);
  const rows = [rowA, rowB];
  const projects = [projectA, projectB];
  const allReports = [reportA, reportB];

  const ganttMetricsMap = new Map([[projectA.id, { spi: 1.05, spiStatus: 'on_track', criticalHealth: { label: 'healthy' } }]]);

  const portfolio = evaluatePortfolioState(projects, rows, allReports, { ganttMetricsMap });

  check('rows length matches input',                 portfolio.rows.length === 2);
  check('kpis.total counts both projects',            portfolio.kpis.total === 2);
  check('project A row got its gantt metrics merged', portfolio.rows[0].gantt?.spi === 1.05);
  check('project B row has null gantt (no map entry)', portfolio.rows[1].gantt === null);
  check('alerts is an array',                          Array.isArray(portfolio.alerts));
  check('contractorPerf is an array',                  Array.isArray(portfolio.contractorPerf));

  const noMergePortfolio = evaluatePortfolioState(projects, rows, allReports);
  check('gantt merge is opt-in — omitting the map leaves row.gantt untouched', noMergePortfolio.rows[0].gantt === undefined);
}

// ── G) evaluateReportImpact — week-over-week composition ──────────────────────

console.log('\nG) evaluateReportImpact — single report vs history');
{
  const project = makeProject();
  const progressHistory = [
    { project_id: project.id, recorded_at: '2026-05-25', overall_progress: 30 },
    { project_id: project.id, recorded_at: '2026-06-01', overall_progress: 45 },
  ];
  const impact = evaluateReportImpact(project, 45, progressHistory, [], MIXED_WPS, null);

  check('progressComparison is present',      impact.progressComparison && typeof impact.progressComparison === 'object');
  check('progressComparison.actualPct is 45', impact.progressComparison.actualPct === 45);
  check('series has 2 points from history',   impact.series.length === 2);
  check('wpDeltas is null with no prior statuses', impact.wpDeltas === null);
  check('phaseChangeFlags is null to match',  impact.phaseChangeFlags === null);
  check('phases is an array',                 Array.isArray(impact.phases));
}

// ── H) evaluateSiteVisitImpact — single visit vs contractor claim ─────────────

console.log('\nH) evaluateSiteVisitImpact — PM finds a discrepancy');
{
  const project = makeProject();
  const report = makeReport({ id: 21, projectId: project.id, reportingDate: '2026-06-01', workPackageStatuses: ALL_COMPLETED_WPS, overallProgress: 100 });
  const visit = {
    id: 31,
    projectId: project.id,
    referenceReportId: report.id,
    visitDate: '2026-06-03',
    wps: [
      // GC claims complete, PM observed in-progress -> overstatement discrepancy
      { wp_id: 'demo.strip_out', phase_id: 'demolition', gc_status: 'completed', observed_status: 'in_progress', gc_progress: 100, observed_progress: 60, discrepancy_delta: -40, pm_note: 'Still clearing debris' },
      // GC and PM agree -> match
      { wp_id: 'demo.structural', phase_id: 'demolition', gc_status: 'completed', observed_status: 'completed', gc_progress: 100, observed_progress: 100, discrepancy_delta: 0, pm_note: null },
    ],
  };

  const impact = evaluateSiteVisitImpact(visit, [project], [report]);

  check('impact is resolved for a matched project', impact !== null);
  check('items has 2 entries',           impact.items.length === 2);
  check('assessed counts both items',    impact.assessed === 2);
  check('matches counts the agreeing item', impact.matches === 1);
  check('discrepancies counts the overstatement', impact.discrepancies === 1);
  check('kpis object is attached',       impact.kpis && typeof impact.kpis.overallMatchRate !== 'undefined');

  const unmatched = evaluateSiteVisitImpact({ ...visit, projectId: 'nonexistent-project' }, [project], [report]);
  check('unresolvable visit still returns a result object (no project match, not a crash)', unmatched !== undefined);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
