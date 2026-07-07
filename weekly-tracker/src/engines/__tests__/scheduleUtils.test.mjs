// scheduleUtils.test.mjs — unit tests for computeExpectedPct (AD-001) and the
// ISO-week / construction-week helpers added during the "no domain logic in
// UI" architecture-conformance pass (moved out of Dashboard.jsx,
// services/projectService.js and components/contractor/formHelpers.js).
// Run: node src/engines/__tests__/scheduleUtils.test.mjs

import {
  computeExpectedPct, DAY_MS,
  isoWeekToMonday, currentISOWeek,
  calculateWeeksBetween, getConstructionWeekInfo,
} from '../../utils/scheduleUtils.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const iso = (ms) => new Date(ms).toISOString().split('T')[0]; // 'YYYY-MM-DD'
const now    = new Date();
const nowMs  = now.getTime();

// ── A) Null / invalid input ──────────────────────────────────────────────────

console.log('\nA) Null / invalid inputs');

// A1: project is null
check('A1: null project → null',
  computeExpectedPct(null) === null);

// A2: no dates on project object
check('A2: no dates → null',
  computeExpectedPct({}) === null);

// A3: only startDate, no end → null
check('A3: start only → null',
  computeExpectedPct({ constructionStartDate: iso(nowMs) }) === null);

// A4: end === start → null (no window)
check('A4: end === start → null',
  computeExpectedPct({ constructionStartDate: iso(nowMs), constructionEndDate: iso(nowMs) }) === null);

// A5: end < start → null
check('A5: end < start → null',
  computeExpectedPct({
    constructionStartDate: iso(nowMs + DAY_MS),
    constructionEndDate:   iso(nowMs),
  }) === null);

// ── B) Boundary values ───────────────────────────────────────────────────────

console.log('\nB) Boundary values');

// B1: ref exactly at start → 0%
// Use new Date(dateStr) so ref matches the midnight-UTC date parsed internally.
{
  const startStr = iso(nowMs - 10 * DAY_MS);
  const endStr   = iso(nowMs + 90 * DAY_MS);
  const pct = computeExpectedPct(
    { constructionStartDate: startStr, constructionEndDate: endStr },
    new Date(startStr),
  );
  check('B1: ref at start → 0', pct === 0);
}

// B2: ref past end → 100% (clamped)
{
  const start = new Date(nowMs - 100 * DAY_MS);
  const end   = new Date(nowMs - 10 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    now,
  );
  check('B2: ref past end → 100', pct === 100);
}

// B3: ref before start → 0% (clamped, not negative)
{
  const start = new Date(nowMs + 10 * DAY_MS);
  const end   = new Date(nowMs + 110 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    now,
  );
  check('B3: ref before start → 0', pct === 0);
}

// ── C) Midpoint accuracy ─────────────────────────────────────────────────────

console.log('\nC) Midpoint accuracy');

// C1: 50-day window, ref at midpoint → ~50%
{
  const start = new Date(nowMs - 50 * DAY_MS);
  const end   = new Date(nowMs + 50 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    now,
  );
  check('C1: midpoint → ~50%', Math.abs(pct - 50) <= 1);
}

// C2: 25% through window
{
  const start = new Date(nowMs - 25 * DAY_MS);
  const end   = new Date(nowMs + 75 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    now,
  );
  check('C2: 25% through window', Math.abs(pct - 25) <= 1);
}

// ── D) targetOpeningDate fallback ────────────────────────────────────────────

console.log('\nD) targetOpeningDate fallback');

// D1: no constructionEndDate — falls back to targetOpeningDate
{
  const start = new Date(nowMs - 50 * DAY_MS);
  const end   = new Date(nowMs + 50 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), targetOpeningDate: iso(end.getTime()) },
    now,
  );
  check('D1: fallback to targetOpeningDate → ~50%', Math.abs(pct - 50) <= 1);
}

// D2: constructionEndDate takes priority over targetOpeningDate
{
  const start     = new Date(nowMs - 100 * DAY_MS);
  const earlyEnd  = new Date(nowMs - 10 * DAY_MS);  // already past → 100%
  const lateEnd   = new Date(nowMs + 100 * DAY_MS); // far future → ~50%
  const pct = computeExpectedPct(
    {
      constructionStartDate: iso(start.getTime()),
      constructionEndDate:   iso(earlyEnd.getTime()),
      targetOpeningDate:     iso(lateEnd.getTime()),
    },
    now,
  );
  check('D2: constructionEndDate preferred → 100 (not ~50)', pct === 100);
}

// ── E) referenceDate parameter ───────────────────────────────────────────────

console.log('\nE) referenceDate parameter');

