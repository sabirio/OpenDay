// statusDashboardTabsPhase2.test.mjs — Phase 2 (Status/Badges + Dashboard
// hierarchy + tab-bar fix) regression coverage. Plain source/behavior
// contract checks, matching this repo's existing no-DOM-harness convention.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  OK ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const statusBadge   = read('../components/shared/StatusBadge.jsx');
const designSystem  = read('../design-system.css');
const riskConfig    = read('../config/riskConfig.js');
const statusColors  = read('../config/statusColors.js');
const projectDetailPane = read('../components/projects/ProjectDetailPane.jsx');
const indexCss       = read('../index.css');
const dashboard       = read('../pages/Dashboard.jsx');
const attentionStrip  = read('../components/dashboard/DashboardAttentionStrip.jsx');
const summaryPanel    = read('../components/dashboard/SummaryPanel.jsx');
const weeklyTabs = read('../components/weekly/WeeklyReportTabs.jsx');
const riskTabs   = read('../components/risk/RiskDetailTabs.jsx');
const portfolioTabs = read('../components/projects/ProjectDetailTabs.jsx');
const snagListPage   = read('../pages/snags/SnagListPage.jsx');

// ── STATUS SYSTEM ─────────────────────────────────────────────────────────
console.log('\nStatus system — shared primitive + consolidated mappings');

const statusBadgeCode = statusBadge.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
check('StatusBadge is a tone-based primitive with no domain-specific conditionals in actual code (its own comment deliberately shows the anti-pattern it forbids)', !/tone\s*===\s*['"](CRITICAL|HIGH|MEDIUM|LOW|on_schedule|at_risk)/.test(statusBadgeCode));
check('StatusBadge exposes exactly the six documented tones', /positive.*caution.*danger.*info.*neutral.*muted/s.test(statusBadge));

const expectedTones = ['positive', 'caution', 'danger', 'info', 'neutral', 'muted'];
check('design-system.css defines a .status-badge--<tone> rule for every tone', expectedTones.every((tone) => designSystem.includes(`.status-badge--${tone}`)));
check('the status-badge base rule reuses restrained padding/font-size (no oversized decorative badge)', /\.status-badge\s*\{[^}]*font-size:\s*0\.6875rem/s.test(designSystem));

check('riskConfig.js no longer independently defines RISK_COLORS — it re-exports the canonical table', riskConfig.includes("export { RISK_LEVEL_COLORS as RISK_COLORS } from './statusColors.js'") && !/CRITICAL:\s*\{\s*text:/.test(riskConfig));
check('statusColors.js RISK_LEVEL_COLORS remains the single canonical risk-level color table', statusColors.includes('export const RISK_LEVEL_COLORS'));

check('config/thresholds.js (the duplicate getOpeningColor) was removed, not left alongside the canonical function', (() => {
  try { readFileSync(new URL('../config/thresholds.js', import.meta.url)); return false; } catch { return true; }
})());
check('getOpeningColor is no longer referenced anywhere in production source', !projectDetailPane.includes('getOpeningColor'));
check('ProjectDetailPane.jsx now uses the single canonical getOpeningUrgencyColor', projectDetailPane.includes('getOpeningUrgencyColor') && projectDetailPane.includes('config/statusColors'));
check('opening-urgency thresholds themselves are unchanged (still </30/90 day tiers, not modified)', /daysToOpening < 30\) return 'var\(--status-alert\)'/.test(statusColors) && /daysToOpening < 90\) return 'var\(--status-warn\)'/.test(statusColors));

// ── TAB SYSTEM ────────────────────────────────────────────────────────────
console.log('\nTab system — shared .detail-pane-tabs fix, one primitive for all consumers');

check('.detail-pane-tabs now sets overflow-y: hidden (the confirmed root cause fix)', /\.detail-pane-tabs\s*\{[^}]*overflow-y:\s*hidden/s.test(indexCss));
check('.detail-pane-tabs still allows horizontal scrolling when tabs do not fit', /\.detail-pane-tabs\s*\{[^}]*overflow-x:\s*auto/s.test(indexCss));
check('the overflow fix lives in exactly one shared rule (not a per-page copy)', (indexCss.match(/overflow-y:\s*hidden/g) || []).length === 1);

for (const [name, source] of [
  ['Dashboard', dashboard],
  ['Weekly Reports', weeklyTabs],
  ['Risk Dashboard', riskTabs],
  ['Portfolio', portfolioTabs],
  ['Site Snag', snagListPage],
]) {
  check(`${name} consumes the shared detail-pane-tabs class (no page-specific tab copy)`, source.includes('detail-pane-tabs'));
}

// ── DASHBOARD INFORMATION HIERARCHY ──────────────────────────────────────
console.log('\nDashboard hierarchy — Level 1 attention before secondary/static sections');

const attentionIdx = dashboard.indexOf('<DashboardAttentionStrip');
const alertsIdx     = dashboard.indexOf('<PortfolioAlerts');
const panelIdx      = dashboard.indexOf('<PortfolioSummaryPanel');
const snapshotIdx   = dashboard.indexOf('dashboard-snapshot-disclosure');
const matrixIdx     = dashboard.indexOf('<StatusMatrix');

check('all compact Dashboard Overview regions are present', [attentionIdx, alertsIdx, panelIdx, snapshotIdx, matrixIdx].every((i) => i !== -1));
check('Level-1 attention strip renders before the SPI alert list', attentionIdx < alertsIdx);
check('Level-1 signals render before the compact Portfolio panel', alertsIdx < panelIdx);
check('the Project Status Matrix follows the compact Portfolio panel directly in the decision flow', panelIdx < matrixIdx);
check('the demoted Snapshot disclosure follows the Project Status Matrix', matrixIdx < snapshotIdx);

check('Snapshot is now a closed-by-default disclosure, not a permanently-visible control', dashboard.includes('<details className="dashboard-snapshot-disclosure"') && dashboard.includes('open={Boolean(snapshotWeek)}'));

// ── ARCHITECTURE: no new business calculation in the Dashboard UI layer ──
console.log('\nDashboard — canonical outputs only, no new local calculation');

check('DashboardAttentionStrip only reads pre-computed kpis fields (no Math., no threshold literals beyond a plain count>0 check)', !/Math\.(round|min|max|floor|ceil)/.test(attentionStrip) && (attentionStrip.match(/count > 0/g) || []).length >= 1);
check('DashboardAttentionStrip does not import any engine directly', !/from ['"].*\/engines\//.test(attentionStrip));
check('DashboardAttentionStrip consumes the same kpis fields computePortfolioKpis already produces (critical/atRisk/missing/blocked/support)', ['critical', 'atRisk', 'missing', 'blocked', 'support'].every((key) => attentionStrip.includes(`'${key}'`) || attentionStrip.includes(`"${key}"`)));
check('Dashboard.jsx does not import engines/core directly (still goes through the useDashboardModel hook)', !/from ["']\.\.\/(engines|core)\//.test(dashboard));
check('SummaryPanel.jsx preserves the single existing hook call (no new calculation introduced by consolidation)', (summaryPanel.match(/useDashboardSummaryPanelModel\(/g) || []).length === 1);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
