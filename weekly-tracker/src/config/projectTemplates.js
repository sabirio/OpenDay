import { PHASES, WORK_PACKAGES, getWPsByPhase } from './masterTaskLibrary.js';

export const TEMPLATES = [
  {
    id: 'standard_with_demo',
    label: 'Standard (with Demolition)',
    description: 'Renovation of existing space — includes full demolition phase',
    icon: '🔨',
    includedPhases: PHASES.map(p => p.id), // all phases
    includedWPs: null, // null = all WPs in includedPhases
  },
  {
    id: 'standard_no_demo',
    label: 'Standard (New Space)',
    description: 'Shell & core or new space — no demolition required',
    icon: '🏗️',
    includedPhases: PHASES.map(p => p.id).filter(id => id !== 'demolition'),
    includedWPs: null,
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Select phases or individual work packages manually',
    icon: '⚙️',
    includedPhases: null, // user selects
    includedWPs: null,
  },
  {
    // Isolated v2 model — zones/categories/work-packages (see
    // domains/construction/templates/retailFitoutV2.js), not phases/WPs.
    // includedPhases/includedWPs are intentionally null: this template's
    // scope is resolved via ZonedScopeConfigurator.jsx + computeZoneWeights.js,
    // never through resolveTemplateWPs()/buildCustomSelectorState() below —
    // those stay v1-only (flat phase/WP model) and are untouched by this entry.
    id: 'retail-fitout-v2',
    label: 'Retail Fit-Out (Zoned) — v2',
    description: 'Zoned retail fit-out: common areas + sales floor + back-of-house, weighted by floor area',
    icon: '🏬',
    includedPhases: null,
    includedWPs: null,
  },
];

export function getTemplateById(id) {
  return TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
}

/**
 * Get the resolved list of WP IDs for a given template.
 * For 'custom', pass selectedPhases or selectedWPIds.
 */
export function resolveTemplateWPs(templateId, { selectedPhases, selectedWPIds } = {}) {
  const template = getTemplateById(templateId);

  if (templateId === 'custom') {
    if (selectedWPIds && selectedWPIds.length > 0) return selectedWPIds;
    if (selectedPhases && selectedPhases.length > 0) {
      return WORK_PACKAGES
        .filter(wp => selectedPhases.includes(wp.phaseId))
        .map(wp => wp.id);
    }
    return WORK_PACKAGES.map(wp => wp.id); // default: all
  }

  const phases = new Set(template.includedPhases);
  return WORK_PACKAGES
    .filter(wp => phases.has(wp.phaseId))
    .map(wp => wp.id);
}

/**
 * For the Custom template, build phase + WP selector state.
 * Returns: { phases: [{ ...phase, wps: [...], checked: bool }] }
 */
export function buildCustomSelectorState(_selectedPhaseIds = [], selectedWPIds = []) {
  const wpIdSet = new Set(selectedWPIds);

  return PHASES.map(phase => {
    const wps = getWPsByPhase(phase.id);
    const allChecked = wps.every(wp => wpIdSet.has(wp.id));
    const someChecked = wps.some(wp => wpIdSet.has(wp.id));

    return {
      ...phase,
      wps: wps.map(wp => ({ ...wp, checked: wpIdSet.has(wp.id) })),
      checked: allChecked,
      indeterminate: !allChecked && someChecked,
    };
  });
}
