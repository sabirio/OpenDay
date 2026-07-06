// openingSeverity.test.mjs — single source of truth for the AT RISK/CRITICAL
// severity ladder shared by portfolioEngine.computePortfolioKpis and
// commandEngine.getCommands' "opening_at_risk" command.
// Run: node src/core/insights/__tests__/openingSeverity.test.mjs
import { isOpeningAtRisk, isOpeningCritical, isProjectAtRisk, isProjectCritical, blockerTaskNames } from '../severity/openingSeverity.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

console.log('\nisOpeningAtRisk / isOpeningCritical — status ladder');
check("'At Risk' is at-risk but not critical", isOpeningAtRisk({ status: 'At Risk' }) === true && isOpeningCritical({ status: 'At Risk' }) === false);
check("'Critical' is both at-risk and critical", isOpeningAtRisk({ status: 'Critical' }) === true && isOpeningCritical({ status: 'Critical' }) === true);
check("'Overdue' is both at-risk and critical", isOpeningAtRisk({ status: 'Overdue' }) === true && isOpeningCritical({ status: 'Overdue' }) === true);
check("'Ready' is neither", isOpeningAtRisk({ status: 'Ready' }) === false && isOpeningCritical({ status: 'Ready' }) === false);
check("'No Date' is neither", isOpeningAtRisk({ status: 'No Date' }) === false && isOpeningCritical({ status: 'No Date' }) === false);
check('null/undefined readiness is neither, no throw', isOpeningAtRisk(null) === false && isOpeningCritical(undefined) === false);

console.log('\nisProjectAtRisk — the AA0011 collision scenario (Step 0)');
{
  // Self-report is fine, riskLevel is LOW, but computed opening readiness
  // flags real blockers — the exact case that used to show 0 on the cards
  // while Priorities Today flagged it.
  const collisionRow = {
    latestReport: { projectScheduleStatus: 'On Track' },
    riskLevel: 'LOW',
    readiness: { status: 'At Risk', criticalBlockers: [1, 2, 3, 4], softBlockers: [1] },
  };
  check('bad self-report=false, riskLevel=LOW, readiness=At Risk -> still counts as at-risk',
    isProjectAtRisk(collisionRow) === true);
  check('same row does NOT count as critical (At Risk, not Critical/Overdue)',
    isProjectCritical(collisionRow) === false);

  const healthyRow = { latestReport: { projectScheduleStatus: 'On Track' }, riskLevel: 'LOW', readiness: { status: 'Ready' } };
  check('fully healthy row counts as neither', isProjectAtRisk(healthyRow) === false && isProjectCritical(healthyRow) === false);

  const selfReportedBadRow = { latestReport: { projectScheduleStatus: 'Delayed' }, riskLevel: 'LOW', readiness: { status: 'Ready' } };
  check('bad self-report alone still counts as at-risk (existing behavior preserved)',
    isProjectAtRisk(selfReportedBadRow) === true);

  const criticalRiskLevelRow = { latestReport: { projectScheduleStatus: 'On Track' }, riskLevel: 'CRITICAL', readiness: { status: 'Ready' } };
  check('riskLevel CRITICAL alone still counts as critical (existing behavior preserved)',
    isProjectCritical(criticalRiskLevelRow) === true);

  const openingCriticalRow = { latestReport: { projectScheduleStatus: 'On Track' }, riskLevel: 'LOW', readiness: { status: 'Critical' } };
  check('readiness.status Critical alone now also counts as critical (OPT-1)',
    isProjectCritical(openingCriticalRow) === true && isProjectAtRisk(openingCriticalRow) === true);

  check('missing readiness field does not throw', isProjectAtRisk({ latestReport: null, riskLevel: 'LOW' }) === false);
}

console.log('\nblockerTaskNames — extracts task strings for Priorities Today\'s expandable detail');
{
  check('extracts task names in order',
    JSON.stringify(blockerTaskNames([{ task: 'Fire safety' }, { task: 'MEP handover' }])) === JSON.stringify(['Fire safety', 'MEP handover']));
  check('filters out blockers with no task string',
    JSON.stringify(blockerTaskNames([{ task: 'Fire safety' }, { wpId: 'x' }, { task: '' }])) === JSON.stringify(['Fire safety']));
  check('undefined/null -> []', JSON.stringify(blockerTaskNames(undefined)) === '[]' && JSON.stringify(blockerTaskNames(null)) === '[]');
  check('empty array -> []', JSON.stringify(blockerTaskNames([])) === '[]');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
