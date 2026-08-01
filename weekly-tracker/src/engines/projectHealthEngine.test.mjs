// projectHealthEngine.test.mjs — Simplification Phase 3D.1, Section 7/14.
// Run: node src/engines/projectHealthEngine.test.mjs
//
// projectHealthEngine.js uses Vite-style extensionless imports (reasonUtils);
// same append-.js loader as riskEngine.test.mjs / openingReadinessEngine.test.mjs.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeProjectHealth } = await import('./projectHealthEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

// The exact worked false-signal from the Phase 3D.1 audit: a brand-new
// CONTRACTOR_MANAGED project with zero reports blends riskScore.score=20
// (the OLD computeNoReportsRisk base, pre-3D.1) + 0% progress + the
// contractorEngine.js no-reports default (performanceScore/pmAlignmentScore
// 50, breakdown.pmAlignment 15) into score=47 -> 'Critical'.
const noReportsRiskScore = { score: 20 };
const defaultContScore = { performanceScore: 50, pmAlignmentScore: 50, breakdown: { pmAlignment: 15 } };

console.log('\nLegacy/ASSESSABLE path is byte-identical to pre-3D.1 behavior (regression net)');
{
  const hOmitted  = computeProjectHealth(noReportsRiskScore, 0, defaultContScore, null);
  const hExplicit = computeProjectHealth(noReportsRiskScore, 0, defaultContScore, null, 'ASSESSABLE');
  check('omitted assessmentAvailability reproduces the known false "Critical" (score 47)', hOmitted.score === 47);
  check('omitted assessmentAvailability -> level Critical (unchanged legacy bug, not fixed by this branch)', hOmitted.level === 'Critical');
  check('explicit ASSESSABLE matches omitted exactly', hExplicit.score === hOmitted.score && hExplicit.level === hOmitted.level);
  check('ASSESSABLE result carries assessmentAvailability field', hExplicit.assessmentAvailability === 'ASSESSABLE');
  check('ASSESSABLE result has null reasonCode', hExplicit.reasonCode === null);
}

console.log('\nNOT_ASSESSABLE short-circuits before blending any of the three fabricated-default inputs');
{
  const h = computeProjectHealth(noReportsRiskScore, 0, defaultContScore, null, 'NOT_ASSESSABLE');
  check('score is null, never a fabricated number', h.score === null);
  check('level is Not Assessable, never Critical/Attention/Healthy', h.level === 'Not Assessable');
  check('color is neutral (not the alert/critical color)', h.color === 'var(--text-muted)');
  check('bg is neutral', h.bg === 'var(--bg-elevated)');
  check('assessmentAvailability is NOT_ASSESSABLE', h.assessmentAvailability === 'NOT_ASSESSABLE');
  check('reasonCode is AWAITING_SCHEDULE_COMMITMENT', h.reasonCode === 'AWAITING_SCHEDULE_COMMITMENT');
  check('reasons is a single neutral entry, no critical/warning reasons', h.reasons.length === 1 && h.reasons[0].type === 'neutral');
}

console.log('\nNOT_ASSESSABLE never mislabels as healthy either');
{
  // Even if the raw inputs happen to look "good" (e.g. contScore defaults
  // are middling, not alarming), NOT_ASSESSABLE must still report neutrally
  // rather than rounding up to "Healthy" — there is nothing real to certify
  // as healthy yet.
  const h = computeProjectHealth({ score: 0 }, 0, defaultContScore, null, 'NOT_ASSESSABLE');
  check('score stays null even with a "good-looking" riskScore.score of 0', h.score === null);
  check('level stays Not Assessable, never Healthy', h.level === 'Not Assessable');
}

console.log('\nGenuine evidence still produces a real score once ASSESSABLE (sanity check, unrelated to commitment gate)');
{
  const healthyRisk = { score: 5 };
  const healthyCont = { performanceScore: 90, pmAlignmentScore: 90, breakdown: { pmAlignment: 28 } };
  const h = computeProjectHealth(healthyRisk, 95, healthyCont, { activitiesBlocked: 'No', supportRequired: 'No' }, 'ASSESSABLE');
  check('a genuinely healthy project still scores high once ASSESSABLE', h.score >= 75);
  check('level is Healthy', h.level === 'Healthy');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
