// cardsSurfacesPhase3.test.mjs — Phase 3 (Cards/Surfaces/Information Density)
// regression coverage. Plain source/behavior contract checks, matching this
// repo's existing no-DOM-harness convention.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  OK ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const indexCss          = read('../index.css');
const designSystemCss   = read('../design-system.css');
const statusColors      = read('../config/statusColors.js');
const ganttSpiTab       = read('../components/risk/GanttSpiTab.jsx');
const dashboardWidgets  = read('../components/dashboard/DashboardWidgets.jsx');
const riskGauge         = read('../components/RiskGauge.jsx');
const weeklySharedJsx   = read('../components/weekly/shared.jsx');
const kpiStrip          = read('../components/weekly/KpiStrip.jsx');
const statusMatrix      = read('../components/dashboard/StatusMatrix.jsx');
const dashboardProjectOverview = read('../components/dashboard/DashboardProjectOverview.jsx');
const riskDashboardMasterList  = read('../components/risk/RiskDashboardMasterList.jsx');
const riskSelectedDetail       = read('../components/risk/RiskSelectedDetail.jsx');
const riskDashboardPage        = read('../pages/RiskDashboard.jsx');
const weeklyMasterList         = read('../components/weekly/WeeklyReportsMasterList.jsx');
const weeklyReportsPage        = read('../pages/WeeklyReports.jsx');
const weeklyMasterRowModel     = read('../core/weekly/weeklyReportsMasterRowModel.js');
const projectDetailPane        = read('../components/projects/ProjectDetailPane.jsx');
const portfolioProjectList     = read('../components/projects/PortfolioProjectList.jsx');
const dashboardMasterList      = read('../components/dashboard/DashboardMasterList.jsx');
const dashboardPage            = read('../pages/Dashboard.jsx');
const summaryPanel             = read('../components/dashboard/SummaryPanel.jsx');

// ── StatusBadge collision bug fix ────────────────────────────────────────
console.log('\nStatusBadge CSS collision bug (index.css legacy .status-badge overriding tones)');

