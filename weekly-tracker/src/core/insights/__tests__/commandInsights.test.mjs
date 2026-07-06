// commandInsights.test.mjs — unit tests for the commandInsights adapter.
// Run: node src/core/insights/__tests__/commandInsights.test.mjs
import { commandsToInsights } from '../adapters/commandInsights.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else       { fail++; console.log(`  ❌ ${name}`); }
};

// ── Fixtures ──────────────────────────────────────────────────────────────
const CRITICAL_CMD = {
  id: 'behind_schedule', severity: 'critical',
  title: 'ST01 is 15% behind plan',
  reason: 'Actual 40% vs expected 55%, gap worsened vs last week',
  action: 'Escalate to GC — request recovery plan',
  projectCode: 'ST01',
};
const WARNING_CMD = {
  id: 'missing_report', severity: 'warning',
  title: 'ST02 — no report submitted this week',
  reason: 'Last report 8d ago',
  action: 'Chase PM for weekly report',
  projectCode: 'ST02',
};
const INFO_CMD = {
  id: 'all_clear', severity: 'info',
  title: 'ST03 — all clear',
  reason: 'No schedule issues, risk flags, or blockers detected',
  action: 'No action required',
  projectCode: 'ST03',
};

const CODE_TO_ID = { ST01: 'uuid-p1', ST02: 'uuid-p2' };

// ── 1. reason → detail, title → title ─────────────────────────────────────
console.log('\n1) reason maps to detail, title passes through');
const [c] = commandsToInsights([CRITICAL_CMD], CODE_TO_ID);
check('detail = reason',          c.detail === CRITICAL_CMD.reason);
check('title = title',            c.title === CRITICAL_CMD.title);
check('recommendedAction = action', c.recommendedAction === CRITICAL_CMD.action);

// ── 2. projectId resolution via codeToId ──────────────────────────────────
console.log('\n2) projectId resolved via codeToId; null when missing');
const [w] = commandsToInsights([WARNING_CMD], CODE_TO_ID);
const [i] = commandsToInsights([INFO_CMD], CODE_TO_ID);
check('ST01 → uuid-p1',           c.projectId === 'uuid-p1');
check('ST02 → uuid-p2',           w.projectId === 'uuid-p2');
check('ST03 → null (not in map)', i.projectId === null);

// ── 3. No codeToId → all projectId null ───────────────────────────────────
console.log('\n3) No codeToId argument → projectId null');
const [c2] = commandsToInsights([CRITICAL_CMD]);
check('projectId null with no map', c2.projectId === null);

// ── 4. severity passthrough + priorityScore ───────────────────────────────
console.log('\n4) severity passthrough + priorityScore per level');
check('critical severity passthrough', c.severity === 'critical');
check('critical priorityScore = 0',    c.priorityScore === 0);
check('warning severity passthrough',  w.severity === 'warning');
check('warning priorityScore = 1',     w.priorityScore === 1);
check('info severity passthrough',     i.severity === 'info');
check('info priorityScore = 2',        i.priorityScore === 2);

// ── 5. fixed fields ────────────────────────────────────────────────────────
console.log('\n5) Fixed fields: source, scope');
check('source = command',  c.source === 'command');
check('scope = project',   c.scope === 'project');

// ── 6. id stable / deterministic ─────────────────────────────────────────
console.log('\n6) id stable / deterministic');
const [a1] = commandsToInsights([CRITICAL_CMD], CODE_TO_ID);
const [a2] = commandsToInsights([CRITICAL_CMD], CODE_TO_ID);
check('id deterministic',                       a1.id === a2.id);
check('id = command:projectCode:commandId',     a1.id === `command:${CRITICAL_CMD.projectCode}:${CRITICAL_CMD.id}`);

// ── 7. empty input → [] ───────────────────────────────────────────────────
console.log('\n7) Empty input → []');
const empty = commandsToInsights([]);
check('empty → []', Array.isArray(empty) && empty.length === 0);

// ── 8. criticalBlockerTasks/softBlockerTasks passthrough ──────────────────
console.log('\n8) opening_at_risk blocker-task fields pass through; other commands default to []');
const OPENING_AT_RISK_CMD = {
  id: 'opening_at_risk', severity: 'warning',
  title: 'AA0011 opening date at risk — At Risk',
  reason: '2 critical + 1 soft blockers remaining',
  action: 'Confirm recovery plan / consider moving target date',
  projectCode: 'AA0011',
  criticalBlockerTasks: ['Fire safety', 'MEP handover'],
  softBlockerTasks: ['Snag list'],
};
const [o] = commandsToInsights([OPENING_AT_RISK_CMD]);
check('criticalBlockerTasks passes through', JSON.stringify(o.criticalBlockerTasks) === JSON.stringify(['Fire safety', 'MEP handover']));
check('softBlockerTasks passes through', JSON.stringify(o.softBlockerTasks) === JSON.stringify(['Snag list']));
check('commands without blocker fields default to empty arrays, not undefined',
  Array.isArray(c.criticalBlockerTasks) && c.criticalBlockerTasks.length === 0 &&
  Array.isArray(c.softBlockerTasks) && c.softBlockerTasks.length === 0);

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
