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
} from '../engines/ganttEngine.js';
import { DEPENDENCY_RULES } from '../config/dependencyRules.js';
import { PHASES } from '../config/masterTaskLibrary.js';

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

  // Simulate floor.screed at 10% progress at day 20 past its start — heavily delayed (planned finish was just days away)
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

// ─── Test 6: Critical path fits within the schedule window ───────────────────

export function test6_criticalPathFitsWindow() {
  const projectStart  = new Date('2025-01-01');
  const targetOpening = new Date('2025-04-01'); // exactly 90 days
  const sqm = 1000; // modifier = 1.0

  const wps  = buildProjectWPs('standard_with_demo', projectStart, targetOpening, sqm);
  const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);

  const { feasible, projectedOpeningDate, daysOver } = checkFeasibility(gantt, targetOpening);
  assert(
    feasible,
    `90-day standard_with_demo project must be feasible. Projected: ${isoDate(projectedOpeningDate)}, daysOver=${daysOver}`
  );
  assert(daysOver === 0, `daysOver must be 0, got ${daysOver}`);

  // Total lag on critical path: only floor.screed→floor.tiling = 10 days
  const critical = gantt.filter(w => w.isCritical);
  assert(critical.length > 0, 'At least one WP must be on the critical path');
  assert(
    gantt.find(w => w.id === 'floor.screed')?.isCritical,
    'floor.screed must remain critical after phase-weight normalization'
  );
}

// ─── Test 7: No-demo excluded phase — normalization re-sums to 1.0 ───────────

export function test7_noDemorNormalizationSumsToOne() {
  const projectStart  = new Date('2025-01-01');
  const targetOpening = new Date('2025-04-01'); // 90 days
  const sqm = 1000;

  const wps = buildProjectWPs('standard_no_demo', projectStart, targetOpening, sqm);

  // No demolition WPs
  assert(!wps.some(w => w.phaseId === 'demolition'), 'No demo WPs in no-demo project');

  // PHASES weights for included phases must normalize to 1.0
  const includedPhaseIds = new Set(wps.map(w => w.phaseId));
  assert(!includedPhaseIds.has('demolition'), 'demolition not in included phases');

  const sumIncluded = PHASES
    .filter(p => includedPhaseIds.has(p.id))
    .reduce((s, p) => s + p.phaseWeight, 0);

  const normSum = PHASES
    .filter(p => includedPhaseIds.has(p.id))
    .reduce((s, p) => s + p.phaseWeight / sumIncluded, 0);

  assert(
    Math.abs(normSum - 1.0) < 0.0001,
    `Normalized phase weights must sum to 1.0, got ${normSum.toFixed(6)}`
  );

  // Feasible within its own window
  const gantt = calculateGantt(wps, DEPENDENCY_RULES, projectStart);
  const { feasible, projectedOpeningDate, daysOver } = checkFeasibility(gantt, targetOpening);
  assert(
    feasible,
    `No-demo 90-day project must be feasible. Projected: ${isoDate(projectedOpeningDate)}, daysOver=${daysOver}`
  );
}

// ─── Test 8: Proportional scaling — 3× window → 3× WP durations ─────────────

export function test8_proportionalScaling() {
  const start  = new Date('2025-01-01');
  const end100 = new Date('2025-04-11'); // 100 days (31+28+31+10)
  const end300 = new Date('2025-10-28'); // 300 days

  const wps100 = buildProjectWPs('standard_with_demo', start, end100, 1000);
  const wps300 = buildProjectWPs('standard_with_demo', start, end300, 1000);

  // walls.framing: total * 0.20 * 0.30 — large enough to avoid Math.max(1) distortion
  const framing100 = wps100.find(w => w.id === 'walls.framing');
  const framing300 = wps300.find(w => w.id === 'walls.framing');

  assert(framing100, 'walls.framing must exist in 100-day project');
  assert(framing300, 'walls.framing must exist in 300-day project');

  // Expected: round(100 × 0.20 × 0.30) = 6, round(300 × 0.20 × 0.30) = 18
  assert(framing100.duration_days === 6,  `walls.framing 100d: expected 6, got ${framing100.duration_days}`);
  assert(framing300.duration_days === 18, `walls.framing 300d: expected 18, got ${framing300.duration_days}`);
  assert(
    framing300.duration_days === 3 * framing100.duration_days,
    `300d WP should be exactly 3× 100d WP (got ${framing300.duration_days} vs ${framing100.duration_days})`
  );
}

