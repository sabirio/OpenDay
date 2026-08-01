// portfolioRiskEngine.test.mjs — engine-audit regression (2026-07-16):
// this file had zero test coverage of any kind, which is exactly how
// computeRiskSummaryStats' pmMismatch count silently missing the "Severity
// gap (PM vs GC)" factor name went undetected. Also the first direct test
// of computeRiskSummaryStats itself.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeRiskSummaryStats } = await import('./portfolioRiskEngine.js');
const { PM_MISMATCH_FACTOR_NAMES } = await import('./riskEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

function row({ level = 'LOW', score = 0, factors = [], health = 80, daysToOpening = null }) {
  return { riskScore: { level, score, factors }, health: { score: health }, daysToOpening };
}

console.log('\ncomputeRiskSummaryStats — level/avg counters');
{
  const stats = computeRiskSummaryStats([
    row({ level: 'CRITICAL', score: 90, health: 20 }),
    row({ level: 'LOW', score: 10, health: 90 }),
  ]);
  check('level counts', stats.CRITICAL === 1 && stats.LOW === 1 && stats.HIGH === 0 && stats.MEDIUM === 0);
  check('avgScore is the mean of riskScore.score', stats.avgScore === 50);
  check('avgHealth is the mean of health.score', stats.avgHealth === 55);
  check('empty input does not crash and returns zeros', computeRiskSummaryStats([]).avgScore === 0);
}

console.log('\ncomputeRiskSummaryStats — pmMismatch (engine-audit regression)');
{
  for (const name of PM_MISMATCH_FACTOR_NAMES) {
    const stats = computeRiskSummaryStats([row({ factors: [{ name, pts: 5 }] })]);
    check(`"${name}" alone is counted as a PM mismatch`, stats.pmMismatch === 1);
  }
  const mixed = computeRiskSummaryStats([
    row({ factors: [{ name: 'Severity gap (PM vs GC)', pts: 5 }] }),
    row({ factors: [{ name: 'Report staleness', pts: 3 }] }),
  ]);
  check('unrelated-factor row is not counted', mixed.pmMismatch === 1);
}

console.log('\ncomputeRiskSummaryStats — Phase 3D.1: null health.score (NOT_ASSESSABLE) excluded from avgHealth');
{
  const withOneNotAssessable = computeRiskSummaryStats([
    row({ level: 'LOW', score: 10, health: 90 }),
    row({ level: 'LOW', score: 0, health: 80 }),
    row({ level: 'LOW', score: 0, health: null }), // NOT_ASSESSABLE — must not count as 0
  ]);
  check('avgHealth averages only the two assessable rows (85), not coerced-to-0 across three', withOneNotAssessable.avgHealth === 85);

  const allNotAssessable = computeRiskSummaryStats([
    row({ health: null }),
    row({ health: null }),
  ]);
  check('all-NOT_ASSESSABLE input -> avgHealth is 0 (empty-average fallback), not NaN', allNotAssessable.avgHealth === 0);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
