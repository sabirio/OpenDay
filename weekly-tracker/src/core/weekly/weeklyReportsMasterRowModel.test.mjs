// weeklyReportsMasterRowModel.test.mjs — regression test for the Weekly
// Reports master-list duplication bug (multiple reports for one project used
// to render one master row per report instead of one row per project).
//
// Fixture: Project A (0 reports), Project B (1 report), Project C (3
// reports, supplied oldest-first as contractorReports naturally arrives),
// Project E (2 historical reports but currently missing its latest period).
// Expected: exactly one master row per project regardless of report count.
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// weeklyReportsMasterRowModel.js uses Vite-style extensionless relative
// imports ('../../utils/scheduleUtils') that Node ESM rejects — same loader
// trick as weeklyReportReviewModel.test.mjs.
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { buildWeeklyReportsMasterRows, describeReportContext } = await import('./weeklyReportsMasterRowModel.js');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  OK ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };

const PROJECT_A = { id: 'a1', storeCode: 'PRJ-A', shoppingMallName: 'Mall A' };
const PROJECT_B = { id: 'b1', storeCode: 'PRJ-B', shoppingMallName: 'Mall B' };
const PROJECT_C = { id: 'c1', storeCode: 'PRJ-C', shoppingMallName: 'Mall C' };
const PROJECT_E = { id: 'e1', storeCode: 'PRJ-E', shoppingMallName: 'Mall E' };

const reportB1 = { id: 'rb1', reportingDate: '2026-06-01', activitiesBlocked: 'No', supportRequired: 'No' };
// contractorReports arrives oldest-first (matches real DB/insertion order);
// buildWeeklyReportsMasterRows reverses internally to find the latest.
const reportC1 = { id: 'rc1', reportingDate: '2026-05-01' };
const reportC2 = { id: 'rc2', reportingDate: '2026-06-01' };
const reportC3 = { id: 'rc3', reportingDate: '2026-07-01', activitiesBlocked: 'Yes' };
const reportE1 = { id: 're1', reportingDate: '2026-04-01' };
const reportE2 = { id: 're2', reportingDate: '2026-05-01' };

const allRows = [
  { project: PROJECT_A, missingReport: true,  canonical: { snapshot: { project: PROJECT_A, contractorReports: [] } } },
  { project: PROJECT_B, missingReport: false, canonical: { snapshot: { project: PROJECT_B, contractorReports: [reportB1] } } },
  { project: PROJECT_C, missingReport: false, canonical: { snapshot: { project: PROJECT_C, contractorReports: [reportC1, reportC2, reportC3] } } },
  { project: PROJECT_E, missingReport: true,  canonical: { snapshot: { project: PROJECT_E, contractorReports: [reportE1, reportE2] } } },
];

const rows = buildWeeklyReportsMasterRows(allRows);

// ── Core cardinality invariant ───────────────────────────────────────────
check('0 + 1 + 3 + 2 reports across 4 projects yields exactly 4 master rows (not 6)', rows.length === 4);
check('every project appears exactly once (no projectId is duplicated)', new Set(rows.map(r => r.projectId)).size === 4);
check('master row key is the project id alone, not projectId:reportId', rows.every(r => r.key === r.projectId));

// ── Project A: 0 reports still gets exactly one row ──────────────────────
const rowA = rows.find(r => r.projectId === 'a1');
check('Project A (0 reports) produces one row', Boolean(rowA));
check('Project A row is the missing placeholder, not report-derived', rowA.status === 'missing' && rowA.reportId === '' && rowA.reportingContext === 'No contractor report');

// ── Project B: 1 report ──────────────────────────────────────────────────
const rowB = rows.find(r => r.projectId === 'b1');
check('Project B row reflects its only report', rowB.reportId === 'rb1' && rowB.status === 'submitted');

// ── Project C: 3 reports collapse to the LATEST one, not the first/oldest ──
const rowC = rows.find(r => r.projectId === 'c1');
check('Project C (3 reports) still produces exactly one row', Boolean(rowC));
check('Project C row represents the latest report (rc3), not rc1/rc2', rowC.reportId === 'rc3');
check('Project C row surfaces the latest report\'s own attention flags', rowC.attentionLabel === 'Blocked');
check('Project C row is "submitted" (canonical missingReport is false)', rowC.status === 'submitted');

// ── Project E: historical reports exist, but the current period is missing ──
const rowE = rows.find(r => r.projectId === 'e1');
check('Project E (2 historical reports, currently missing) still produces exactly one row', Boolean(rowE));
check('Project E row is "missing" per the canonical missingReport flag, using the latest report\'s id/date', rowE.status === 'missing' && rowE.reportId === 're2');

// ── describeReportContext: shared by master row + detail header, single source ──
check('describeReportContext never marks a report missing unless told to', describeReportContext(reportC1, false).status === 'submitted');
check('describeReportContext honors an explicit missing flag', describeReportContext(reportC1, true).status === 'missing');
check('describeReportContext degrades gracefully with no date at all', describeReportContext({}, false).reportingContext === 'Date unavailable');

// ── Structural proof that selection identity no longer depends on report id ──
const pageSource = readFileSync(new URL('../../pages/WeeklyReports.jsx', import.meta.url), 'utf8');
check('WeeklyReports.jsx selects master rows by project id alone (no projectId:reportId composite key)', /const selectedMasterKey = effectiveProjectId;/.test(pageSource));
check('WeeklyReports.jsx no longer flatMaps contractorReports into master rows', !/allRows\.flatMap/.test(pageSource));
check('WeeklyReports.jsx builds masterRows via the shared, tested row model, through the required hook facade (no direct core/ import, no re-implementation)', pageSource.includes('useWeeklyReportsMasterRows(allRows)') && !/from ["']\.\.\/core\/weekly\/weeklyReportsMasterRowModel/.test(pageSource));
check('the detail header\'s status/context now tracks the currently-viewed report via selectedReportSummary', pageSource.includes('selectedReportSummary'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
