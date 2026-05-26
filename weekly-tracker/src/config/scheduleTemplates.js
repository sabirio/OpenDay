// ── Schedule Templates ────────────────────────────────────────────────────────
// Templates keyed by project.ganttTemplate value.
//
// IMPORTANT: task names and reportKey values MUST match exactly the work-package
// keys used in ContractorReport.jsx (constructionStatuses, testingStatuses,
// handoverStatuses) so report statuses can be mapped directly.

import { generateGanttTasksFromWP, WORK_PACKAGES } from "./workPackages";

function task(id, name, duration, dependencies, weight, reportPhase, reportKey) {
  return {
    id,
    name,
    duration,
    dependencies, // [{id, type, lag?}]
    weight,
    reportPhase,  // 'demolition' | 'construction' | 'testing' | 'handover' | null
    reportKey,    // exact key in status object, null for demolition (single field)
    status:      "Not Started",
    progress:    0,
    actualStart:  null,
    actualFinish: null,
  };
}

const dep  = (id, type = "FS", lag = 0) => ({ id, type, lag });

// ── TEMPLATE 1: Retail Fit-out (no demolition) ────────────────────────────────

const FITOUT_TASKS = [
  task("f01", "Site Mobilisation",                                          2,  [],                                                              2,  null,           null),
  task("f02", "Flooring installation",                                      7,  [dep("f01")],                                                    8,  "construction", "Flooring installation"),
  task("f03", "Drywall partition installation",                             10, [dep("f01")],                                                    8,  "construction", "Drywall partition installation"),
  task("f04", "Electrical systems installation",                            8,  [dep("f03", "SS", 2)],                                           7,  "construction", "Electrical systems installation"),
  task("f05", "HVAC systems installation",                                  6,  [dep("f03", "SS", 2)],                                           6,  "construction", "HVAC systems installation"),
  task("f06", "Fire safety systems installation",                           4,  [dep("f04", "SS", 2)],                                           4,  "construction", "Fire safety systems installation"),
  task("f07", "Low current systems installation",                           5,  [dep("f04")],                                                    4,  "construction", "Low current systems installation"),
  task("f08", "Ceiling installation",                                       5,  [dep("f04"), dep("f05")],                                        5,  "construction", "Ceiling installation"),
  task("f09", "Lighting installation",                                      3,  [dep("f08")],                                                    4,  "construction", "Lighting installation"),
  task("f10", "Furniture installation",                                     5,  [dep("f02")],                                                    6,  "construction", "Furniture installation"),
  task("f11", "Sprinkler system testing and commissioning",                 3,  [dep("f06")],                                                    4,  "testing",       "Sprinkler system testing and commissioning"),
  task("f12", "Smoke detection system testing and commissioning",           2,  [dep("f06", "SS")],                                              3,  "testing",       "Smoke detection system testing and commissioning"),
  task("f13", "Emergency announcement system testing and commissioning",    2,  [dep("f06", "SS")],                                              3,  "testing",       "Emergency announcement system testing and commissioning"),
  task("f14", "HVAC system testing and commissioning",                      2,  [dep("f05")],                                                    3,  "testing",       "HVAC system testing and commissioning"),
  task("f15", "Electrical system testing and commissioning",                2,  [dep("f07")],                                                    3,  "testing",       "Electrical system testing and commissioning"),
  task("f16", "Low current testing and commissioning",                      2,  [dep("f07")],                                                    3,  "testing",       "Low current testing and commissioning"),
  task("f17", "Staff training",                                             2,  [dep("f09"), dep("f10")],                                        4,  "handover",      "Staff training"),
  task("f18", "Manuals, certificates, test reports",                        2,  [dep("f11"), dep("f14"), dep("f15"), dep("f16")],                4,  "handover",      "Manuals, certificates, test reports"),
  task("f19", "Final cleaning",                                             2,  [dep("f10"), dep("f09")],                                        3,  "handover",      "Final cleaning"),
  task("f20", "Snag list resolution",                                       4,  [dep("f17"), dep("f18"), dep("f19")],                            5,  "handover",      "Snag list resolution"),
];

