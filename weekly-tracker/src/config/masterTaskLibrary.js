// Master Task Library — single source of truth for all phases and work packages.
// Used by: GanttChart, ContractorReport, SiteVisit, Templates.

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
