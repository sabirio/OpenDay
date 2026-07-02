// homeInsights.test.mjs — unit tests for buildHomeInsights + summarizeInsights.
// Run: node src/core/insights/__tests__/homeInsights.test.mjs
import { buildHomeInsights, summarizeInsights } from '../selectors/homeInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const PROJECTS = [
  { id: 'uuid-p1', storeCode: 'ST01', shoppingMallName: 'Mall A' },
  { id: 'uuid-p2', storeCode: 'ST02', shoppingMallName: 'Mall B' },
];

const ALERTS = [
  { sev: 'CRITICAL', pid: 'uuid-p1', code: 'ST01', mall: 'Mall A', reason: 'Opening approaching — low progress', detail: '5d to open · 40%', action: 'Escalate' },
  { sev: 'HIGH',     pid: 'uuid-p2', code: 'ST02', mall: 'Mall B', reason: 'Activities blocked', detail: 'Concrete supply', action: 'PM intervention' },
];

const COMMANDS = [
  { id: 'behind_schedule', severity: 'warning', title: 'ST01 is 15% behind plan', reason: 'Actual 40% vs expected 55%', action: 'Review with GC', projectCode: 'ST01' },
  { id: 'all_clear',       severity: 'info',    title: 'ST02 — all clear',        reason: 'No issues',                  action: 'No action',     projectCode: 'ST02' },
];

// Duplicate alert — same id as ALERTS[0] mapped through alertsToInsights
// id = `portfolio:uuid-p1:Opening approaching — low progress`
const DUP_ALERT = [
  { sev: 'CRITICAL', pid: 'uuid-p1', code: 'ST01', mall: 'Mall A', reason: 'Opening approaching — low progress', detail: 'DUPLICATE', action: 'X' },
];

const ROWS = PROJECTS.map(p => ({ project: p }));

// ── 1. buildHomeInsights merges + sorts (critical before warning) ──────────
console.log('\n1) buildHomeInsights: merges + sorts critical before warning');
const insights = buildHomeInsights({ rows: ROWS, alerts: ALERTS, commands: COMMANDS, projects: PROJECTS });
check('returns array',                  Array.isArray(insights));
check('has items',                      insights.length > 0);
check('first item is critical (score 0)', insights[0]?.priorityScore === 0);
check('sorted asc by priorityScore',    insights.every((ins, i) => i === 0 || ins.priorityScore >= insights[i - 1].priorityScore));

// ── 2. codeToId resolves command projectId; null when code missing ─────────
console.log('\n2) codeToId: command projectId resolved via projects');
const cmdInsight = insights.find(ins => ins.source === 'command' && ins.id.includes('ST01'));
const unknownCmdInsights = buildHomeInsights({
  rows: ROWS, alerts: [],
  commands: [{ id: 'x', severity: 'info', title: 'T', reason: 'R', action: 'A', projectCode: 'UNKNOWN' }],
  projects: PROJECTS,
});
check('ST01 command → projectId = uuid-p1',     cmdInsight?.projectId === 'uuid-p1');
check('unknown code → projectId = null',         unknownCmdInsights[0]?.projectId === null);

// ── 3. Deduplication: id collision removed (first wins) ───────────────────
console.log('\n3) Deduplication across alerts + commands');
// Build insights where same alert id appears twice (from dup_alert)
const dupInsights = buildHomeInsights({ rows: ROWS, alerts: [...ALERTS, ...DUP_ALERT], commands: [], projects: PROJECTS });
const critId = `portfolio:uuid-p1:Opening approaching — low progress`;
const matchingItems = dupInsights.filter(ins => ins.id === critId);
check('only 1 item for duplicated alert id',     matchingItems.length === 1);
check('first-wins: original detail kept',        matchingItems[0]?.detail === ALERTS[0].detail);

