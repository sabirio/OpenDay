#!/usr/bin/env node
// Test runner — plain Node.js, no test framework needed.
// Run: node src/tests/runTests.js

import {
  test1_nikeRenovation,
  test2_zaraNewSpace,
  test3_customSmallShop,
  test4_delayPropagation,
  test5_forecastCalculation,
} from './ganttEngine.test.js';

import {
  test1_allScenarios,
  test2_boundaries,
} from './discrepancyEngine.test.js';

// ─── Runner ───────────────────────────────────────────────────────────────────

const tests = [
  { name: 'Gantt Test 1: Nike Renovation (standard_with_demo, 120 days, 850sqm)',       fn: test1_nikeRenovation },
  { name: 'Gantt Test 2: Zara New Space (standard_no_demo, 105 days, 2200sqm)',         fn: test2_zaraNewSpace },
  { name: 'Gantt Test 3: Custom Small Shop (selected phases, 61 days, 320sqm)',         fn: test3_customSmallShop },
  { name: 'Gantt Test 4: Delay Propagation (floor.screed 50% at day 20)',               fn: test4_delayPropagation },
  { name: 'Gantt Test 5: Forecast Calculation (3 WPs with data)',                       fn: test5_forecastCalculation },
  { name: 'Discrepancy Test 1: All scenarios (ok / warning / critical)',                fn: test1_allScenarios },
  { name: 'Discrepancy Test 2: Boundary edge cases (delta 10, 25, 26, 0, 9)',          fn: test2_boundaries },
];

let passed = 0;
let failed = 0;

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Gantt Engine + Discrepancy Engine — Test Suite');
console.log('══════════════════════════════════════════════════════════\n');

for (const { name, fn } of tests) {
  try {
    const result = fn();
    // Handle async functions
    if (result && typeof result.then === 'function') await result;
    console.log(`✅ PASSED: ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ FAILED: ${name}`);
    console.log(`   → ${err.message}`);
    failed++;
  }
}

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`  ${passed + failed} tests total — ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log(`  🎉 All tests passing!\n`);
} else {
  console.log(`  ⚠️  ${failed} test(s) failed — see details above.\n`);
  process.exit(1);
}
