// commandEngine.test.mjs — getCommands() contract, focused on the
// opening_at_risk command's severity (shared openingSeverity ladder) and its
// named-blocker fields that drive Priorities Today's expandable detail.
// Run: node src/engines/commandEngine.test.mjs
//
// commandEngine.js uses Vite-style extensionless imports; same append-.js
// loader as riskEngine.test.mjs / progressEngine.test.mjs.
import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { getCommands } = await import('./commandEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

const PROJECT = { id: 'p1', storeCode: 'AA0011' };

console.log('\nopening_at_risk — named blocker fields');
{
  const openingReadiness = {
    status: 'At Risk',
    daysToOpening: 66,
    criticalBlockers: [{ task: 'Fire safety' }, { task: 'MEP handover' }],
    softBlockers: [{ task: 'Snag list' }],
  };
  const commands = getCommands({
    project: PROJECT, progressComparison: null, prevProgressComparison: null,
    riskScore: { level: 'LOW', factors: [] }, openingReadiness, latestReport: null, missingReport: false,
  });
  const cmd = commands.find(c => c.id === 'opening_at_risk');
  check('opening_at_risk command present', Boolean(cmd));
  check('severity is warning for At Risk', cmd.severity === 'warning');
  check('criticalBlockerTasks lists task names', JSON.stringify(cmd.criticalBlockerTasks) === JSON.stringify(['Fire safety', 'MEP handover']));
  check('softBlockerTasks lists task names', JSON.stringify(cmd.softBlockerTasks) === JSON.stringify(['Snag list']));
  check('reason mentions the count (unchanged)', cmd.reason === '2 critical + 1 soft blockers remaining');
}

console.log('\nopening_at_risk — Critical status escalates severity, still carries blocker names');
{
  const openingReadiness = {
    status: 'Critical',
    daysToOpening: 40,
    criticalBlockers: [{ task: 'Fire safety' }],
    softBlockers: [],
  };
  const commands = getCommands({
    project: PROJECT, progressComparison: null, prevProgressComparison: null,
    riskScore: { level: 'LOW', factors: [] }, openingReadiness, latestReport: null, missingReport: false,
  });
  const cmd = commands.find(c => c.id === 'opening_at_risk');
  check('severity escalates to critical', cmd.severity === 'critical');
  check('criticalBlockerTasks still present', JSON.stringify(cmd.criticalBlockerTasks) === JSON.stringify(['Fire safety']));
  check('softBlockerTasks is empty array, not undefined', Array.isArray(cmd.softBlockerTasks) && cmd.softBlockerTasks.length === 0);
}

console.log('\nno opening_at_risk when readiness is healthy');
{
  const commands = getCommands({
    project: PROJECT, progressComparison: null, prevProgressComparison: null,
    riskScore: { level: 'LOW', factors: [] }, openingReadiness: { status: 'Ready', criticalBlockers: [], softBlockers: [] },
    latestReport: null, missingReport: false,
  });
  check('no opening_at_risk command, falls through to all_clear', commands.some(c => c.id === 'all_clear') && !commands.some(c => c.id === 'opening_at_risk'));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
