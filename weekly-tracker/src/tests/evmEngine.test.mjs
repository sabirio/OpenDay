// evmEngine.test.mjs — zero-dependency smoke tests. Run: node src/tests/evmEngine.test.mjs
//
// evmEngine.js uses Vite-style extensionless imports (./riskEngine, ../utils/reportUtils, etc.)
// which Node 22 ESM rejects. The same data: URL loader from riskEngine.test.mjs is used here
// to append '.js' to relative specifiers. No npm dependency needed.
//
// Date strategy: all project dates are RELATIVE TO Date.now() — never hardcoded calendar values.
//
// Key fixture design:
//   ovd  — "overdue" project: start=200d ago, end=100d ago → elapsed(200)>total(100) → PV=100 always.
//          Gives exact, timing-stable SPI because SPI = round(EV/100*100)/100 = EV/100.
//   mid  — "mid-project": start=50d ago, end=50d from now, total=100d.
//          elapsedDays = ceil(50d+epsilon) = 51, so PV=51 deterministically (test runs in <1s).
//   future — starts tomorrow, PV=0 (elapsed<0 → clipped to 0).
//
// Report shape used for spiHistory (progressAtIndex): same as computeTrend in riskEngine.test.mjs:
//   { workPackageStatuses: { [phaseId]: { [taskLabel]: { progress, status } } }, reportingDate: isoString }
//   Task labels are the exact strings from masterTaskLibrary.js WORK_PACKAGES.
//
// This file is NOT wired into runTests.js (that runner imports named exports from .js files).
// Run separately: node src/tests/evmEngine.test.mjs
//
// TODO (later batches): edge cases for pvAtDate with non-contiguous dates, SPI > 2 clamping.

import { register } from 'node:module';

const loaderSrc = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\\.[mc]?js$/)) {
    return nextResolve(specifier + '.js', context);
  }
  return nextResolve(specifier, context);
}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { computeEVM } = await import('../engines/evmEngine.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else      { fail++; console.log(`  ❌ ${name}`); }
};

const DAY = 86_400_000;
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

// ── Shared fixtures ────────────────────────────────────────────────────────────

// Overdue: elapsed=200d, total=100d → expectedPct=min(100,200)=100 → PV=100
const ovd = {
  constructionStartDate: iso(now - 200 * DAY),
  constructionEndDate:   iso(now - 100 * DAY),
  targetOpeningDate:     iso(now - 100 * DAY),
};

// Future: starts tomorrow → elapsedDays=max(0,ceil(-1))=0 → PV=0
const future = {
  constructionStartDate: iso(now + 1 * DAY),
  constructionEndDate:   iso(now + 101 * DAY),
};

// Mid: start 50d ago, end 50d from now → elapsed=ceil(50.xxx)=51 → PV=51
const mid = {
  constructionStartDate: iso(now - 50 * DAY),
  constructionEndDate:   iso(now + 50 * DAY),
  targetOpeningDate:     iso(now + 50 * DAY),
};

// ── A) NULL guard ──────────────────────────────────────────────────────────────
console.log('\nA) NULL guard — computeScheduleDeviation returns null → computeEVM returns null');

check('A1: no constructionStartDate → null',
  computeEVM({ constructionEndDate: iso(now + 100 * DAY) }, [], 50) === null);

check('A2: no end + no targetOpeningDate → null',
  computeEVM({ constructionStartDate: iso(now - 100 * DAY) }, [], 50) === null);

check('A3: end <= start → null',
  computeEVM({
    constructionStartDate: iso(now),
    constructionEndDate:   iso(now - DAY),
  }, [], 50) === null);

// ── B) SPI math ───────────────────────────────────────────────────────────────
// SPI = PV>0 ? round(EV/PV*100)/100 : (EV>0 ? 1 : 0).
// ovd project has PV=100 → SPI = EV/100 exactly (no rounding artifact for whole-number EV).
console.log('\nB) SPI math');