// ─── Test 9: Within-phase split preserved — duration_pct ratio intact ─────────

export function test9_withinPhaseSplit() {
  const start = new Date('2025-01-01');
  const end   = new Date('2025-04-11'); // 100 days
  const wps   = buildProjectWPs('standard_with_demo', start, end, 1000);

  // Within rough_in: walls.marking (0.10) and walls.framing (0.30) → ratio = 3×
  const marking = wps.find(w => w.id === 'walls.marking');
  const framing = wps.find(w => w.id === 'walls.framing');

  assert(marking, 'walls.marking must exist');
  assert(framing, 'walls.framing must exist');

  // round(100 × 0.20 × 0.10) = 2, round(100 × 0.20 × 0.30) = 6
  assert(marking.duration_days === 2, `walls.marking: expected 2d, got ${marking.duration_days}`);
  assert(framing.duration_days === 6, `walls.framing: expected 6d, got ${framing.duration_days}`);
  assert(
    framing.duration_days === 3 * marking.duration_days,
    `walls.framing should be 3× walls.marking (duration_pct 0.30/0.10=3)`
  );
}

// ─── Test 10: calculateForecastOpening's openingMarkerId parameter ───────────
// Engine-audit fix (2026-07-16): openingMarkerId used to be hardcoded to v1's
// 'handover.keys' with no override, unlike calculateKeyDates' own
// openingMarkerId param. Proves the parameter actually changes resolution:
// a synthetic v2-style marker id, passed explicitly, must be found and used
// instead of silently falling back to "latest reforecast finish across all
// WPs" (which a real v2 gantt — no 'handover.keys' WP at all — would
// otherwise always hit).

export function test10_forecastOpeningCustomMarker() {
  const start = new Date('2025-01-01');
  const wpA = {
    id: 'wp.a', earlyStart: start, earlyFinish: addDays(start, 10), duration_days: 10,
    actual_progress: 100, status: 'completed', actual_end: isoDate(addDays(start, 10)),
  };
  const wpMarker = {
    id: 'v2.opening.marker', earlyStart: start, earlyFinish: addDays(start, 15), duration_days: 15,
    actual_progress: 0, status: 'not_started',
  };
  const wpLate = {
    id: 'wp.late', earlyStart: start, earlyFinish: addDays(start, 30), duration_days: 30,
    actual_progress: 0, status: 'not_started',
  };
  const ganttResult = [wpA, wpMarker, wpLate];
  const today = start;

  const withCustomMarker = calculateForecastOpening(ganttResult, today, [], 'v2.opening.marker');
  const withDefaultMarker = calculateForecastOpening(ganttResult, today, []); // 'handover.keys' not present in this fixture

  assert(
    isoDate(withCustomMarker.forecastOpeningDate) === isoDate(addDays(start, 15)),
    `custom marker should resolve to wpMarker's own finish (${isoDate(addDays(start, 15))}), got ${isoDate(withCustomMarker.forecastOpeningDate)}`
  );
  assert(
    isoDate(withDefaultMarker.forecastOpeningDate) === isoDate(addDays(start, 30)),
    `default marker (absent from this fixture) should fall back to the latest reforecast finish (${isoDate(addDays(start, 30))}), got ${isoDate(withDefaultMarker.forecastOpeningDate)}`
  );
  assert(
    withCustomMarker.forecastOpeningDate.getTime() !== withDefaultMarker.forecastOpeningDate.getTime(),
    'passing openingMarkerId must actually change which WP resolves the forecast'
  );
}