check('design-system.css still defines the canonical .status-badge base rule', /\.status-badge\s*\{/.test(designSystemCss));
check('index.css no longer defines a second, colliding .status-badge rule', !/^\.status-badge\s*\{/m.test(indexCss));

// ── Lifecycle/status CSS badge migration (Section 12) ────────────────────
console.log('\nLifecycle/status badge migration — superseded CSS removed, consumers use StatusBadge');

for (const cls of ['.master-lifecycle', '.dashboard-lifecycle-badge', '.weekly-master-status', '.risk-master-level']) {
  check(`${cls} CSS rule removed from index.css (superseded by StatusBadge)`, !indexCss.includes(`${cls} {`) && !indexCss.includes(`${cls}.`));
}

for (const [name, source] of [
  ['ProjectDetailPane', projectDetailPane],
  ['PortfolioProjectList', portfolioProjectList],
  ['DashboardMasterList', dashboardMasterList],
  ['Dashboard page', dashboardPage],
]) {
  check(`${name} imports the shared StatusBadge primitive`, /import StatusBadge from ["'].*StatusBadge/.test(source));
  check(`${name} no longer references the old lifecycle badge classNames`, !source.includes('dashboard-lifecycle-badge') && !source.includes('className="master-lifecycle"'));
}

check('weeklyReportsMasterRowModel computes statusTone alongside statusLabel (domain -> tone resolved once, outside the primitive)', weeklyMasterRowModel.includes('statusTone'));
check('WeeklyReportsMasterList renders the status pill via shared StatusBadge, not a raw className', weeklyMasterList.includes('<StatusBadge') && !weeklyMasterList.includes('weekly-master-status'));
check('WeeklyReports.jsx detail header renders the status pill via shared StatusBadge', weeklyReportsPage.includes('<StatusBadge tone={selectedReportSummary.statusTone}'));

check('statusColors.js exports a documented risk-level -> tone adapter for the master-list pill (riskLevelToTone)', statusColors.includes('export function riskLevelToTone'));
check('statusColors.js exports a SEPARATE risk-level -> tone adapter for RiskBadge (riskLevelToCanonicalTone) rather than reusing the pill mapping (the two have genuinely different existing HIGH-risk colors)', statusColors.includes('export function riskLevelToCanonicalTone'));
check('RiskDashboardMasterList uses StatusBadge + riskLevelToTone, not the removed CSS class', riskDashboardMasterList.includes('<StatusBadge') && riskDashboardMasterList.includes('riskLevelToTone') && !riskDashboardMasterList.includes('risk-master-level'));
check('RiskSelectedDetail uses StatusBadge + riskLevelToTone for dimension pills', riskSelectedDetail.includes('<StatusBadge') && riskSelectedDetail.includes('riskLevelToTone'));
check('RiskDashboard page header uses StatusBadge + riskLevelToTone', riskDashboardPage.includes('<StatusBadge') && riskDashboardPage.includes('riskLevelToTone'));

// ── RiskBadge / SchedBadge family consolidation (Section 13) ─────────────
console.log('\nRiskBadge/SchedBadge family — single definition each, delegating to shared StatusBadge');

check('RiskBadge is defined exactly once in the codebase (RiskGauge.jsx) — the DashboardWidgets.jsx duplicate is removed', !dashboardWidgets.includes('export function RiskBadge'));
check('RiskGauge.jsx RiskBadge delegates to the shared StatusBadge primitive', /export function RiskBadge[\s\S]{0,120}<StatusBadge/.test(riskGauge));
check('DashboardWidgets.jsx SchedBadge delegates to the shared StatusBadge primitive (no local color/style object)', /export function SchedBadge[\s\S]{0,150}<StatusBadge/.test(dashboardWidgets) && !dashboardWidgets.includes('SCHED_STYLES'));
check('weekly/shared.jsx no longer defines its own name-colliding local StatusBadge component', !weeklySharedJsx.includes('export function StatusBadge'));
check('KpiStrip.jsx consumes the shared StatusBadge (not the deleted weekly/shared.jsx one) for schedule status', kpiStrip.includes("from '../shared/StatusBadge.jsx'") && kpiStrip.includes('schedStatusToTone'));
check('statusColors.js exports one canonical schedule-status -> tone map (schedStatusToTone) now shared by SchedBadge and KpiStrip', statusColors.includes('export function schedStatusToTone'));

for (const [name, source] of [['StatusMatrix', statusMatrix], ['DashboardProjectOverview', dashboardProjectOverview]]) {
  check(`${name} imports RiskBadge from the single canonical location (RiskGauge.jsx)`, /import \{ RiskBadge \} from ['"]\.\.\/RiskGauge['"]|import \{ RiskBadge \} from ['"]\.\.\/\.\.\/RiskGauge['"]/.test(source) || source.includes("RiskGauge'"));
}

// ── Score-tier consolidation (Section 14, item B) ─────────────────────────
console.log('\nScore-tier — GanttSpiTab consolidated onto canonical getScoreTier (proven-equivalent 80/60 duplicate)');

check('GanttSpiTab.jsx no longer hardcodes an inline 80/60 reliability-score ternary', !/rel\.score >= 80 \? ['"]var\(--status-done\)['"]/.test(ganttSpiTab));
check('GanttSpiTab.jsx now imports and uses the canonical getScoreTier/SCORE_TIER_COLORS', ganttSpiTab.includes('getScoreTier') && ganttSpiTab.includes('SCORE_TIER_COLORS'));

// ── Dashboard nested-surface chrome reduction (Section 6) ─────────────────
console.log('\nDashboard surface refinement — no-payoff nested chrome removed, hierarchy order intact');

check('.dashboard-kpi-cluster no longer duplicates its parent .dashboard-detail-section\'s border/background/padding', (() => {
  const m = indexCss.match(/\.dashboard-kpi-cluster\s*\{([^}]*)\}/);
  if (!m) return false;
  const body = m[1];
  return !/border(?!-radius)/.test(body) && !/background:/.test(body) && !/padding:/.test(body);
})());
check('Dashboard.jsx Level 1/2/3 hierarchy order from Phase 2 is unchanged (attention strip before health before scope before snapshot before matrix)', (() => {
  const a = dashboardPage.indexOf('<DashboardAttentionStrip');
  const h = dashboardPage.indexOf('<PortfolioHealthSummary');
  const s = dashboardPage.indexOf('<PortfolioScopeSummary');
  const snap = dashboardPage.indexOf('dashboard-snapshot-disclosure');
  const matrix = dashboardPage.indexOf('<StatusMatrix');
  return a < h && h < s && s < snap && snap < matrix;
})());
check('SummaryPanel.jsx still calls useDashboardSummaryPanelModel exactly once (no new calculation introduced by the chrome cleanup)', (summaryPanel.match(/useDashboardSummaryPanelModel\(/g) || []).length === 1);

// ── No new domain calculation introduced anywhere touched this phase ─────
console.log('\nArchitecture — no new business calculation in touched presentation files');

for (const [name, source] of [
  ['statusColors.js', statusColors],
  ['RiskGauge.jsx', riskGauge],
  ['DashboardWidgets.jsx', dashboardWidgets],
]) {
  check(`${name} does not import an engine directly`, !/from ['"].*\/engines\//.test(source));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
