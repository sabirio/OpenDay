/**
 * masterTaskLibrary.js — Gantt Task Library
 *
 * THIS IS THE FUTURE SINGLE SOURCE OF TRUTH for all work packages and tasks.
 *
 * Currently used by:
 *   - GanttChart.jsx
 *   - progressEngine.js      ← calculateProjectProgress / calculatePhaseProgress
 *   - ganttEngine.js
 *   - projectSummaryEngine.js (Gantt path)
 *   - ContractorReport.jsx   (Gantt-format reports)
 *   - SiteVisitReport.jsx    (Gantt-format visits)
 *   - projectTemplates.js
 *
 * NOT YET used by:
 *   - WeeklyReports.jsx      ← still uses workPackages.js format
 *   - PhaseStepper.jsx       ← still uses workPackages.js WP_STATUS_SCORES
 *
 * MIGRATION GOAL: When WeeklyReports is migrated to Gantt format,
 *   workPackages.js can be deleted and this becomes the only task library.
 *
 * Data shape: flat array of tasks with { id, label, phaseId, duration_pct, isBlocker, defaultLag_days }
 */

export const PHASES = [
  { id: 'demolition',   label: 'Demolition',              order: 1   },
  { id: 'floor_prep',   label: 'Floor Preparation',       order: 2   },
  { id: 'rough_in',     label: 'Installation Works',       order: 3   },
  { id: 'floor_tiling', label: 'Floor Tiling',            order: 3.5 },
  { id: 'testing',      label: 'Systems Testing',         order: 4   },
  { id: 'wall_closing', label: 'Wall Closing',            order: 5   },
  { id: 'finishes',     label: 'Finishing Works',         order: 6   },
  { id: 'end_devices',  label: 'End Devices & Furniture', order: 7   },
  { id: 'commissioning',label: 'Commissioning',           order: 8   },
  { id: 'pre_opening',  label: 'Pre-Opening',             order: 9   },
  { id: 'handover',     label: 'Handover',                order: 10  },
];

