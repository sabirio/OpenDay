// escalationEngine.test.mjs — engine-audit regression (2026-07-16): this
// file had zero test coverage of any kind. Section D ("PM site visit
// mismatch") specifically proves the fix in pmAlignmentEngine.js: before
// that fix, computePmAlignmentItems couldn't read Gantt-format site visits
// (pmVisit.wps) at all, so this escalation could never fire for the app's
// actual primary site-visit flow — silently, with no error, just zero
// items and zero overstatements every time.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeEscalations } = await import('./escalationEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

console.log('\ncomputeEscalations — A) repeated risk');
{
  const reports = [
    { reportingDate: iso(now - 20 * DAY), risks: ['Weather delay'], riskOwners: ['GC'] },
    { reportingDate: iso(now - 10 * DAY), risks: ['Weather delay'], riskOwners: ['GC'] },
  ];
  const results = computeEscalations(reports, []);
  check('risk reported twice escalates', results.some(r => r.type === 'risk' && r.label === 'Weather delay'));
}

console.log('\ncomputeEscalations — D) PM site visit mismatch, Gantt format (engine-audit regression)');
{
  const reportDate = iso(now - 5 * DAY);
  const reports = [{ reportingDate: reportDate, submittedAt: reportDate, risks: [], riskOwners: [], activitiesBlocked: 'No' }];
  const visit = {
    visitDate: iso(now - 1 * DAY),
    wps: [
      { wp_id: 'demolition',  gc_status: 'Completed', observed_status: 'Not Started' }, // diff=1.0 → overstate
      { wp_id: 'floor_prep',  gc_status: 'Completed', observed_status: 'In Progress' }, // diff=0.5 → overstate
      { wp_id: 'rough_in',    gc_status: 'In Progress', observed_status: 'In Progress' }, // diff=0 → match
    ],
  };
  const results = computeEscalations(reports, [visit]);
  const mismatch = results.find(r => r.type === 'mismatch');
  check('2 overstated WPs on a Gantt-format visit escalates "PM Site Visit mismatch"', mismatch !== undefined);
  check('escalation description reports the correct overstatement count', mismatch?.description === 'GC overstated 2 work items vs PM site visit');
  check('severity is HIGH at exactly 2 overstatements (CRITICAL threshold is >=4)', mismatch?.severity === 'HIGH');
}

console.log('\ncomputeEscalations — D) below-threshold Gantt mismatch does not escalate');
{
  const reportDate = iso(now - 5 * DAY);
  const reports = [{ reportingDate: reportDate, submittedAt: reportDate, risks: [], riskOwners: [], activitiesBlocked: 'No' }];
  const visit = {
    visitDate: iso(now - 1 * DAY),
    wps: [{ wp_id: 'demolition', gc_status: 'Completed', observed_status: 'Not Started' }], // only 1 overstatement
  };
  const results = computeEscalations(reports, [visit]);
  check('1 overstated WP does not escalate (threshold is >=2)', results.every(r => r.type !== 'mismatch'));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
