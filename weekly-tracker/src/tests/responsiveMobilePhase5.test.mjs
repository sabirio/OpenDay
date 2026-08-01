// responsiveMobilePhase5.test.mjs — Phase 5 (Responsive/Mobile) regression
// coverage. Plain source/behavior contract checks, matching this repo's
// existing no-DOM-harness convention. Browser verification (screenshots,
// live overflow/touch-target measurement) was performed separately and is
// summarized in the phase's final report — these checks only prove the
// source-level contracts that browser testing can't re-run automatically.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`  OK ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const indexCss        = read('../index.css');
const snagsCss         = read('../styles/snags.css');
const designSystemCss  = read('../design-system.css');
const projectsPage     = read('../pages/Projects.jsx');
const snagListPage     = read('../pages/snags/SnagListPage.jsx');
const dashboardPage    = read('../pages/Dashboard.jsx');
const riskDashboardPage = read('../pages/RiskDashboard.jsx');
const weeklyReportsPage = read('../pages/WeeklyReports.jsx');
const masterDetailLayout = read('../components/shared/MasterDetailLayout.jsx');

// ── Portfolio mobile-toolbar fix ────────────────────────────────────────────
console.log('\nPortfolio — mobile detail view no longer pushes the toolbar above the selected project');

check('Projects.jsx exposes mobileView via data-mobile-view on the page wrapper (CSS-targetable, no new JS state)', /data-mobile-view=\{mobileView\}/.test(projectsPage));
check('Portfolio page actions moved from an inline style to a real CSS class (overridable by a media query)', projectsPage.includes('className="portfolio-page-actions"') && !/style=\{\{ display: "flex", gap: 10, flexWrap: "wrap" \}\}/.test(projectsPage));
check('The toolbar is only hidden below the shared master/detail breakpoint while a project detail is focused, not removed from the DOM', /@media \(max-width: 900px\) \{[\s\S]*?\.portfolio-page\[data-mobile-view="detail"\] \.portfolio-page-actions \{\s*display: none;\s*\}/.test(indexCss));
check('The same rule does not touch the page title/description (only the action toolbar)', !/\.portfolio-page\[data-mobile-view="detail"\] \.page-header \{/.test(indexCss));

// ── Site Snag mobile-header fix ─────────────────────────────────────────────
console.log('\nSite Snag — mobile detail view no longer pushes the header/mode-tabs above the open Observation');

check('SnagListPage.jsx exposes mobileView via data-mobile-view on the page wrapper (reuses the existing derived value, no new state)', /data-mobile-view=\{mobileView\}/.test(snagListPage));
check('mobileView is still derived from the :snagId URL param, not a new local state var (Phase 4 contract preserved)', /const mobileView = snagId \? 'detail' : 'master'/.test(snagListPage));
check('The header and mode tabs are only hidden below the shared 900px breakpoint while an Observation is focused, not removed from the DOM', /@media\(max-width:900px\)\{\.site-snag-page\[data-mobile-view="detail"\] \.site-snag-header,\.site-snag-page\[data-mobile-view="detail"\] \.site-snag-mode-tabs\{display:none\}\}/.test(snagsCss));

// ── Shared master/detail mobile mechanism unchanged (Phase 4 regression) ──
console.log('\nShared master/detail mobile mechanism — unchanged, still the single source of mobile view switching');

check('MasterDetailLayout still renders data-mobile-view on .master-detail (the mechanism both fixes above build on top of, not duplicate)', /data-mobile-view=\{mobileView\}/.test(masterDetailLayout));
check('The core master/detail mobile-view CSS switch (hide detail-pane in master mode, hide master-pane in detail mode) is still defined exactly once', (indexCss.match(/\.master-detail\[data-mobile-view="master"\] \.detail-pane \{/g) || []).length === 1);

// ── Tables/data-surfaces own their own horizontal scroll (Section 17) ─────
console.log('\nHorizontally-scrollable data surfaces — container scrolls, not the document');

check('.ds-data-surface (shared scrollable-table-container primitive) sets overflow-x: auto', /\.ds-data-surface \{[^}]*overflow-x: auto/s.test(designSystemCss));
check('Weekly Reports truth bar reuses the shared .ds-data-surface primitive rather than a page-specific scroll implementation', weeklyReportsPage.includes('ds-data-surface') || read('../components/weekly/ReportTruthBar.jsx').includes('ds-data-surface'));

// ── No new device-detection / user-agent branching introduced (Section 27) ─
console.log('\nNo device detection introduced — layout-width-based CSS only, no UA sniffing in touched files');

for (const [name, source] of [
  ['Projects.jsx', projectsPage],
  ['SnagListPage.jsx', snagListPage],
  ['Dashboard.jsx', dashboardPage],
  ['RiskDashboard.jsx', riskDashboardPage],
  ['WeeklyReports.jsx', weeklyReportsPage],
]) {
  check(`${name} has no navigator.userAgent / platform sniffing`, !/navigator\.(userAgent|platform|vendor)/.test(source));
  check(`${name} has no window.innerWidth-based conditional rendering (CSS handles layout switching)`, !/window\.innerWidth/.test(source));
}

// ── Previous-phase contracts still intact (spot checks; full suites cover the rest) ─
console.log('\nPrevious-phase contracts — spot checks (full Phase 2/3/4 suites re-run separately)');

check('Phase 2: .detail-pane-tabs still sets overflow-y: hidden (no vertical tab scrollbar)', /\.detail-pane-tabs \{[^}]*overflow-y: hidden/s.test(indexCss));
check('Phase 4: Dashboard changeFilter/changeSearch still do not force-clear the selected project', (() => {
  const m1 = dashboardPage.match(/function changeFilter\(value\) \{([^}]*)\}/);
  const m2 = dashboardPage.match(/function changeSearch\(value\) \{([^}]*)\}/);
  return m1 && m2 && !m1[1].includes('setSelectedProjectId(null)') && !m2[1].includes('setSelectedProjectId(null)');
})());
check('Phase 4: Risk Dashboard still does not reset activeTab on master-row selection', (() => {
  const m = riskDashboardPage.match(/onSelect=\{\(projectId\) => \{([\s\S]*?)\}\}/);
  return m && !m[1].includes("setActiveTab('overview')");
})());

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
