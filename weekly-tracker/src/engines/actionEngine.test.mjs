// actionEngine.test.mjs — engine-audit regression (2026-07-16): this file
// had zero test coverage, which is exactly how computeRecommendedActions'
// PM-mismatch check silently missing the "Severity gap (PM vs GC)" factor
// name went undetected. Also the first direct test of
// computeRecommendedActions itself.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeRecommendedActions } = await import('./actionEngine.js');
const { PM_MISMATCH_FACTOR_NAMES } = await import('./riskEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const project = { targetOpeningDate: null };
const latestReport = { reportingDate: new Date().toISOString(), activitiesBlocked: 'No' };
const contScore = { pmAlignmentScore: 90 };
const projSiteVisits = [{ id: 'visit-1' }];

console.log('\ncomputeRecommendedActions — no report at all');
{
  const actions = computeRecommendedActions({ level: 'LOW', score: 0, factors: [] }, contScore, null, null, [], project);
  check('returns the single "request first report" action', actions.length === 1 && /first weekly report/.test(actions[0].action));
}

console.log('\ncomputeRecommendedActions — PM mismatch action (engine-audit regression)');
{
  for (const name of PM_MISMATCH_FACTOR_NAMES) {
    const riskScore = { level: 'MEDIUM', score: 30, factors: [{ name, pts: 5, value: 'test' }] };
    const actions = computeRecommendedActions(riskScore, contScore, null, latestReport, projSiteVisits, project);
    check(`"${name}" alone triggers the joint walkthrough action`, actions.some(a => /walkthrough/.test(a.action)));
  }

  const noMismatch = { level: 'LOW', score: 0, factors: [{ name: 'Report staleness', pts: 3 }] };
  const actionsNoMismatch = computeRecommendedActions(noMismatch, contScore, null, latestReport, projSiteVisits, project);
  check('an unrelated factor does not trigger the walkthrough action', !actionsNoMismatch.some(a => /walkthrough/.test(a.action)));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
