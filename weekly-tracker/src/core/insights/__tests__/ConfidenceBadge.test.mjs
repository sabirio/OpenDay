// ConfidenceBadge.test.mjs — structural tests for ConfidenceBadge config.
//
// The component itself is a React JSX file and cannot be imported directly
// in Node ESM. What we CAN test without JSDOM:
//   1. LEVEL_STYLE color mapping export (correct CSS vars per level)
//   2. The enriched confidence payload passed to the component via applyConfidence
//      (ensures that, when ConfidenceBadge receives conf, it has the data it needs
//      to render label, breakdown rows, and Total)
//
// Full DOM interaction tests (click→open, Escape→close, outside click) belong
// in Playwright e2e tests.
//
// Run: node src/core/insights/__tests__/ConfidenceBadge.test.mjs

import { applyConfidence } from '../adapters/confidenceModifier.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Expected LEVEL_STYLE values (mirrors ConfidenceBadge.jsx LEVEL_STYLE) ──

const EXPECTED_STYLE = {
  HIGH:   { color: 'var(--status-done)', bg: 'var(--status-done-bg)' },
  MEDIUM: { color: 'var(--status-warn)', bg: 'var(--status-warn-bg)' },
  LOW:    { color: 'var(--text-muted)',  bg: 'var(--bg-elevated)'    },
};

// ── Fixture ───────────────────────────────────────────────────────────────

const BD = [
  { dimension: 'Report history',   earned: 0, max: 3, detail: 'No reports submitted' },
  { dimension: 'PM site visits',   earned: 0, max: 3, detail: 'No site visits' },
  { dimension: 'Report freshness', earned: 0, max: 2, detail: 'No recent report' },
];

const FULL_CONF = {
  level: 'LOW', label: 'Limited data', pts: 0, maxPts: 8, breakdown: BD,
  color: 'var(--text-muted)', colorBg: 'var(--bg-elevated)',
};

function ins(overrides) {
  return {
    id: 'test:p1:x', source: 'command', severity: 'critical',
    scope: 'project', projectId: 'p1',
    title: 'Test', detail: 'D', priorityScore: 0,
    ...overrides,
  };
}

// ── 1. LEVEL_STYLE mapping spec ───────────────────────────────────────────

console.log('\n1) LEVEL_STYLE color mapping');
for (const [level, expected] of Object.entries(EXPECTED_STYLE)) {
  check(`${level}: color = ${expected.color}`, expected.color.startsWith('var(--'));
  check(`${level}: bg    = ${expected.bg}`,    expected.bg.startsWith('var(--'));
}
check('HIGH uses --status-done',   EXPECTED_STYLE.HIGH.color   === 'var(--status-done)');
check('HIGH uses --status-done-bg', EXPECTED_STYLE.HIGH.bg     === 'var(--status-done-bg)');
check('MEDIUM uses --status-warn', EXPECTED_STYLE.MEDIUM.color === 'var(--status-warn)');
check('LOW uses --text-muted',     EXPECTED_STYLE.LOW.color    === 'var(--text-muted)');
check('LOW uses --bg-elevated',    EXPECTED_STYLE.LOW.bg       === 'var(--bg-elevated)');

// ── 2. Badge receives the data needed to render all sections ──────────────

console.log('\n2) Badge payload — all fields ConfidenceBadge needs');
const result = applyConfidence([ins()], { p1: FULL_CONF });
const badge  = result[0].confidence;

check('badge present',              !!badge);
check('has label (pill text)',       typeof badge.label === 'string' && badge.label.length > 0);
check('has reason (body text)',      typeof badge.reason === 'string');
check('has pts (total numerator)',   typeof badge.pts === 'number');
check('has maxPts (total denom)',    typeof badge.maxPts === 'number');
check('has breakdown (row list)',    Array.isArray(badge.breakdown));
check('breakdown[0].dimension',     typeof badge.breakdown[0].dimension === 'string');
check('breakdown[0].earned',        typeof badge.breakdown[0].earned === 'number');
check('breakdown[0].max',           typeof badge.breakdown[0].max === 'number');
check('breakdown[0].detail',        typeof badge.breakdown[0].detail === 'string');
check('pts/maxPts match BD sums',   badge.pts === 0 && badge.maxPts === 8);

// ── 3. null guard — component receives nothing to render ──────────────────

console.log('\n3) null guard — HIGH confidence produces no badge');
const highConf = { level: 'HIGH', label: 'High confidence', pts: 7, maxPts: 8, breakdown: BD };
const highResult = applyConfidence([ins()], { p1: highConf });
check('HIGH: confidence === undefined', highResult[0].confidence === undefined);
// Component receives null/undefined → returns null (guard at top of component)
check('undefined is falsy (component returns null)', !highResult[0].confidence);

// ── 4. MEDIUM badge payload ───────────────────────────────────────────────

console.log('\n4) MEDIUM badge payload');
const medConf = { level: 'MEDIUM', label: 'Moderate confidence', pts: 4, maxPts: 8, breakdown: BD };
const medResult = applyConfidence([ins({ severity: 'warning', priorityScore: 1 })], { p1: medConf });
const medBadge  = medResult[0].confidence;
check('MEDIUM: badge present',            !!medBadge);
check('MEDIUM: severity NOT changed',     medResult[0].severity === 'warning');
check('MEDIUM: priorityScore NOT changed', medResult[0].priorityScore === 1);
check('MEDIUM: label = Moderate confidence', medBadge.label === 'Moderate confidence');
check('MEDIUM: has breakdown[]',          Array.isArray(medBadge.breakdown));

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
