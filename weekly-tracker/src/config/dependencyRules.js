// Dependency rules — Finish-to-Start relationships between Work Packages.
// type: "FS" = Finish-to-Start (only type used in this system)
// lag_days: waiting time after predecessor finishes before successor can start

export const DEPENDENCY_RULES = [
  // ── Demolition → Floor Prep (AND: all 3 demo WPs must finish) ────────────────
  { from: 'demo.strip_out',      to: 'floor.screed',       type: 'FS', lag_days: 0 },
  { from: 'demo.structural',     to: 'floor.screed',       type: 'FS', lag_days: 0 },
  { from: 'demo.mep_disconnect', to: 'floor.screed',       type: 'FS', lag_days: 0 },

  // ── Floor Prep → everything (BLOCKER — 10-day drying lag) ────────────────────
  { from: 'floor.screed', to: 'walls.marking',   type: 'FS', lag_days: 10 },
  { from: 'floor.screed', to: 'mep.electrical',  type: 'FS', lag_days: 10 },
  { from: 'floor.screed', to: 'mep.hvac',        type: 'FS', lag_days: 10 },
  { from: 'floor.screed', to: 'mep.plumbing',    type: 'FS', lag_days: 10 },
  { from: 'floor.screed', to: 'mep.fire',        type: 'FS', lag_days: 10 },
  { from: 'floor.screed', to: 'floor.tiling',    type: 'FS', lag_days: 10 },

  // ── Walls sequence ────────────────────────────────────────────────────────────
  { from: 'walls.marking', to: 'walls.framing', type: 'FS', lag_days: 0 },

  // ── Each MEP rough-in → its own test ─────────────────────────────────────────
  { from: 'mep.electrical', to: 'test.electrical', type: 'FS', lag_days: 0 },
  { from: 'mep.hvac',       to: 'test.hvac',       type: 'FS', lag_days: 0 },
  { from: 'mep.plumbing',   to: 'test.plumbing',   type: 'FS', lag_days: 0 },
  { from: 'mep.fire',       to: 'test.fire',       type: 'FS', lag_days: 0 },

  // ── ALL tests + floor.tiling → wall closing (AND logic) ──────────────────────
  { from: 'test.electrical', to: 'walls.closing', type: 'FS', lag_days: 0 },
  { from: 'test.hvac',       to: 'walls.closing', type: 'FS', lag_days: 0 },
  { from: 'test.plumbing',   to: 'walls.closing', type: 'FS', lag_days: 0 },
  { from: 'test.fire',       to: 'walls.closing', type: 'FS', lag_days: 0 },
  { from: 'floor.tiling',    to: 'walls.closing', type: 'FS', lag_days: 0 },

  // ── Wall closing → finishes ───────────────────────────────────────────────────
  { from: 'walls.closing', to: 'finish.walls',        type: 'FS', lag_days: 0 },
  { from: 'walls.closing', to: 'finish.ceiling',      type: 'FS', lag_days: 0 },
  { from: 'floor.tiling',  to: 'finish.floor_finish', type: 'FS', lag_days: 0 },

  // ── ALL finishes → end devices (AND logic) ────────────────────────────────────
  { from: 'finish.walls',        to: 'devices.lighting',  type: 'FS', lag_days: 0 },
  { from: 'finish.walls',        to: 'devices.sensors',   type: 'FS', lag_days: 0 },
  { from: 'finish.walls',        to: 'devices.sockets',   type: 'FS', lag_days: 0 },
  { from: 'finish.ceiling',      to: 'devices.lighting',  type: 'FS', lag_days: 0 },
  { from: 'finish.ceiling',      to: 'devices.sensors',   type: 'FS', lag_days: 0 },
  { from: 'finish.floor_finish', to: 'furniture.install', type: 'FS', lag_days: 0 },

  // ── ALL end devices → commissioning (AND logic) ───────────────────────────────
  { from: 'devices.lighting',  to: 'comm.full_test', type: 'FS', lag_days: 0 },
  { from: 'devices.sensors',   to: 'comm.full_test', type: 'FS', lag_days: 0 },
  { from: 'devices.sockets',   to: 'comm.full_test', type: 'FS', lag_days: 0 },
  { from: 'furniture.install', to: 'comm.full_test', type: 'FS', lag_days: 0 },
  { from: 'comm.full_test',    to: 'comm.snagging',  type: 'FS', lag_days: 0 },

  // ── Commissioning → pre-opening (AND logic) ───────────────────────────────────
  { from: 'comm.full_test',  to: 'preopening.training', type: 'FS', lag_days: 0 },
  { from: 'comm.full_test',  to: 'preopening.cleaning', type: 'FS', lag_days: 0 },
  { from: 'comm.full_test',  to: 'preopening.docs',     type: 'FS', lag_days: 0 },
  { from: 'comm.full_test',  to: 'preopening.reports',  type: 'FS', lag_days: 0 },
  { from: 'comm.snagging',   to: 'preopening.cleaning', type: 'FS', lag_days: 0 },

  // ── ALL pre-opening → handover (AND logic) ────────────────────────────────────
  { from: 'preopening.training', to: 'handover.inspection', type: 'FS', lag_days: 0 },
  { from: 'preopening.cleaning', to: 'handover.inspection', type: 'FS', lag_days: 0 },
  { from: 'preopening.docs',     to: 'handover.inspection', type: 'FS', lag_days: 0 },
  { from: 'preopening.reports',  to: 'handover.inspection', type: 'FS', lag_days: 0 },
  { from: 'handover.inspection', to: 'handover.transfer',   type: 'FS', lag_days: 0 },
  { from: 'handover.transfer',   to: 'handover.keys',       type: 'FS', lag_days: 0 },
];

/**
 * Filter rules to only those where BOTH from and to WP IDs exist in the given set.
 * @param {string[]} wpIds  — array of active WP IDs
 * @returns DEPENDENCY_RULES subset
 */
export function filterRulesForWPs(wpIds) {
  const set = new Set(wpIds);
  return DEPENDENCY_RULES.filter(r => set.has(r.from) && set.has(r.to));
}