// ── TEMPLATE 2: Demolition + Fit-out ─────────────────────────────────────────

const DEMO_FITOUT_TASKS = [
  task("d00", "Demolition works",                                           5,  [],                                                              6,  "demolition",    null),
  task("d01", "Site Mobilisation / Protection",                             2,  [dep("d00")],                                                    2,  null,            null),
  task("d02", "Flooring installation",                                      7,  [dep("d01")],                                                    8,  "construction",  "Flooring installation"),
  task("d03", "Drywall partition installation",                             10, [dep("d01")],                                                    8,  "construction",  "Drywall partition installation"),
  task("d04", "Electrical systems installation",                            8,  [dep("d03", "SS", 2)],                                           7,  "construction",  "Electrical systems installation"),
  task("d05", "HVAC systems installation",                                  6,  [dep("d03", "SS", 2)],                                           6,  "construction",  "HVAC systems installation"),
  task("d06", "Fire safety systems installation",                           4,  [dep("d04", "SS", 2)],                                           4,  "construction",  "Fire safety systems installation"),
  task("d07", "Low current systems installation",                           5,  [dep("d04")],                                                    4,  "construction",  "Low current systems installation"),
  task("d08", "Ceiling installation",                                       5,  [dep("d04"), dep("d05")],                                        5,  "construction",  "Ceiling installation"),
  task("d09", "Lighting installation",                                      3,  [dep("d08")],                                                    4,  "construction",  "Lighting installation"),
  task("d10", "Furniture installation",                                     5,  [dep("d02")],                                                    6,  "construction",  "Furniture installation"),
  task("d11", "Sprinkler system testing and commissioning",                 3,  [dep("d06")],                                                    4,  "testing",       "Sprinkler system testing and commissioning"),
  task("d12", "Smoke detection system testing and commissioning",           2,  [dep("d06", "SS")],                                              3,  "testing",       "Smoke detection system testing and commissioning"),
  task("d13", "Emergency announcement system testing and commissioning",    2,  [dep("d06", "SS")],                                              3,  "testing",       "Emergency announcement system testing and commissioning"),
  task("d14", "HVAC system testing and commissioning",                      2,  [dep("d05")],                                                    3,  "testing",       "HVAC system testing and commissioning"),
  task("d15", "Electrical system testing and commissioning",                2,  [dep("d07")],                                                    3,  "testing",       "Electrical system testing and commissioning"),
  task("d16", "Low current testing and commissioning",                      2,  [dep("d07")],                                                    3,  "testing",       "Low current testing and commissioning"),
  task("d17", "Staff training",                                             2,  [dep("d09"), dep("d10")],                                        4,  "handover",      "Staff training"),
  task("d18", "Manuals, certificates, test reports",                        2,  [dep("d11"), dep("d14"), dep("d15"), dep("d16")],                4,  "handover",      "Manuals, certificates, test reports"),
  task("d19", "Final cleaning",                                             2,  [dep("d10"), dep("d09")],                                        3,  "handover",      "Final cleaning"),
  task("d20", "Snag list resolution",                                       4,  [dep("d17"), dep("d18"), dep("d19")],                            5,  "handover",      "Snag list resolution"),
];

// ── TEMPLATE 3: Work Package Based (generated from WORK_PACKAGES) ─────────────
// Tasks linked directly to WP ids and task names for new-format reports.

// ── TEMPLATE 4: Phase Milestones ──────────────────────────────────────────────
// One sequential milestone per WP phase — no sub-tasks.
// Duration scaled by WP weight relative to a 40-week baseline.
// Each milestone maps to a WP via _wpId for status look-up.