// ── 4. summarizeInsights counts per severity correctly ────────────────────
console.log('\n4) summarizeInsights counts per severity');
const mockInsights = [
  { id: 'a', severity: 'critical', priorityScore: 0 },
  { id: 'b', severity: 'critical', priorityScore: 0 },
  { id: 'c', severity: 'warning',  priorityScore: 1 },
  { id: 'd', severity: 'info',     priorityScore: 2 },
  { id: 'e', severity: 'positive', priorityScore: 3 },
];
const s = summarizeInsights(mockInsights);
check('critical = 2',   s.critical === 2);
check('warning = 1',    s.warning  === 1);
check('info = 1',       s.info     === 1);
check('positive = 1',   s.positive === 1);
check('total = 5',      s.total    === 5);

// ── 5. summarizeInsights: empty → all zeros ───────────────────────────────
console.log('\n5) summarizeInsights: empty → all zeros');
const z = summarizeInsights([]);
check('critical = 0',   z.critical === 0);
check('warning = 0',    z.warning  === 0);
check('info = 0',       z.info     === 0);
check('total = 0',      z.total    === 0);

// ── 6. Integration: confidence dampening in buildHomeInsights ─────────────
console.log('\n6) Confidence dampening — LOW critical → warning, sinks below confident critical');

function makeConf(level, label) {
  return {
    level, label,
    pts: level === 'HIGH' ? 7 : 1,
    maxPts: 8,
    breakdown: [
      { dimension: 'Report history',   earned: level === 'HIGH' ? 3 : 0, max: 3, detail: level === 'HIGH' ? '8+ reports' : 'No reports submitted' },
      { dimension: 'PM site visits',   earned: 0, max: 3, detail: 'No site visits' },
      { dimension: 'Report freshness', earned: level === 'HIGH' ? 2 : 2, max: 2, detail: 'Last report 3d ago' },
    ],
  };
}

// p1 = LOW confidence, p2 = HIGH confidence; both have a critical command
const confRows = [
  { project: PROJECTS[0], confidence: makeConf('LOW',  'Limited data') },
  { project: PROJECTS[1], confidence: makeConf('HIGH', 'High confidence') },
];
const confCommands = [
  { id: 'behind_schedule', severity: 'critical', title: 'ST01 is 30% behind', reason: 'Behind schedule', action: 'Escalate', projectCode: 'ST01' },
  { id: 'behind_schedule', severity: 'critical', title: 'ST02 is 20% behind', reason: 'Behind schedule', action: 'Escalate', projectCode: 'ST02' },
];
const confInsights = buildHomeInsights({ rows: confRows, alerts: [], commands: confCommands, projects: PROJECTS });

const st01 = confInsights.find(i => i.projectId === 'uuid-p1' && i.source === 'command');
const st02 = confInsights.find(i => i.projectId === 'uuid-p2' && i.source === 'command');

check('ST01 (LOW conf) critical → warning',      st01?.severity === 'warning');
check('ST01 has confidence badge',               !!st01?.confidence);
check('ST01 badge level = LOW',                  st01?.confidence?.level === 'LOW');
check('ST01 priorityScore = 0.5 (0 + 0.5)',     st01?.priorityScore === 0.5);
check('ST02 (HIGH conf) stays critical',         st02?.severity === 'critical');
check('ST02 no confidence badge',                !st02?.confidence);
check('ST02 priorityScore = 0 (untouched)',      st02?.priorityScore === 0);

// After buildHomeInsights sorts by priorityScore: ST02 (0) before ST01 (0.5)
const idxST01 = confInsights.indexOf(st01);
const idxST02 = confInsights.indexOf(st02);
check('confident critical (ST02, score=0) before LOW-conf dampened (ST01, score=0.5)', idxST02 < idxST01);

// Confidence card for ST01 (no reports) should also appear (rule A)
const confCard = confInsights.find(i => i.projectId === 'uuid-p1' && i.source === 'confidence');
check('data-absence card emitted for ST01',      !!confCard);
check('data-absence card severity = warning',    confCard?.severity === 'warning');
check('data-absence card priorityScore = 5',     confCard?.priorityScore === 5);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
