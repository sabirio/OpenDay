// Gantt Engine Tests — runs in plain Node.js (no React)
// Shared with runTests.js via named exports.

import {
  buildProjectWPs,
  calculateGantt,
  checkFeasibility,
  calculateKeyDates,
  calculateForecastOpening,
  recalculateOnDelay,
  addDays,
  diffDays,
} from '../engines/ganttEngine.js';
import { DEPENDENCY_RULES } from '../config/dependencyRules.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function isoDate(date) {
  return date instanceof Date
    ? date.toISOString().split('T')[0]
    : String(date);
}

// ─── Test 1: Nike Renovation (standard_with_demo) ────────────────────────────

export function test1_nikeRenovation() {
  const projectStart     = new Date('2024-11-01');
  const targetOpening    = new Date('2025-03-01'); // ~120 days
  const sqm              = 850;

  const wps = buildProjectWPs('standard_with_demo', projectStart, targetOpening, sqm);
  assert(wps.length > 0, 'Should have WPs');

  const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);
  assert(gantt.length > 0, 'Should have gantt result');

  // Demo WPs start on projectStart
  const demoWPs = gantt.filter(w => w.phaseId === 'demolition');
  assert(demoWPs.length === 3, 'Should have 3 demo WPs');
  for (const dWP of demoWPs) {
    assert(
      isoDate(dWP.earlyStart) === isoDate(projectStart),
      `Demo WP ${dWP.id} should start on project start, got ${isoDate(dWP.earlyStart)}`
    );
  }

  // floor.screed starts after ALL demo WPs finish
  const screed = gantt.find(w => w.id === 'floor.screed');
  assert(screed, 'floor.screed must exist');
  const maxDemoFinish = Math.max(...demoWPs.map(w => w.earlyFinish.getTime()));
  assert(
    screed.earlyStart.getTime() >= maxDemoFinish,
    `floor.screed should start after all demo WPs finish`
  );

  // floor.tiling starts after floor.screed + 10-day lag
  const tiling = gantt.find(w => w.id === 'floor.tiling');
  assert(tiling, 'floor.tiling must exist');
  const expectedTilingStart = addDays(screed.earlyFinish, 10);
  assert(
    isoDate(tiling.earlyStart) === isoDate(expectedTilingStart),
    `floor.tiling earlyStart should be screed.earlyFinish + 10 days: expected ${isoDate(expectedTilingStart)}, got ${isoDate(tiling.earlyStart)}`
  );

  // walls.closing starts after MAX of all 4 tests AND floor.tiling
  const wallsClosing = gantt.find(w => w.id === 'walls.closing');
  assert(wallsClosing, 'walls.closing must exist');
  const tests = ['test.electrical','test.hvac','test.plumbing','test.fire']
    .map(id => gantt.find(w => w.id === id))
    .filter(Boolean);
  assert(tests.length === 4, 'All 4 test WPs should exist');
  const maxTestsAndTilingFinish = Math.max(
    tiling.earlyFinish.getTime(),
    ...tests.map(w => w.earlyFinish.getTime())
  );
  assert(
    wallsClosing.earlyStart.getTime() >= maxTestsAndTilingFinish,
    `walls.closing should start after max(tests+tiling), got ${isoDate(wallsClosing.earlyStart)}`
  );

  // At least one critical WP
  const criticalWPs = gantt.filter(w => w.isCritical);
  assert(criticalWPs.length > 0, 'At least one WP should be on critical path');

  // floor.screed must be critical (blocker)
  assert(screed.isCritical, 'floor.screed (blocker) must be on critical path');

  // No negative float
  for (const wp of gantt) {
    assert(wp.float_days >= 0, `WP ${wp.id} has negative float: ${wp.float_days}`);
  }

  // Key dates: constructionCompletionDate < projectedOpeningDate
  const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(gantt);
  assert(constructionCompletionDate, 'constructionCompletionDate must exist');
  assert(projectedOpeningDate, 'projectedOpeningDate must exist');
  assert(
    constructionCompletionDate < projectedOpeningDate,
    `constructionCompletionDate (${isoDate(constructionCompletionDate)}) should be before projectedOpeningDate (${isoDate(projectedOpeningDate)})`
  );

  return { gantt, wps };
}

