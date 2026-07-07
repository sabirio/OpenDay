// statusColors.test.mjs — boundary tests for the classification functions
// added during the "no domain logic in UI" architecture-conformance pass
// (getScoreTier, getOpeningUrgencyColor, getScheduleDeviationColor,
// getReportAgeColor), each consolidating a threshold rule that was
// independently reimplemented in 2+ UI components.
// Run: node src/config/statusColors.test.mjs

import {
  getScoreTier, SCORE_TIER_COLORS,
  getOpeningUrgencyColor,
  getScheduleDeviationColor,
  getReportAgeColor,
  getSPIStatus,
} from './statusColors.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

console.log('\ngetScoreTier — pinned against pre-refactor RiskTable.jsx/PmAlignmentTab.jsx/SiteVisitComparison.jsx duplicates (>=80/>=60)');
check('80 -> good (boundary, inclusive)',  getScoreTier(80) === 'good');
check('79 -> warn (just below good)',      getScoreTier(79) === 'warn');
check('60 -> warn (boundary, inclusive)',  getScoreTier(60) === 'warn');
check('59 -> critical (just below warn)',  getScoreTier(59) === 'critical');
check('0 -> critical',                     getScoreTier(0) === 'critical');
check('100 -> good',                       getScoreTier(100) === 'good');
check('SCORE_TIER_COLORS has all 3 tiers', ['good', 'warn', 'critical'].every(t => !!SCORE_TIER_COLORS[t]));

console.log('\ngetOpeningUrgencyColor — pinned against pre-refactor dashboard/OverviewTab.jsx/StatusMatrix.jsx/risk/OverviewTab.jsx/SiteVisitSelect.jsx duplicates (<0/<30/<90)');
check('null -> muted',       getOpeningUrgencyColor(null) === 'var(--text-muted)');
check('undefined -> muted',  getOpeningUrgencyColor(undefined) === 'var(--text-muted)');
check('-1 (overdue) -> alert', getOpeningUrgencyColor(-1) === 'var(--status-alert)');
check('0 -> alert (< 30 tier)', getOpeningUrgencyColor(0) === 'var(--status-alert)');
check('29 -> alert (boundary, still < 30)', getOpeningUrgencyColor(29) === 'var(--status-alert)');
check('30 -> warn (boundary, < 90 tier)', getOpeningUrgencyColor(30) === 'var(--status-warn)');
check('89 -> warn (boundary, still < 90)', getOpeningUrgencyColor(89) === 'var(--status-warn)');
check('90 -> done (boundary, >= 90)', getOpeningUrgencyColor(90) === 'var(--status-done)');

console.log('\ngetScheduleDeviationColor — pinned against pre-refactor RiskTable.jsx/risk/OverviewTab.jsx duplicates (>15/>5)');
check('0 -> done',   getScheduleDeviationColor(0) === 'var(--status-done)');
check('5 -> done (boundary, not > 5)', getScheduleDeviationColor(5) === 'var(--status-done)');
check('6 -> warn (just above 5)', getScheduleDeviationColor(6) === 'var(--status-warn)');
check('15 -> warn (boundary, not > 15)', getScheduleDeviationColor(15) === 'var(--status-warn)');
check('16 -> alert (just above 15)', getScheduleDeviationColor(16) === 'var(--status-alert)');

console.log('\ngetReportAgeColor — pinned against pre-refactor StatusMatrix.reportTag()/ProjectDetailDrawer.ReportAgeBadge() duplicates (0/<=7/<=14)');
check('null -> alert (never reported)', getReportAgeColor(null) === 'var(--status-alert)');
check('0 -> done (today)', getReportAgeColor(0) === 'var(--status-done)');
check('7 -> done (boundary, <=7)', getReportAgeColor(7) === 'var(--status-done)');
check('8 -> warn (just above 7)', getReportAgeColor(8) === 'var(--status-warn)');
check('14 -> warn (boundary, <=14)', getReportAgeColor(14) === 'var(--status-warn)');
check('15 -> alert (overdue, just above 14)', getReportAgeColor(15) === 'var(--status-alert)');

console.log('\ngetSPIStatus — pre-existing canonical function, unchanged (regression guard for the new SPISparkline.jsx caller)');
check('0.95 -> on_schedule', getSPIStatus(0.95) === 'on_schedule');
check('0.80 -> at_risk',     getSPIStatus(0.80) === 'at_risk');
check('0.79 -> critical',    getSPIStatus(0.79) === 'critical');
check('null -> no_schedule', getSPIStatus(null) === 'no_schedule');

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
