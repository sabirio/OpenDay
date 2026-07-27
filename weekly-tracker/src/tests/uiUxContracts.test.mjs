import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const check = (label, ok) => ok
  ? (pass++, console.log(`  OK ${label}`))
  : (fail++, console.error(`  FAIL ${label}`));

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(srcRoot, relative), 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    entry.isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}

const uiSource = walk(srcRoot)
  .filter(file => /\.(jsx|css)$/.test(file))
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

const formParts = read('components/contractor/FormParts.jsx');
check('field toggle groups expose pressed state', /aria-pressed=\{sel\}/.test(formParts));
check('field textareas have associated labels', /htmlFor=\{id\}/.test(formParts) && /id=\{id\}/.test(formParts));
check('field checkbox rows use a native button', /<button[\s\S]*role="checkbox"[\s\S]*aria-checked=\{active\}/.test(formParts));
check('field controls retain 44px touch targets', /minHeight:\s*44/.test(formParts));

const layout = read('components/Layout.jsx');
const sidebar = read('components/Sidebar.jsx');
const css = read('index.css');
const masterDetail = read('components/shared/MasterDetailLayout.jsx');
const dashboard = read('pages/Dashboard.jsx');
const dashboardMasterList = read('components/dashboard/DashboardMasterList.jsx');
const weeklyReports = read('pages/WeeklyReports.jsx');
const weeklyMasterList = read('components/weekly/WeeklyReportsMasterList.jsx');
const weeklyTabs = read('components/weekly/WeeklyReportTabs.jsx');
const riskDashboard = read('pages/RiskDashboard.jsx');
const riskMasterList = read('components/risk/RiskDashboardMasterList.jsx');
const riskTabs = read('components/risk/RiskDetailTabs.jsx');
const designSystem = read('design-system.css');
const statusMatrix = read('components/dashboard/StatusMatrix.jsx');
const riskTable = read('components/RiskTable.jsx');
const truthBar = read('components/weekly/ReportTruthBar.jsx');
const projects = read('pages/Projects.jsx');
const portfolioMasterList = read('components/projects/PortfolioProjectList.jsx');
const projectDetailTabs = read('components/projects/ProjectDetailTabs.jsx');
check('mobile navigation returns focus to its trigger', /toggleRef\.current\?\.focus/.test(layout));
check('mobile navigation locks background scrolling while open', /document\.body\.style\.overflow\s*=\s*'hidden'/.test(layout));
check('mobile navigation is not focusable while off-canvas', /\.sidebar\s*\{[\s\S]*visibility:\s*hidden/.test(css) && /\.sidebar\.sidebar-open\s*\{[\s\S]*visibility:\s*visible/.test(css));
check('theme toggle has an accessible name', /aria-label=\{label\}/.test(sidebar));

check('MasterDetailLayout owns geometry slots without dashboard domain imports', /master-detail/.test(masterDetail) && !/Project|Report|Risk|Progress|Contractor/.test(masterDetail));
check('Dashboard project rows are semantic buttons with selected state', /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*data-testid="dashboard-master-project"/.test(dashboardMasterList));
check('Dashboard tabs use tablist, tab and selected semantics', /role="tablist"/.test(dashboard) && /role="tab"/.test(dashboard) && /aria-selected=\{activeView === id\}/.test(dashboard));
check('Dashboard no longer renders ProjectDetailDrawer', !/ProjectDetailDrawer/.test(dashboard));
check('Weekly Reports consumes the canonical Master Detail primitive', /<MasterDetailLayout/.test(weeklyReports));
check('Weekly report rows are semantic buttons with selected state', /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*data-testid="weekly-master-report"/.test(weeklyMasterList));
check('Weekly report tabs use the shared Detail tab semantics', /className="detail-pane-tabs"[\s\S]*role="tablist"/.test(weeklyTabs) && /role="tab"/.test(weeklyTabs) && /aria-selected=\{activeTab === tab\.id\}/.test(weeklyTabs));
check('Weekly Reports retired Phase 4 split and inspector composition', !/split-workspace|className="inspector"|WeeklyReportsToolbar|ProjectHeader/.test(weeklyReports));
check('Risk Dashboard consumes the canonical Master Detail primitive', /<MasterDetailLayout/.test(riskDashboard));
check('Risk project rows are semantic buttons with selected state', /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*data-testid="risk-master-project"/.test(riskMasterList));
check('Risk Detail exposes Overview, Drivers, Evidence and Trend tabs', /Overview/.test(riskTabs) && /Drivers/.test(riskTabs) && /Evidence/.test(riskTabs) && /Trend/.test(riskTabs) && /role="tablist"/.test(riskTabs));
check('Risk Dashboard retired Phase 4 split and inspector composition', !/split-workspace|className="inspector"/.test(riskDashboard));
check('Risk UI consumes canonical rows without importing risk engines', !/engines\/riskEngine|computeProjectRiskScore|computeScheduleDeviation/.test(riskDashboard + riskMasterList));
check('Master and Detail establish independent scroll regions', /\.master-pane-list,[\s\S]*\.detail-pane-content\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*auto/.test(css));
check('narrow Master Detail uses explicit single-pane state', /data-mobile-view=\{mobileView\}/.test(masterDetail) && /data-mobile-view="master"[\s\S]*\.detail-pane[\s\S]*display:\s*none/.test(css) && /data-mobile-view="detail"[\s\S]*\.master-pane[\s\S]*display:\s*none/.test(css));
check('canonical data surface owns table density and horizontal containment', /\.ds-data-surface\s*\{[\s\S]*overflow-x:\s*auto/.test(designSystem) && /\.ds-table--dense/.test(designSystem));
check('representative dashboard, weekly and risk surfaces consume the canonical grammar', /ds-table ds-table--dense status-matrix-table/.test(statusMatrix) && /ds-data-surface weekly-truth-scroll/.test(truthBar) && /ds-table ds-table--dense risk-register-table/.test(riskTable));
check('legacy dashboard table system is retired', !/dashboard-table/.test(uiSource));
check('Portfolio consumes the canonical Master Detail primitive', /<MasterDetailLayout/.test(projects) && !/portfolio-workspace|portfolio-list-pane|portfolio-details-pane/.test(projects));
check('Portfolio project selection has one state owner', (projects.match(/useState\(null\)/g) || []).length >= 1 && /selectedProjectId/.test(projects) && !/selectedProjectId/.test(projectDetailTabs));
check('Portfolio master rows are semantic buttons with selected state', /<button[\s\S]*aria-pressed=\{selected\}[\s\S]*data-testid="portfolio-master-project"/.test(portfolioMasterList));
check('Portfolio detail tabs expose tab, panel and keyboard focus semantics', /role="tab"/.test(projectDetailTabs) && /aria-controls="portfolio-detail-tabpanel"/.test(projectDetailTabs) && /tabIndex=\{activeTab === tab\.id \? 0 : -1\}/.test(projectDetailTabs) && /ArrowRight/.test(projectDetailTabs) && /ArrowLeft/.test(projectDetailTabs) && /role="tabpanel"/.test(projects));
check('Portfolio has no page-specific viewport-height calculation', !/portfolio[\s\S]{0,160}calc\(100vh/.test(css));

check('UI contains no thick one-sided accent borders', !/borderLeft:\s*[`'"\s]*[3-9]px|border-left:\s*[3-9]px/i.test(uiSource));
check('UI contains no width-property transitions', !/transition\s*:\s*[`'"]?width/i.test(uiSource));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