// ─── Test 2: Zara New Space (standard_no_demo, sqm > 2000) ───────────────────

export function test2_zaraNewSpace() {
  const projectStart  = new Date('2025-01-15');
  const targetOpening = new Date('2025-04-30'); // ~105 days
  const sqm           = 2200;

  const wps = buildProjectWPs('standard_no_demo', projectStart, targetOpening, sqm);

  // No demo WPs
  assert(
    !wps.some(w => w.phaseId === 'demolition'),
    'standard_no_demo should have no demolition WPs'
  );

  // floor.screed must be present and isBlocker
  const screed = wps.find(w => w.id === 'floor.screed');
  assert(screed, 'floor.screed must exist in no-demo template');
  assert(screed.isBlocker, 'floor.screed must be isBlocker');

  // Size modifier: sqm > 2000 → ×1.15
  const wpsNoMod = buildProjectWPs('standard_no_demo', projectStart, targetOpening, 1000);
  const screedNoMod = wpsNoMod.find(w => w.id === 'floor.screed');
  const screedMod   = screed;
  assert(
    screedMod.duration_days > screedNoMod.duration_days,
    `Large store screed (${screedMod.duration_days}d) should be longer than baseline (${screedNoMod.duration_days}d)`
  );

  // Run feasibility check
  const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);
  const feasibility = checkFeasibility(gantt, targetOpening);
  assert(typeof feasibility.feasible === 'boolean', 'feasibility.feasible should be boolean');
  assert(feasibility.criticalPathLength > 0, 'Critical path should have length');
}

// ─── Test 3: Custom Small Shop ────────────────────────────────────────────────

export function test3_customSmallShop() {
  const projectStart  = new Date('2025-03-01');
  const targetOpening = new Date('2025-05-01'); // 61 days
  const sqm           = 320;
  const selectedPhases = ['floor_prep', 'rough_in', 'finishes', 'handover'];

  const wps = buildProjectWPs('custom', projectStart, targetOpening, sqm, { selectedPhases });

  // Only WPs from selected phases
  for (const wp of wps) {
    assert(
      selectedPhases.includes(wp.phaseId),
      `WP ${wp.id} has phase ${wp.phaseId} which is not in selectedPhases`
    );
  }

  // No test.* WPs (testing phase not selected)
  assert(
    !wps.some(w => w.phaseId === 'testing'),
    'testing phase should not be present in custom selection'
  );

  // Size modifier: sqm < 500 → ×0.90
  const wpsNoMod = buildProjectWPs('custom', projectStart, targetOpening, 1000, { selectedPhases });
  const wp1      = wps[0];
  const wp1NoMod = wpsNoMod[0];
  assert(
    wp1.duration_days <= wp1NoMod.duration_days,
    `Small store WP (${wp1.duration_days}d) should be ≤ baseline (${wp1NoMod.duration_days}d)`
  );

  // Calculate gantt — no orphan rules, topological sort valid
  const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);

  // No WP before its predecessor
  const wpIdSet = new Set(wps.map(w => w.id));
  const activeRules = DEPENDENCY_RULES.filter(r => wpIdSet.has(r.from) && wpIdSet.has(r.to));

  for (const rule of activeRules) {
    const from = gantt.find(w => w.id === rule.from);
    const to   = gantt.find(w => w.id === rule.to);
    if (!from || !to) continue;
    const expectedStart = addDays(from.earlyFinish, rule.lag_days);
    assert(
      to.earlyStart >= expectedStart,
      `WP ${to.id} starts before predecessor ${from.id} finishes + lag`
    );
  }
}

