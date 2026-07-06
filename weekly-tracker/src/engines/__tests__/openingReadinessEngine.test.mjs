// openingReadinessEngine.test.mjs — A3 requiredDays/slack/verdict/criticalChain contract.
// Run: node src/engines/__tests__/openingReadinessEngine.test.mjs
//
// openingReadinessEngine.js uses Vite-style extensionless imports; same
// append-.js loader as riskEngine.test.mjs / pmAlignmentEngine.test.mjs.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeOpeningReadiness } = await import('../openingReadinessEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const today = new Date();
const iso = (daysFromNow) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

const ALL_OTHER_BLOCKERS_COMPLETED = {
  testing: {
    'Electrical Testing':          { status: 'Completed', progress: 100 },
    'HVAC Pressure Test':          { status: 'Completed', progress: 100 },
    'Plumbing Pressure Test':      { status: 'Completed', progress: 100 },
    'Fire System Hydraulic Test':  { status: 'Completed', progress: 100 },
  },
  end_devices: {
    'Lighting Fixtures':    { status: 'Completed', progress: 100 },
    'Sensors & Detectors':  { status: 'Completed', progress: 100 },
    'Furniture & Fixtures': { status: 'Completed', progress: 100 },
  },
  pre_opening: {
    'Staff Training': { status: 'Completed', progress: 100 },
  },
};

console.log('\nA) All blockers complete -> requiredDays 0, verdict scales purely on daysToOpening');
{
  const wpStatuses = {
    ...ALL_OTHER_BLOCKERS_COMPLETED,
    commissioning: {
      'Full Systems Commissioning': { status: 'Completed', progress: 100 },
      'Snagging / Punch List':      { status: 'Completed', progress: 100 },
    },
    pre_opening: { ...ALL_OTHER_BLOCKERS_COMPLETED.pre_opening, 'Deep Cleaning': { status: 'Completed', progress: 100 } },
    handover: {
      'Final Inspection':      { status: 'Completed', progress: 100 },
      'Acceptance & Transfer': { status: 'Completed', progress: 100 },
      'Keys & Possession':     { status: 'Completed', progress: 100 },
    },
  };
  const r = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(30));
  check('requiredDays is 0 when every blocker is Completed', r.requiredDays === 0);
  check('slack equals daysToOpening when requiredDays is 0', r.slack === r.daysToOpening);
  check('verdict is READY_TRACK with 30 days and nothing left to close', r.verdict === 'READY_TRACK');
  check('criticalChain is empty', r.criticalChain.length === 0);
  check('status is Ready', r.status === 'Ready');
}

console.log('\nB) Realistic partial chain — commissioning in progress, everything after not started');
{
  const wpStatuses = {
    ...ALL_OTHER_BLOCKERS_COMPLETED,
    commissioning: {
      'Full Systems Commissioning': { status: 'In Progress', progress: 50 }, // typicalClearDays 7 -> remaining 3.5
      'Snagging / Punch List':      { status: 'Not Started', progress: 0 },  // 5
    },
    pre_opening: { ...ALL_OTHER_BLOCKERS_COMPLETED.pre_opening, 'Deep Cleaning': { status: 'Not Started', progress: 0 } }, // 2
    handover: {
      'Final Inspection':      { status: 'Not Started', progress: 0 }, // 5
      'Acceptance & Transfer': { status: 'Not Started', progress: 0 }, // 3
      'Keys & Possession':     { status: 'Not Started', progress: 0 }, // 1
    },
  };
  // Expected critical path: comm.full_test(3.5) -> comm.snagging(5) -> preopening.cleaning(2)
  //   -> handover.inspection(5) -> handover.transfer(3) -> handover.keys(1) = 19.5 total.
  // (comm.snagging beats comm.full_test as preopening.cleaning's binding predecessor: 3.5+5=8.5 > 3.5)
  const r10 = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(10));
  check('requiredDays sums the true bottleneck chain (19.5d)', r10.requiredDays === 19.5);
  check('slack = daysToOpening - requiredDays', r10.slack === Math.round((10 - 19.5) * 10) / 10);
  check('verdict is NOT_ACHIEVABLE when slack < 0', r10.verdict === 'NOT_ACHIEVABLE');
  check('status escalates to Critical on NOT_ACHIEVABLE', r10.status === 'Critical');
  check('criticalChain lists blockers in closing order',
    r10.criticalChain.map(b => b.wpId).join(',') ===
    'comm.full_test,comm.snagging,preopening.cleaning,handover.inspection,handover.transfer,handover.keys');
  check('criticalChain carries responsibleRole', r10.criticalChain.every(b => typeof b.responsibleRole === 'string'));
  check('criticalChain first link reflects partial progress (3.5d remaining, not full 7)',
    r10.criticalChain[0].remainingDays === 3.5);
  check('reasons mention the day deficit', r10.reasons.some(x => /short by 10d/.test(x.text)));

  const r30 = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(30));
  check('same blockers, more runway -> TIGHT (slack 10.5, between 0 and 7 is false so check boundary)',
    r30.slack === 10.5 && r30.verdict === 'READY_TRACK');

  const r24 = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(24));
  check('slack of 4.5 (0-7 range) -> TIGHT', r24.slack === 4.5 && r24.verdict === 'TIGHT');
}

console.log('\nC) A2 fix — never-reported blocker (null status) counts as Not Started, not skipped');
{
  // Empty status map: no report has ever touched any WP.
  const r = computeOpeningReadiness({ workPackageStatuses: {} }, iso(5));
  check('unreported critical blockers still appear', r.criticalBlockers.length > 0);
  check('requiredDays reflects full typicalClearDays for every unreported blocker (>0)', r.requiredDays > 0);
  check('verdict is NOT_ACHIEVABLE (5 days can\'t possibly cover the whole chain)', r.verdict === 'NOT_ACHIEVABLE');
}

console.log('\nD) No target date — requiredDays still computed, slack/verdict stay null');
{
  const r = computeOpeningReadiness({ workPackageStatuses: {} }, null);
  check('status is No Date', r.status === 'No Date');
  check('daysToOpening is null', r.daysToOpening === null);
  check('slack is null without a target date', r.slack === null);
  check('verdict is null without a target date', r.verdict === null);
  check('requiredDays is still computed independent of target date', r.requiredDays > 0);
}

console.log('\nE) Not Applicable status excludes a blocker entirely');
{
  const wpStatuses = {
    ...ALL_OTHER_BLOCKERS_COMPLETED,
    commissioning: {
      'Full Systems Commissioning': { status: 'Not Applicable', progress: 0 },
      'Snagging / Punch List':      { status: 'Completed', progress: 100 },
    },
    pre_opening: { ...ALL_OTHER_BLOCKERS_COMPLETED.pre_opening, 'Deep Cleaning': { status: 'Completed', progress: 100 } },
    handover: {
      'Final Inspection':      { status: 'Completed', progress: 100 },
      'Acceptance & Transfer': { status: 'Completed', progress: 100 },
      'Keys & Possession':     { status: 'Completed', progress: 100 },
    },
  };
  const r = computeOpeningReadiness({ workPackageStatuses: wpStatuses }, iso(30));
  check("'Not Applicable' blocker is excluded from criticalChain", !r.criticalChain.some(b => b.wpId === 'comm.full_test'));
  check('requiredDays is 0 (only the N/A blocker was outstanding)', r.requiredDays === 0);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