export const WORK_PACKAGES = [
  // ── Demolition ──────────────────────────────────────────────────────────────
  { id: 'demo.strip_out',      label: 'Strip Out & Clear',           phaseId: 'demolition',   duration_pct: 0.40, isBlocker: false, defaultLag_days: 0 },
  { id: 'demo.structural',     label: 'Structural Demolition',       phaseId: 'demolition',   duration_pct: 0.40, isBlocker: false, defaultLag_days: 0 },
  { id: 'demo.mep_disconnect', label: 'MEP Disconnection',           phaseId: 'demolition',   duration_pct: 0.20, isBlocker: false, defaultLag_days: 0 },

  // ── Floor Preparation ────────────────────────────────────────────────────────
  { id: 'floor.screed',        label: 'Floor Screed / Levelling',    phaseId: 'floor_prep',   duration_pct: 1.00, isBlocker: true,  defaultLag_days: 10 },

  // ── Rough-In ─────────────────────────────────────────────────────────────────
  { id: 'walls.marking',       label: 'Wall Marking & Setting Out',  phaseId: 'rough_in',     duration_pct: 0.10, isBlocker: false, defaultLag_days: 0 },
  { id: 'walls.framing',       label: 'Wall Framing / Partitions',   phaseId: 'rough_in',     duration_pct: 0.30, isBlocker: false, defaultLag_days: 0 },
  { id: 'mep.electrical',      label: 'Electrical Rough-In',         phaseId: 'rough_in',     duration_pct: 0.20, isBlocker: false, defaultLag_days: 0 },
  { id: 'mep.hvac',            label: 'HVAC Ductwork',               phaseId: 'rough_in',     duration_pct: 0.20, isBlocker: false, defaultLag_days: 0 },
  { id: 'mep.plumbing',        label: 'Plumbing Rough-In',           phaseId: 'rough_in',     duration_pct: 0.10, isBlocker: false, defaultLag_days: 0 },
  { id: 'mep.fire',            label: 'Fire Protection Rough-In',    phaseId: 'rough_in',     duration_pct: 0.10, isBlocker: false, defaultLag_days: 0 },

  // ── Floor Tiling ─────────────────────────────────────────────────────────────
  { id: 'floor.tiling',        label: 'Floor Tiling',                phaseId: 'floor_tiling', duration_pct: 1.00, isBlocker: false, defaultLag_days: 0 },

  // ── Systems Testing ──────────────────────────────────────────────────────────
  { id: 'test.electrical',     label: 'Electrical Testing',          phaseId: 'testing',      duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'test.hvac',           label: 'HVAC Pressure Test',          phaseId: 'testing',      duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'test.plumbing',       label: 'Plumbing Pressure Test',      phaseId: 'testing',      duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'test.fire',           label: 'Fire System Hydraulic Test',  phaseId: 'testing',      duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },

  // ── Wall Closing ─────────────────────────────────────────────────────────────
  { id: 'walls.closing',       label: 'Wall Board & Closing',        phaseId: 'wall_closing', duration_pct: 1.00, isBlocker: false, defaultLag_days: 0 },

  // ── Finishing Works ──────────────────────────────────────────────────────────
  { id: 'finish.walls',        label: 'Wall Finishes (plaster/paint/cladding)', phaseId: 'finishes', duration_pct: 0.35, isBlocker: false, defaultLag_days: 0 },
  { id: 'finish.ceiling',      label: 'Ceiling Finishes',            phaseId: 'finishes',     duration_pct: 0.35, isBlocker: false, defaultLag_days: 0 },
  { id: 'finish.floor_finish', label: 'Floor Finishing & Skirting',  phaseId: 'finishes',     duration_pct: 0.30, isBlocker: false, defaultLag_days: 0 },

  // ── End Devices & Furniture ──────────────────────────────────────────────────
  { id: 'devices.lighting',    label: 'Lighting Fixtures',           phaseId: 'end_devices',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'devices.sensors',     label: 'Sensors & Detectors',         phaseId: 'end_devices',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'devices.sockets',     label: 'Sockets & Switches',          phaseId: 'end_devices',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'furniture.install',   label: 'Furniture & Fixtures',        phaseId: 'end_devices',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },

  // ── Commissioning ────────────────────────────────────────────────────────────
  { id: 'comm.full_test',      label: 'Full Systems Commissioning',  phaseId: 'commissioning', duration_pct: 0.50, isBlocker: false, defaultLag_days: 0 },
  { id: 'comm.snagging',       label: 'Snagging / Punch List',       phaseId: 'commissioning', duration_pct: 0.50, isBlocker: false, defaultLag_days: 0 },

  // ── Pre-Opening ──────────────────────────────────────────────────────────────
  { id: 'preopening.training', label: 'Staff Training',              phaseId: 'pre_opening',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'preopening.cleaning', label: 'Deep Cleaning',               phaseId: 'pre_opening',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'preopening.docs',     label: 'As-Built Documentation',      phaseId: 'pre_opening',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },
  { id: 'preopening.reports',  label: 'Completion Reports',          phaseId: 'pre_opening',  duration_pct: 0.25, isBlocker: false, defaultLag_days: 0 },

  // ── Handover ─────────────────────────────────────────────────────────────────
  { id: 'handover.inspection', label: 'Final Inspection',            phaseId: 'handover',     duration_pct: 0.40, isBlocker: false, defaultLag_days: 0 },
  { id: 'handover.transfer',   label: 'Acceptance & Transfer',       phaseId: 'handover',     duration_pct: 0.40, isBlocker: false, defaultLag_days: 0 },
  { id: 'handover.keys',       label: 'Keys & Possession',           phaseId: 'handover',     duration_pct: 0.20, isBlocker: false, defaultLag_days: 0 },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getPhaseById(id) {
  return PHASES.find(p => p.id === id) || null;
}

export function getWPById(id) {
  return WORK_PACKAGES.find(wp => wp.id === id) || null;
}

export function getWPsByPhase(phaseId) {
  return WORK_PACKAGES.filter(wp => wp.phaseId === phaseId);
}

export function getPhasesInOrder() {
  return [...PHASES].sort((a, b) => a.order - b.order);
}

export function getWPsInOrder() {
  const phaseOrder = Object.fromEntries(PHASES.map(p => [p.id, p.order]));
  return [...WORK_PACKAGES].sort((a, b) => {
    const pDiff = (phaseOrder[a.phaseId] || 0) - (phaseOrder[b.phaseId] || 0);
    if (pDiff !== 0) return pDiff;
    // Within same phase, preserve array order
    return WORK_PACKAGES.indexOf(a) - WORK_PACKAGES.indexOf(b);
  });
}

export function getWPsForTemplate(templateId) {
  if (templateId === 'standard_with_demo') return getWPsInOrder();
  if (templateId === 'standard_no_demo') {
    return getWPsInOrder().filter(wp => wp.phaseId !== 'demolition');
  }
  return getWPsInOrder(); // custom: caller filters
}

/**
 * computeEffectiveWeights(scopeWPIds)
 *
 * Given a list of active WP ids, returns { wpId → effectiveWeight } where all
 * values sum to 1.0 (100% of project progress).
 *
 * Algorithm:
 *   1. Group selected WPs by phase
 *   2. phaseWeight = 1 / numberOfSelectedPhases (equal phase contribution)
 *   3. Within a phase, normalise duration_pct so they sum to 1.0
 *   4. effectiveWeight(wp) = phaseWeight × normalised_wp_pct
 *
 * If scopeWPIds is null/undefined → all WORK_PACKAGES are used (full scope).
 */
export function computeEffectiveWeights(scopeWPIds = null) {
  const wps = scopeWPIds
    ? WORK_PACKAGES.filter(wp => scopeWPIds.includes(wp.id))
    : WORK_PACKAGES;

  if (wps.length === 0) return {};

  const byPhase = {};
  for (const wp of wps) {
    if (!byPhase[wp.phaseId]) byPhase[wp.phaseId] = [];
    byPhase[wp.phaseId].push(wp);
  }

  const phaseIds = Object.keys(byPhase);
  const phaseWeight = 1 / phaseIds.length;
  const result = {};

  for (const phaseId of phaseIds) {
    const phaseWPs = byPhase[phaseId];
    const pctSum = phaseWPs.reduce((s, wp) => s + (wp.duration_pct || 0), 0);
    for (const wp of phaseWPs) {
      const normPct = pctSum > 0 ? wp.duration_pct / pctSum : 1 / phaseWPs.length;
      result[wp.id] = phaseWeight * normPct;
    }
  }

  return result;
}