// ─── Test 4: Delay Propagation ────────────────────────────────────────────────

export function test4_delayPropagation() {
  const { gantt } = test1_nikeRenovation();

  const screed = gantt.find(w => w.id === 'floor.screed');
  const originalTilingStart = gantt.find(w => w.id === 'floor.tiling')?.earlyStart;
  const originalHandoverFinish = gantt.find(w => w.id === 'handover.keys')?.earlyFinish;

  // Simulate floor.screed at 10% at day 20 — behind schedule (planned ~17% for 120-day task)
  const today = addDays(screed.earlyStart, 20);
  const updated = recalculateOnDelay(gantt, 'floor.screed', 10, today);

  const updatedScreed  = updated.find(w => w.id === 'floor.screed');
  const updatedTiling  = updated.find(w => w.id === 'floor.tiling');
  const updatedHandover = updated.find(w => w.id === 'handover.keys');

  // floor.screed projected finish should be delayed
  assert(
    updatedScreed.earlyFinish > screed.earlyFinish,
    `floor.screed should finish later: orig ${isoDate(screed.earlyFinish)}, got ${isoDate(updatedScreed.earlyFinish)}`
  );

  // floor.tiling should shift proportionally
  if (originalTilingStart && updatedTiling) {
    assert(
      updatedTiling.earlyStart >= originalTilingStart,
      `floor.tiling earlyStart should shift later after screed delay`
    );
  }

  // walls.closing should shift (via tiling dependency)
  const updatedWallsClosing = updated.find(w => w.id === 'walls.closing');
  const origWallsClosing = gantt.find(w => w.id === 'walls.closing');
  if (origWallsClosing && updatedWallsClosing) {
    assert(
      updatedWallsClosing.earlyStart >= origWallsClosing.earlyStart,
      `walls.closing should start no earlier after delay`
    );
  }

  // handover.keys finish should be ≥ original
  if (originalHandoverFinish && updatedHandover) {
    assert(
      updatedHandover.earlyFinish >= originalHandoverFinish,
      `handover.keys finish should be delayed: orig ${isoDate(originalHandoverFinish)}, got ${isoDate(updatedHandover.earlyFinish)}`
    );
  }
}

// ─── Test 5: Forecast Calculation ────────────────────────────────────────────

export function test5_forecastCalculation() {
  const { gantt } = test1_nikeRenovation();

  // Set actual progress
  const ganttWithProgress = gantt.map(wp => {
    if (wp.id === 'demo.strip_out')      return { ...wp, actual_progress: 100, status: 'completed', actual_end: isoDate(wp.earlyFinish) };
    if (wp.id === 'demo.structural')     return { ...wp, actual_progress: 100, status: 'completed', actual_end: isoDate(wp.earlyFinish) };
    if (wp.id === 'demo.mep_disconnect') return { ...wp, actual_progress: 80,  status: 'in_progress', actual_start: isoDate(wp.earlyStart) };
    return wp;
  });

  const today = addDays(gantt[0].earlyStart, 15);
  const { forecastOpeningDate, confidence } = calculateForecastOpening(ganttWithProgress, today);

  assert(forecastOpeningDate instanceof Date, 'forecastOpeningDate should be a Date');
  assert(['high','medium','low'].includes(confidence), `confidence should be valid: ${confidence}`);

  // With demo.mep_disconnect slightly delayed: forecast ≥ planned opening
  const { projectedOpeningDate } = calculateKeyDates(gantt);
  assert(
    forecastOpeningDate >= projectedOpeningDate,
    `Forecast (${isoDate(forecastOpeningDate)}) should be ≥ planned (${isoDate(projectedOpeningDate)}) when WP is delayed`
  );

  // confidence should reflect data coverage (3/many WPs have data)
  assert(
    confidence === 'medium' || confidence === 'low',
    `Confidence should be medium or low with only 3 WPs having data, got: ${confidence}`
  );
}