{
  const r60  = computeEVM(ovd, [], 60);
  const r100 = computeEVM(ovd, [], 100);
  check('B1: ovd EV=60  → SPI=0.6',     r60  !== null && r60.SPI  === 0.6);
  check('B2: ovd EV=100 → SPI=1',       r100 !== null && r100.SPI === 1);
  check('B3: ovd → BAC=100, EV=60, PV=100 fields present',
    r60 !== null && r60.BAC === 100 && r60.EV === 60 && r60.PV === 100);
}

// PV=0 edge: future project → falls back to EV>0?1:0
// Behavioral note: SPI=0 when both PV=0 and EV=0 → spiStatus 'critical' even for not-yet-started project.
{
  const rF50 = computeEVM(future, [], 50);
  const rF0  = computeEVM(future, [], 0);
  check('B4: future PV=0, EV=50 → SPI=1 (EV>0 fallback)',   rF50 !== null && rF50.SPI === 1);
  check('B5: future PV=0, EV=0  → SPI=0 (both-zero path)',  rF0  !== null && rF0.SPI  === 0);
}

// ── C) spiStatus thresholds ───────────────────────────────────────────────────
// >=1.0 on_track | >=0.95 minor_delay | >=0.85 significant_delay | else critical
// All using ovd (PV=100) so SPI = EV/100 exactly.
console.log('\nC) spiStatus thresholds');

check('C1: SPI=1.0  (EV=100) → on_track',          computeEVM(ovd, [], 100).spiStatus === 'on_track');
check('C2: SPI=0.97 (EV=97)  → minor_delay',       computeEVM(ovd, [], 97).spiStatus  === 'minor_delay');
check('C3: SPI=0.9  (EV=90)  → significant_delay', computeEVM(ovd, [], 90).spiStatus  === 'significant_delay');
check('C4: SPI=0.8  (EV=80)  → critical',          computeEVM(ovd, [], 80).spiStatus  === 'critical');

// ── D) EACdays ────────────────────────────────────────────────────────────────
// EACdays > 0 only when 0 < SPI < 1.  SPI >= 1 → EACdays=0, EAC = targetOpeningDate (unchanged).
// ovd: totalDays=100. SPI=0.6 → EACdays=round(100/0.6 - 100)=round(66.67)=67.
console.log('\nD) EACdays and EAC forecast date');

{
  const rOn  = computeEVM(ovd, [], 100);  // SPI=1.0
  const rBeh = computeEVM(ovd, [], 60);   // SPI=0.6

  // No targetOpeningDate project (same schedule, EAC should be null)
  const rNoTarget = computeEVM({
    constructionStartDate: ovd.constructionStartDate,
    constructionEndDate:   ovd.constructionEndDate,
  }, [], 60);

  check('D1: SPI>=1 → EACdays=0',             rOn.EACdays === 0);
  check('D2: SPI>=1 → EAC = targetOpeningDate (not shifted)',
    rOn.EAC !== null && rOn.EAC.getTime() === new Date(ovd.targetOpeningDate).getTime());
  check('D3: SPI<1  → EACdays=67',            rBeh.EACdays === 67);
  check('D4: SPI<1  → EAC after targetOpeningDate',
    rBeh.EAC !== null && rBeh.EAC.getTime() > new Date(ovd.targetOpeningDate).getTime());
  check('D5: no targetOpeningDate → EAC=null', rNoTarget.EAC === null);
}

// ── E) TCPI ───────────────────────────────────────────────────────────────────
// TCPI = round((100-EV)/(100-PV)*100)/100; null when 100-PV<=0.
// mid project PV=51 (deterministic). Checked values:
//   EV=80: TCPI=round(20/49*100)/100=0.41  → achievable (<=1.1)
//   EV=43: TCPI=round(57/49*100)/100=1.16  → challenging (>1.1 and <=1.2)
//   EV=30: TCPI=round(70/49*100)/100=1.43  → unrealistic (>1.2)
// All robust to PV±1 (range 50-52) since the boundary margins are wide.
console.log('\nE) TCPI — to-complete performance index');

// E1: ovd project PV=100 → remainingTime=0 → TCPI=null
check('E1: PV=100 (overdue) → TCPI=null', computeEVM(ovd, [], 60).TCPI === null);

