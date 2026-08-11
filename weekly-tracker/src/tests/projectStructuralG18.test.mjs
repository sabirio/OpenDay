import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`  OK ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}`);
  }
};
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const overview = read('../components/dashboard/DashboardProjectOverview.jsx');
const dashboard = read('../pages/Dashboard.jsx');
const weekly = read('../pages/WeeklyReports.jsx');
const risk = read('../pages/RiskDashboard.jsx');
const css = read('../index.css');

console.log('\nG1.8 Project structural contracts');

check('Project reuses the canonical AnalyticalSection primitive for workflow handoffs',
  /<AnalyticalSection[\s\S]*title="Continue project work"[\s\S]*className="dashboard-project-workflows"/.test(overview));
check('Project workflow visibility uses the canonical permission facade',
  overview.includes("from '../../hooks/usePermission'") && overview.includes('canAccessResource(role, item.resource)'));
check('Project hands context to Reports and Risk through one-way project query parameters',
  overview.includes('/weekly-reports?project=${encodedProjectId}') && overview.includes('/risk?project=${encodedProjectId}'));
check('Project uses the existing project routes for Site Visit and Snags',
  overview.includes('/site-visit/${encodedProjectId}') && overview.includes('/projects/${encodedProjectId}/snags'));
check('Action ownership remains explicit without inventing an Action route',
  overview.includes('Actions stay with source workflows')
    && overview.includes('Owned in source workflows')
    && !/to=["'`]\/actions/.test(overview));
check('Dashboard passes the authenticated role into Project composition',
  /<DashboardProjectOverview[^>]*role=\{role\}/.test(dashboard));
check('Weekly Reports consumes the Project handoff without changing report selection rules',
  weekly.includes('useSearchParams')
    && weekly.includes('useState(() => linkedProjectId || "")')
    && weekly.includes('projects.some(p => String(p.id) === selectedProjectId)'));
check('Risk consumes the Project handoff without changing risk-row ownership',
  risk.includes('useSearchParams')
    && risk.includes('useState(() => linkedProjectId)')
    && risk.includes('useRiskRows(projects, reports, siteVisits, useSCurve)'));
check('Project workflow CSS is page-scoped and uses canonical tokens',
  css.includes('.dashboard-page .dashboard-workflow-handoffs')
    && css.includes('var(--border)')
    && css.includes('var(--bg-surface)')
    && css.includes('var(--radius-md)'));
check('Mobile workflow rows retain the canonical minimum touch target',
  /@media \(max-width: 640px\)[\s\S]*\.dashboard-page \.dashboard-workflow-handoffs a,[\s\S]*min-height: 44px/.test(css));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
