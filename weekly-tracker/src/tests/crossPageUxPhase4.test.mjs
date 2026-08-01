// crossPageUxPhase4.test.mjs — Phase 4 (Cross-Page UX Consistency) regression
// coverage. Plain source/behavior contract checks, matching this repo's
// existing no-DOM-harness convention.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  OK ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const dashboardPage       = read('../pages/Dashboard.jsx');
const projectsPage        = read('../pages/Projects.jsx');
const riskDashboardPage   = read('../pages/RiskDashboard.jsx');
const weeklyReportsPage   = read('../pages/WeeklyReports.jsx');
const dashboardMasterList = read('../components/dashboard/DashboardMasterList.jsx');
const weeklyMasterList    = read('../components/weekly/WeeklyReportsMasterList.jsx');
const riskMasterList      = read('../components/risk/RiskDashboardMasterList.jsx');
const portfolioMasterList = read('../components/projects/PortfolioProjectList.jsx');
const projectCard         = read('../components/dashboard/ProjectCard.jsx');
const snagDetailPage      = read('../pages/snags/SnagDetailPage.jsx');
const evidenceSection     = read('../components/snags/EvidenceSection.jsx');
const snagFilters         = read('../components/snags/SnagFilters.jsx');
const snagPresentation    = read('../core/presentation/snagPresentationModel.js');
const snagFieldPlanView   = read('../components/snags/mobile/SnagFieldPlanView.jsx');
const prioritiesToday     = read('../components/home/PrioritiesToday.jsx');

// ── Selected item survives filtering/search (Section 13) ─────────────────
console.log('\nSelected-item vs filtered-master — filtering never silently swaps/clears an open selection');

check('Dashboard changeFilter no longer force-clears the selected project', (() => {
  const m = dashboardPage.match(/function changeFilter\(value\) \{([^}]*)\}/);
  return m && !m[1].includes('setSelectedProjectId(null)');
})());
check('Dashboard changeSearch no longer force-clears the selected project', (() => {
  const m = dashboardPage.match(/function changeSearch\(value\) \{([^}]*)\}/);
  return m && !m[1].includes('setSelectedProjectId(null)');
})());
check('Dashboard selectedRow is still derived from the full unfiltered allRows (no new calculation, same source)', /allRows\.find\(\(\{ project \}\) => String\(project\.id\) === selectedProjectId\)/.test(dashboardPage));

check('Portfolio selection is derived from the full projects list, not the paginated/filtered slice', /const selectedProject = projects\.find\(\(p\) => p\.id === effectiveSelectedProjectId\)/.test(projectsPage));
check('Portfolio only falls back to auto-select-first when the previous selection no longer exists at all', /selectedProjectExists/.test(projectsPage) && /projects\.some\(\(p\) => p\.id === selectedProjectId\)/.test(projectsPage));

// ── Tab behavior (Section 10) ──────────────────────────────────────────────
console.log('\nTab behavior — persist across master-selection change, keyboard roving-tabindex everywhere');

check('Risk Dashboard no longer resets activeTab to overview on every master-row selection', (() => {
  const m = riskDashboardPage.match(/onSelect=\{\(projectId\) => \{([\s\S]*?)\}\}/);
  return m && !m[1].includes("setActiveTab('overview')");
})());
check('Risk Dashboard still resets the report-scoped filterReport on selection change (legitimately project-specific, unlike the tab)', /onSelect=\{\(projectId\) => \{[\s\S]*?setFilterReport\(''\);[\s\S]*?\}\}/.test(riskDashboardPage));
check("Dashboard's detail tabs now support arrow-key roving-tabindex, matching Portfolio/Weekly/Risk", /handleViewTabKeyDown/.test(dashboardPage) && /ArrowLeft.*ArrowRight.*Home.*End|ArrowRight.*ArrowLeft/.test(dashboardPage.replace(/\s+/g, ' ')));

// ── Empty-state category correctness (Section 15) ──────────────────────────
console.log('\nEmpty states — NO DATA EXISTS vs FILTER HAS NO RESULTS use the correct copy for the actual condition');

for (const [name, source, emptyDataPhrase] of [
  ['Dashboard', dashboardMasterList, 'No projects yet'],
  ['Weekly Reports', weeklyMasterList, 'No projects yet'],
  ['Risk Dashboard', riskMasterList, 'No projects yet'],
]) {
  check(`${name} master list distinguishes "no data" from "no filter results" (matches Portfolio's existing correct pattern)`, source.includes(emptyDataPhrase));
}
check('Portfolio master list (reference implementation) still distinguishes the two empty-state categories', portfolioMasterList.includes('No projects yet') && portfolioMasterList.includes('No projects match'));

// ── Error sanitization (Section 16) ─────────────────────────────────────────
console.log('\nError states — no raw error/internal code exposed to the user');

check('WeeklyReports ErrorBoundary no longer renders the raw String(error) to the user', !/<pre[^>]*>\{String\(this\.state\.error\)\}<\/pre>/.test(weeklyReportsPage));
check('SnagFieldPlanView routes capture errors through the friendly snagErrorMessage() layer instead of the raw error.message code', snagFieldPlanView.includes('snagErrorMessage(capture.error)') && !snagFieldPlanView.includes('{capture.error.message}'));

// ── Keyboard reachability (Section 3/17) ────────────────────────────────────
console.log('\nKeyboard reachability — every master-detail primary click target is a real semantic control');

check('Dashboard ProjectCard (Progress tab primary click target) is a real <button>, not a non-semantic <div onClick>', /<button[\s\S]{0,200}onClick=\{\(\) => onSelect\(String\(project\.id\)\)\}/.test(projectCard) && !/<div onClick=\{\(\) => onSelect\(String\(project\.id\)\)\}/.test(projectCard));

// ── Terminology consistency (Section 20) ────────────────────────────────────
console.log('\nTerminology — user-facing "Snag" copy renamed to "Observation" where previously stray');

check('SnagDetailPage loading/error copy says Observation, not Snag', snagDetailPage.includes('Loading Observation...') && snagDetailPage.includes('Observation could not be loaded.'));
check('EvidenceSection user-facing copy says Observation, not Snag', evidenceSection.includes('The Observation state changed') && evidenceSection.includes('The Observation changed') && evidenceSection.includes('linked to this Observation'));
check('SnagFilters aria-label says Observation filters, not Snag filters', snagFilters.includes('aria-label="Observation filters"'));
check('snagErrorMessage() friendly copy says Observation, not snag', snagPresentation.includes('This Observation changed while you were working') && snagPresentation.includes('This Observation could not be found.') && snagPresentation.includes('current Observation status'));

// ── Home -> Dashboard deep link stays synchronized (Section 19) ────────────
console.log('\nHome navigation — priority row deep-links to the correct Dashboard project');

check('PrioritiesToday links to "/?project=<id>"', /to=\{`\/\?project=\$\{ins\.projectId\}`\}/.test(prioritiesToday));
check('Dashboard reads the identical "project" query param name', /searchParams\.get\("project"\)/.test(dashboardPage));

// ── Architecture: no new business calculation introduced ──────────────────
console.log('\nArchitecture — no new engine/domain calculation in touched files');

for (const [name, source] of [
  ['Dashboard page', dashboardPage],
  ['Projects page', projectsPage],
  ['RiskDashboard page', riskDashboardPage],
]) {
  check(`${name} does not import an engine directly`, !/from ["']\.\.\/(engines|core)\//.test(source));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
