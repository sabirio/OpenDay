// ── Project Templates ─────────────────────────────────────────────────────────
// Configuration objects for each supported project type.
// Used when creating a new project to pre-populate default settings,
// Gantt template selection, and expected phase structure.

export const PROJECT_TEMPLATES = {
  shell_core: {
    id:                    "shell_core",
    label:                 "Shell & Core",
    description:           "New store build from scratch",
    defaultGanttTemplate:  "fitout",
    typicalDurationWeeks:  24,
    phases: [
      "Construction works",
      "Testing & Commissioning",
      "Handover",
    ],
    color: "#2563eb", // blue
  },

  refurbishment: {
    id:                    "refurbishment",
    label:                 "Refurbishment",
    description:           "Upgrade existing store",
    defaultGanttTemplate:  "demolition_fitout",
    typicalDurationWeeks:  16,
    phases: [
      "Demolition works",
      "Construction works",
      "Testing & Commissioning",
      "Handover",
    ],
    color: "#d97706", // amber
  },

  relocation: {
    id:                    "relocation",
    label:                 "Relocation",
    description:           "Move store to new unit",
    defaultGanttTemplate:  "fitout",
    typicalDurationWeeks:  14,
    phases: [
      "Construction works",
      "Testing & Commissioning",
      "Handover",
    ],
    color: "#7c3aed", // violet
  },

  inline: {
    id:                    "inline",
    label:                 "Inline Store",
    description:           "Standard inline unit",
    defaultGanttTemplate:  "fitout",
    typicalDurationWeeks:  10,
    phases: [
      "Construction works",
      "Testing & Commissioning",
      "Handover",
    ],
    color: "#16a34a", // green
  },

  flagship: {
    id:                    "flagship",
    label:                 "Flagship",
    description:           "Premium flagship store",
    defaultGanttTemplate:  "demolition_fitout",
    typicalDurationWeeks:  32,
    phases: [
      "Demolition works",
      "Construction works",
      "Testing & Commissioning",
      "Handover",
    ],
    color: "#dc2626", // red
  },
};

// ── PROJECT_TEMPLATE_IDS ──────────────────────────────────────────────────────

export const PROJECT_TEMPLATE_IDS = Object.keys(PROJECT_TEMPLATES);

// ── getProjectTemplate ────────────────────────────────────────────────────────

/**
 * Returns the project template for the given ID.
 * Falls back to the "inline" template if the ID is not recognised.
 *
 * @param {string} id
 * @returns {object}
 */
export function getProjectTemplate(id) {
  return PROJECT_TEMPLATES[id] || PROJECT_TEMPLATES.inline;
}