{
  const rAch  = computeEVM(mid, [], 80);
  const rChal = computeEVM(mid, [], 43);
  const rUnr  = computeEVM(mid, [], 30);

  // Verify TCPI is actually computed (not null) for mid project
  check('E2: mid project → TCPI is a number (not null)',
    rAch !== null && rAch.TCPI !== null && typeof rAch.TCPI === 'number');

  check('E3: EV=80, PV=51 → tcpiStatus=achievable',         rAch  !== null && rAch.tcpiStatus  === 'achievable');
  check('E4: achievable   → tcpiWarning=null',               rAch  !== null && rAch.tcpiWarning === null);
  check('E5: EV=43, PV=51 → tcpiStatus=challenging',        rChal !== null && rChal.tcpiStatus === 'challenging');
  check('E6: challenging  → tcpiWarning is a string',        rChal !== null && typeof rChal.tcpiWarning === 'string');
  check('E7: EV=30, PV=51 → tcpiStatus=unrealistic',        rUnr  !== null && rUnr.tcpiStatus  === 'unrealistic');
  check('E8: unrealistic  → tcpiWarning contains "unrealistic"',
    rUnr !== null && typeof rUnr.tcpiWarning === 'string' && rUnr.tcpiWarning.includes('unrealistic'));
}

// ── F) spiHistory ─────────────────────────────────────────────────────────────
// spiHistory maps sortedReports → [{date, spi, ev, pv}] using progressAtIndex for ev
// and pvAtDate(project, reportingDate) for pv.
//
// Report shape: { workPackageStatuses: { phaseId → { taskLabel → { progress, status } } }, reportingDate }
// Task labels from masterTaskLibrary.js WORK_PACKAGES (exact strings).
//
// Fixture: ovd project (PV=100 at any date). Report 0 has empty WPS → ev=0, spi=0.
// Report 1 has rough_in fully done → cumulative ev=100 (only rough_in counted, weight=22/22=100%).
console.log('\nF) spiHistory — one point per report');

// F1: empty sortedReports → spiHistory = []
check('F1: no reports → spiHistory.length=0', computeEVM(ovd, [], 100).spiHistory.length === 0);

{
  const rep1 = {
    workPackageStatuses: {},              // no task entries → progressAtIndex → 0
    reportingDate: iso(now - 14 * DAY),
  };
  const rep2 = {
    workPackageStatuses: {
      rough_in: {
        'Wall Marking & Setting Out': { progress: 100, status: 'Completed' },
        'Wall Framing / Partitions':  { progress: 100, status: 'Completed' },
        'Electrical Rough-In':        { progress: 100, status: 'Completed' },
        'HVAC Ductwork':              { progress: 100, status: 'Completed' },
        'Plumbing Rough-In':          { progress: 100, status: 'Completed' },
        'Fire Protection Rough-In':   { progress: 100, status: 'Completed' },
      },
    },
    reportingDate: iso(now - 7 * DAY),
  };

  const r = computeEVM(ovd, [rep1, rep2], 100);
  check('F2: 2 reports → spiHistory.length=2',       r.spiHistory.length === 2);
  check('F3: entry has string date',                  typeof r.spiHistory[0].date === 'string');
  check('F4: entry has numeric spi',                  typeof r.spiHistory[0].spi  === 'number');
  check('F5: entry has numeric ev',                   typeof r.spiHistory[0].ev   === 'number');
  check('F6: entry has numeric pv',                   typeof r.spiHistory[0].pv   === 'number');
  // rep1 empty WPS → progressAtIndex returns 0 → ev=0, pv=100 (ovd) → spi=0
  check('F7: entry[0].ev=0 (no WPS data)',            r.spiHistory[0].ev === 0);
  // rep2 rough_in fully done → cumulative merge gives rough_in at 100% → ev=100
  check('F8: entry[1].ev>0 (rough_in complete)',      r.spiHistory[1].ev > 0);
}

console.log(`\n── RESULT: ${pass} passed, ${fail} failed ──\n`);
process.exit(fail === 0 ? 0 : 1);