// Construction logic dependency map:
//  preconstruction  → start
//  demolition       → after preconstruction (FS)
//  construction     → after demolition      (FS)
//  mep              → concurrent with construction (SS — rough-in while walls go up)
//  finishes         → after construction    (FS)
//  equipment        → after finishes        (FS)
//  commissioning    → after mep AND equipment (FS from both)
//  handover         → after commissioning   (FS)
const PHASE_DEPS = {
  preconstruction: [],
  demolition:      [{ id: "preconstruction", type: "FS", lag: 0 }],
  construction:    [{ id: "demolition",      type: "FS", lag: 0 }],
  mep:             [{ id: "construction",    type: "SS", lag: 0 }],
  finishes:        [{ id: "construction",    type: "FS", lag: 0 }],
  equipment:       [{ id: "finishes",        type: "FS", lag: 0 }],
  commissioning:   [{ id: "mep",             type: "FS", lag: 0 }, { id: "equipment", type: "FS", lag: 0 }],
  handover:        [{ id: "commissioning",   type: "FS", lag: 0 }],
};

function generatePhaseMilestones() {
  return WORK_PACKAGES.map((wp) => ({
    id:           wp.id,
    name:         wp.name,
    duration:     Math.max(1, Math.round(wp.weight * 40)),
    dependencies: PHASE_DEPS[wp.id] ?? [],
    weight:       Math.round(wp.weight * 100),
    reportPhase:  wp.id,
    reportKey:    null,
    _wpId:        wp.id,
    status:       "Not Started",
    progress:     0,
    actualStart:  null,
    actualFinish: null,
  }));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const GANTT_TEMPLATES = {
  fitout: {
    id: "fitout",
    label: "Fit-out (no demolition)",
    description: "Construction, T&C and handover — no demolition phase",
    tasks: FITOUT_TASKS,
  },
  demolition_fitout: {
    id: "demolition_fitout",
    label: "Demolition + Fit-out",
    description: "Full demolition followed by construction, T&C and handover",
    tasks: DEMO_FITOUT_TASKS,
  },
  work_packages: {
    id: "work_packages",
    label: "Work Package Schedule",
    description: "Auto-generated from centralized Work Packages (new format)",
    get tasks() { return generateGanttTasksFromWP(180); },
  },
  phase_milestones: {
    id: "phase_milestones",
    label: "Phase Milestones",
    description: "8 sequential phase milestones — one per Work Package, no sub-tasks",
    get tasks() { return generatePhaseMilestones(); },
  },
};

export const GANTT_TEMPLATE_IDS = Object.keys(GANTT_TEMPLATES);

// Returns a deep clone of template tasks (never mutate the originals)
export function generateFromTemplate(templateId) {
  const tpl = GANTT_TEMPLATES[templateId] || GANTT_TEMPLATES.fitout;
  return JSON.parse(JSON.stringify(tpl.tasks));
}

// Get status from cumulative report/visit statuses for a given task.
// Supports both old format (reportPhase string) and new WP format (_wpId + reportKey).
export function getTaskReportStatus(cumulativeStatuses, reportPhase, reportKey, wpId) {
  if (!cumulativeStatuses) return null;

  // New WP format: cumulativeStatuses has workPackageStatuses
  if (wpId && cumulativeStatuses.workPackageStatuses) {
    const entry = cumulativeStatuses.workPackageStatuses?.[wpId]?.[reportKey];
    return entry?.status || null;
  }

  if (!reportPhase) return null;
  switch (reportPhase) {
    case "demolition":   return cumulativeStatuses.demolitionStatus                   || null;
    case "construction": return cumulativeStatuses.constructionStatuses?.[reportKey]  || null;
    case "testing":      return cumulativeStatuses.testingStatuses?.[reportKey]       || null;
    case "handover":     return cumulativeStatuses.handoverStatuses?.[reportKey]      || null;
    // New WP format via reportPhase = wpId
    default:
      return cumulativeStatuses.workPackageStatuses?.[reportPhase]?.[reportKey]?.status || null;
  }
}
