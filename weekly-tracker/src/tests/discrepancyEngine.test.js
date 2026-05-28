import { calculateDiscrepancy } from '../engines/discrepancyEngine.js';

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ─── Test 1: All discrepancy scenarios ───────────────────────────────────────

export function test1_allScenarios() {
  const contractorWPs = [
    { wpId: 'mep.electrical', progress: 80 },
    { wpId: 'mep.hvac',       progress: 60 },
    { wpId: 'floor.tiling',   progress: 90 },
    { wpId: 'walls.framing',  progress: 45 },
  ];
  const siteVisitWPs = [
    { wpId: 'mep.electrical', progress: 75, pm_note: 'Checked cabling', visit_date: '2025-01-10' },
    { wpId: 'mep.hvac',       progress: 40, pm_note: 'Ductwork slower',  visit_date: '2025-01-10' },
    { wpId: 'floor.tiling',   progress: 60, pm_note: 'Only 60% done',   visit_date: '2025-01-10' },
    { wpId: 'walls.framing',  progress: 42, pm_note: null,               visit_date: '2025-01-10' },
  ];

  const results = calculateDiscrepancy(contractorWPs, siteVisitWPs);
  const byId = Object.fromEntries(results.map(r => [r.wpId, r]));

  // mep.electrical: delta = |80-75| = 5 → ok
  assert(byId['mep.electrical'].status === 'ok',
    `mep.electrical: expected ok, got ${byId['mep.electrical'].status}`);
  assert(byId['mep.electrical'].delta === 5,
    `mep.electrical: expected delta 5, got ${byId['mep.electrical'].delta}`);

  // mep.hvac: delta = |60-40| = 20 → warning
  assert(byId['mep.hvac'].status === 'warning',
    `mep.hvac: expected warning, got ${byId['mep.hvac'].status}`);
  assert(byId['mep.hvac'].delta === 20,
    `mep.hvac: expected delta 20, got ${byId['mep.hvac'].delta}`);

  // floor.tiling: delta = |90-60| = 30 → critical
  assert(byId['floor.tiling'].status === 'critical',
    `floor.tiling: expected critical, got ${byId['floor.tiling'].status}`);
  assert(byId['floor.tiling'].delta === 30,
    `floor.tiling: expected delta 30, got ${byId['floor.tiling'].delta}`);

  // walls.framing: delta = |45-42| = 3 → ok
  assert(byId['walls.framing'].status === 'ok',
    `walls.framing: expected ok, got ${byId['walls.framing'].status}`);
  assert(byId['walls.framing'].delta === 3,
    `walls.framing: expected delta 3, got ${byId['walls.framing'].delta}`);

  // Values match exactly
  assert(byId['mep.hvac'].contractor_progress === 60, 'contractor_progress mismatch');
  assert(byId['mep.hvac'].site_visit_progress === 40, 'site_visit_progress mismatch');
}

// ─── Test 2: Boundary edge cases ─────────────────────────────────────────────

export function test2_boundaries() {
  const run = (contractorPct, sitePct) => {
    const [result] = calculateDiscrepancy(
      [{ wpId: 'x', progress: contractorPct }],
      [{ wpId: 'x', progress: sitePct }]
    );
    return result;
  };

  // delta exactly 10 → warning (≥ 10)
  const r10 = run(50, 40);
  assert(r10.status === 'warning' && r10.delta === 10,
    `delta=10: expected warning, got ${r10.status} (delta=${r10.delta})`);

  // delta exactly 25 → warning (> 25 is critical, so 25 is still warning)
  const r25 = run(50, 25);
  assert(r25.status === 'warning' && r25.delta === 25,
    `delta=25: expected warning, got ${r25.status} (delta=${r25.delta})`);

  // delta 26 → critical
  const r26 = run(50, 24);
  assert(r26.status === 'critical' && r26.delta === 26,
    `delta=26: expected critical, got ${r26.status} (delta=${r26.delta})`);

  // delta 0 → ok
  const r0 = run(70, 70);
  assert(r0.status === 'ok' && r0.delta === 0,
    `delta=0: expected ok, got ${r0.status} (delta=${r0.delta})`);

  // delta 9 → ok (just below warning threshold)
  const r9 = run(50, 41);
  assert(r9.status === 'ok' && r9.delta === 9,
    `delta=9: expected ok, got ${r9.status} (delta=${r9.delta})`);

  // WP missing from contractor side → not included in result
  const missing = calculateDiscrepancy(
    [{ wpId: 'a', progress: 50 }],
    [{ wpId: 'b', progress: 30 }]  // different wpId
  );
  assert(missing.length === 0,
    `Non-overlapping WPs should produce empty results, got ${missing.length}`);
}
