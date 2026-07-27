// homePresentation.test.mjs — unit tests for Home's presentation-only helpers.
// Run: node src/components/home/__tests__/homePresentation.test.mjs
import { severityTone, countTone, getPortfolioState, displayAction, TONE } from '../homePresentation.js';

let pass = 0, fail = 0;
const check = (name, cond) => cond ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));

// ── severityTone: highest-severity-wins ─────────────────────────────────
check('severityTone: critical wins over warning', severityTone({ critical: 1, warning: 5 }) === TONE.alert);
check('severityTone: warning wins when no critical', severityTone({ critical: 0, warning: 2 }) === TONE.warn);
check('severityTone: done when neither present', severityTone({ critical: 0, warning: 0 }) === TONE.done);

// ── countTone ────────────────────────────────────────────────────────────
check('countTone: default concern tone is warn', countTone(3) === TONE.warn);
check('countTone: zero falls back to done by default', countTone(0) === TONE.done);
check('countTone: custom concern tone honored', countTone(2, TONE.alert) === TONE.alert);
check('countTone: custom rest tone honored', countTone(0, TONE.warn, TONE.muted) === TONE.muted);

// ── getPortfolioState (P0-4: empty vs healthy vs active) ────────────────
check('getPortfolioState: zero projects is empty regardless of insight count', getPortfolioState(0, 0) === 'empty');
check('getPortfolioState: zero projects is empty even if insightTotal were nonzero', getPortfolioState(0, 3) === 'empty');
check('getPortfolioState: populated portfolio with zero insights is healthy', getPortfolioState(5, 0) === 'healthy');
check('getPortfolioState: populated portfolio with insights is active', getPortfolioState(5, 2) === 'active');

// ── displayAction (P0-3: role-aware action text) ─────────────────────────
const PM_ACTION = 'Chase PM for weekly report';
check('displayAction: PM sees the actual recommendedAction verbatim', displayAction('PM', PM_ACTION) === PM_ACTION);
check('displayAction: Viewer does not see PM-prescriptive text', displayAction('Viewer', PM_ACTION) === 'Needs review');
check('displayAction: Admin does not see PM-prescriptive text', displayAction('Admin', PM_ACTION) === 'Needs review');
check('displayAction: Viewer text is not the PM string under any wording', displayAction('Viewer', 'Escalate to GC — request recovery plan') !== 'Escalate to GC — request recovery plan');
check('displayAction: no recommendedAction yields null for every role', displayAction('PM', null) === null && displayAction('Viewer', undefined) === null);

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
