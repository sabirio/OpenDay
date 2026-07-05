// computeWPObservationDiscrepancy.test.mjs — P2.2 PM-vs-GC discrepancy contract.
// Run: node src/engines/__tests__/computeWPObservationDiscrepancy.test.mjs
//
// This is the exact computation siteVisitService.submitSiteVisit() persists
// to site_visit_wps.discrepancy_status/discrepancy_delta, and what
// GanttSuccessView.jsx now reads back (via signedDelta/status) instead of
// recalculating with a different tolerance — see the P2.2 fix in
// GanttSuccessView.jsx for the bug this was previously producing.

import { computeWPObservationDiscrepancy } from '../discrepancyEngine.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

console.log('\ncomputeWPObservationDiscrepancy - progress-based delta');

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 100, gc_status: 'completed', observed_progress: 60, observed_status: 'in_progress' });
  check('GC overstates (100 vs 60) -> negative signedDelta', r.signedDelta === -40);
  check('GC overstates -> critical (abs 40 >= 20)', r.discStatus === 'critical');
}

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 50, gc_status: 'in_progress', observed_progress: 70, observed_status: 'in_progress' });
  check('PM finds more progress (50 vs 70) -> positive signedDelta', r.signedDelta === 20);
  check('PM ahead by 20 -> critical', r.discStatus === 'critical');
}

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 50, gc_status: 'in_progress', observed_progress: 55, observed_status: 'in_progress' });
  check('small 5pp gap -> ok, not warning/critical', r.discStatus === 'ok');
  check('small gap still has a nonzero signedDelta', r.signedDelta === 5);
}

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 60, gc_status: 'in_progress', observed_progress: 60, observed_status: 'in_progress' });
  check('exact match -> zero delta, ok', r.signedDelta === 0 && r.discStatus === 'ok');
}

console.log('\ncomputeWPObservationDiscrepancy - status-rank fallback at 0% progress');

{
  // Both report 0% progress but disagree on status — progress delta is 0,
  // so the rank-based fallback (×10) must kick in, even though
  // gcProgress === pmProgress === 0.
  const r = computeWPObservationDiscrepancy({ gc_progress: 0, gc_status: 'not_started', observed_progress: 0, observed_status: 'blocked' });
  check('not_started(0) vs blocked(-2) at 0% progress -> rank fallback fires', r.signedDelta === -20);
  check('rank-fallback critical delta is flagged critical', r.discStatus === 'critical');
  check('progress values are tied even though this is a real discrepancy (the case GanttSuccessView must not miss)',
    r.gcProgress === r.pmProgress);
}

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 0, gc_status: 'not_started', observed_progress: 0, observed_status: 'not_started' });
  check('both not_started at 0% -> no discrepancy', r.signedDelta === 0 && r.discStatus === 'ok');
}

console.log('\ncomputeWPObservationDiscrepancy - defaults for missing fields');

{
  const r = computeWPObservationDiscrepancy({});
  check('fully empty input defaults to not_started/0 on both sides -> no discrepancy', r.signedDelta === 0 && r.discStatus === 'ok');
}

{
  const r = computeWPObservationDiscrepancy({ gc_progress: 40, gc_status: 'in_progress' });
  check('missing observed_status falls back to gcStatus, missing observed_progress falls back to 0',
    r.signedDelta === -40 && r.discStatus === 'critical');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
