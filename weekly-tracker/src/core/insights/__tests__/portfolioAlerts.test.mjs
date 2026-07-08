// portfolioAlerts.test.mjs — unit tests for the portfolioAlerts adapter + sortInsights.
// Run: node src/core/insights/__tests__/portfolioAlerts.test.mjs
//
// NOTE: portfolioAlerts.js imports engines/riskEngine.js, which uses Vite-style
// extensionless imports (e.g. '../utils/reportUtils') that Node ESM rejects.
// Same loader trick as tests/riskEngine.test.mjs — appends '.js' to relative
// specifiers lacking an extension.
import { register } from 'node:module';
const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

// Dynamic import AFTER loader is registered — static imports are hoisted
// above register() and would resolve before the hook applies.
const { alertsToInsights } = await import('../adapters/portfolioAlerts.js');
const { sortInsights }     = await import('../insight.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const CRITICAL_ALERT = {
  sev: 'CRITICAL', pid: 'p1', code: 'ST01', mall: 'Mall A',
  reason: 'Opening approaching — low progress',
  detail: '5d to open · Progress 40%',
  action: 'Immediate escalation required',
};
const HIGH_ALERT = {
  sev: 'HIGH', pid: 'p2', code: 'ST02', mall: 'Mall B',
  reason: 'Activities blocked',
  detail: 'Concrete supply shortage',
  action: 'PM intervention required',
};
const MEDIUM_ALERT = {
  sev: 'MEDIUM', pid: 'p3', code: 'ST03', mall: 'Mall C',
  reason: 'Minor delay',
  detail: 'Weather impact',
  action: 'Monitor',
};

// ── 1. CRITICAL maps correctly ─────────────────────────────────────────────
console.log('\n1) CRITICAL alert → severity critical, priorityScore 0');
const [c] = alertsToInsights([CRITICAL_ALERT]);
check('severity = critical',      c.severity === 'critical');
check('priorityScore = 0',        c.priorityScore === 0);
check('source = portfolio',       c.source === 'portfolio');
check('scope = project',          c.scope === 'project');
check('projectId = p1',           c.projectId === 'p1');
check('title = code — reason',    c.title === `${CRITICAL_ALERT.code} — ${CRITICAL_ALERT.reason}`);
check('detail preserved',         c.detail === CRITICAL_ALERT.detail);
check('recommendedAction = action', c.recommendedAction === CRITICAL_ALERT.action);

// ── 2. HIGH maps correctly ─────────────────────────────────────────────────
console.log('\n2) HIGH alert → severity warning, priorityScore 1');
const [h] = alertsToInsights([HIGH_ALERT]);
check('severity = warning',   h.severity === 'warning');
check('priorityScore = 1',    h.priorityScore === 1);
check('projectId = p2',       h.projectId === 'p2');

// ── 3. Unknown sev falls through to info ──────────────────────────────────
console.log('\n3) Unknown sev (MEDIUM) → severity info, priorityScore 2');
const [m] = alertsToInsights([MEDIUM_ALERT]);
check('severity = info',      m.severity === 'info');
check('priorityScore = 2',    m.priorityScore === 2);

// ── 4. id is stable and deterministic ─────────────────────────────────────
console.log('\n4) id is stable / deterministic');
const [a1] = alertsToInsights([CRITICAL_ALERT]);
const [a2] = alertsToInsights([CRITICAL_ALERT]);
check('id deterministic',         a1.id === a2.id);
check('id format portfolio:pid:reason', a1.id === `portfolio:${CRITICAL_ALERT.pid}:${CRITICAL_ALERT.reason}`);

// ── 5. sortInsights orders critical before warning ────────────────────────
console.log('\n5) sortInsights: critical before warning');
const mixed = alertsToInsights([HIGH_ALERT, CRITICAL_ALERT]);
const sorted = sortInsights(mixed);
check('sorted[0] priorityScore = 0',  sorted[0].priorityScore === 0);
check('sorted[1] priorityScore = 1',  sorted[1].priorityScore === 1);
check('sorted[0] severity = critical', sorted[0].severity === 'critical');
check('sortInsights does not mutate input', mixed[0].severity === 'warning');

// ── 6. Empty input → [] ───────────────────────────────────────────────────
console.log('\n6) Empty input → []');
const empty = alertsToInsights([]);
check('empty input → empty array',    Array.isArray(empty) && empty.length === 0);
check('sortInsights([]) → []',        sortInsights([]).length === 0);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
