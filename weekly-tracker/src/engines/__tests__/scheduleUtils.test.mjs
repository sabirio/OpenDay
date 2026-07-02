// scheduleUtils.test.mjs — unit tests for computeExpectedPct (AD-001)
// Run: node src/engines/__tests__/scheduleUtils.test.mjs

import { computeExpectedPct, DAY_MS } from '../../utils/scheduleUtils.js';

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

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