// E1: earlier ref → lower pct than today
{
  const start   = new Date(nowMs - 100 * DAY_MS);
  const end     = new Date(nowMs + 100 * DAY_MS);
  const pastRef = new Date(nowMs - 50 * DAY_MS);
  const project = {
    constructionStartDate: iso(start.getTime()),
    constructionEndDate:   iso(end.getTime()),
  };
  const pctNow  = computeExpectedPct(project, now);
  const pctPast = computeExpectedPct(project, pastRef);
  check('E1: earlier ref → lower pct', pctPast < pctNow);
}

// E2: future ref past end → 100% (clamped)
{
  const start     = new Date(nowMs - 10 * DAY_MS);
  const end       = new Date(nowMs + 10 * DAY_MS);
  const futureRef = new Date(nowMs + 100 * DAY_MS);
  const pct = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    futureRef,
  );
  check('E2: future ref past end → 100', pct === 100);
}

// E3: string referenceDate accepted (not just Date objects)
{
  const start = new Date(nowMs - 50 * DAY_MS);
  const end   = new Date(nowMs + 50 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
    now.toISOString(),
  );
  check('E3: string referenceDate accepted → ~50%', Math.abs(pct - 50) <= 1);
}

// E4: default referenceDate = today (no second arg)
{
  const start = new Date(nowMs - 50 * DAY_MS);
  const end   = new Date(nowMs + 50 * DAY_MS);
  const pct   = computeExpectedPct(
    { constructionStartDate: iso(start.getTime()), constructionEndDate: iso(end.getTime()) },
  );
  check('E4: default referenceDate = today → ~50%', Math.abs(pct - 50) <= 1);
}

// ── F) isoWeekToMonday — pinned against pre-refactor Dashboard.jsx/projectService.js output ──

console.log('\nF) isoWeekToMonday');

// F1: known ISO week -> known Monday (2026-W27 -> 2026-06-29, verified against ISO 8601 calendar)
check('F1: 2026-W27 -> 2026-06-29 (Monday)',
  isoWeekToMonday('2026-W27').toISOString().split('T')[0] === '2026-06-29');

// F2: week 1 of 2027 (ISO week 1 is the week containing the year's first Thursday)
check('F2: 2027-W01 -> 2027-01-04 (Monday)',
  isoWeekToMonday('2027-W01').toISOString().split('T')[0] === '2027-01-04');

// F3: consecutive weeks are exactly 7 days apart
{
  const w1 = isoWeekToMonday('2026-W10').getTime();
  const w2 = isoWeekToMonday('2026-W11').getTime();
  check('F3: consecutive weeks are exactly 7 days apart', (w2 - w1) === 7 * DAY_MS);
}

// ── G) currentISOWeek — round-trips through isoWeekToMonday ──────────────────

console.log('\nG) currentISOWeek');

// G1: format is YYYY-Www
check('G1: format matches /^\\d{4}-W\\d{2}$/', /^\d{4}-W\d{2}$/.test(currentISOWeek()));

// G2: today falls within [monday, monday+7days) of its own reported week
{
  const now = new Date();
  const wk = currentISOWeek(now);
  const monday = isoWeekToMonday(wk);
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  check('G2: today is within [Monday, Monday+7d) of currentISOWeek(today)',
    todayUTC.getTime() >= monday.getTime() && todayUTC.getTime() < monday.getTime() + 7 * DAY_MS);
}

// G3: explicit reference date -> deterministic week (2026-07-07 is in ISO week 2026-W28)
check('G3: explicit reference date 2026-07-07 -> 2026-W28',
  currentISOWeek(new Date('2026-07-07T12:00:00Z')) === '2026-W28');

// ── H) calculateWeeksBetween / getConstructionWeekInfo — pinned against pre-refactor formHelpers.js output ──

console.log('\nH) calculateWeeksBetween / getConstructionWeekInfo');

check('H1: exactly 7 days -> 1 week', calculateWeeksBetween(new Date('2026-01-01'), new Date('2026-01-08')) === 1);
check('H2: 8 days -> rounds up to 2 weeks', calculateWeeksBetween(new Date('2026-01-01'), new Date('2026-01-09')) === 2);
check('H3: end before start -> clamped to 0, not negative', calculateWeeksBetween(new Date('2026-01-08'), new Date('2026-01-01')) === 0);

{
  const start = new Date('2026-01-01');
  const end   = new Date('2026-03-01'); // 59 days -> 9 weeks
  check('H4: reference before start -> weekNumber 0',
    getConstructionWeekInfo(start, end, new Date('2025-12-01')).weekNumber === 0);
  check('H5: reference at/after end -> weekNumber === totalWeeks (construction complete)',
    getConstructionWeekInfo(start, end, end).weekNumber === getConstructionWeekInfo(start, end, end).totalWeeks);
  check('H6: reference exactly at start -> week 1',
    getConstructionWeekInfo(start, end, start).weekNumber === 1);
  check('H7: weekNumber never exceeds totalWeeks even mid-window',
    getConstructionWeekInfo(start, end, new Date('2026-02-15')).weekNumber <= getConstructionWeekInfo(start, end, end).totalWeeks);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
