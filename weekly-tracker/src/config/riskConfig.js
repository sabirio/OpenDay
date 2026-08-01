// Phase 2 status consolidation: this used to be a second, independently
// hand-maintained copy of the exact same LOW/MEDIUM/HIGH/CRITICAL color
// values already defined in config/statusColors.js's RISK_LEVEL_COLORS.
// Re-exported from there now so there is exactly one canonical color table —
// values for these four keys are unchanged (statusColors.js's version also
// carries an extra UNKNOWN fallback this file never had, which is additive
// and does not affect any existing consumer).
export { RISK_LEVEL_COLORS as RISK_COLORS } from './statusColors.js';

export const RISK_DIMENSIONS = [
  "Schedule", "Progress", "Resources", "Procurement",
  "Authorities", "Design", "Support", "Contractor",
  "Quality", "Safety", "Reporting", "PM Alignment", "Opening", "Commercial",
];

export const RISK_TO_DIMS = {
  "Resource Availability":          ["Resources", "Contractor"],
  "Material or Equipment Delivery": ["Resources", "Procurement"],
  "Regulatory Compliance":          ["Authorities"],
  "Coordination":                   ["Authorities", "Design"],
  "Safety or External Factors":     ["Safety", "Contractor"],
};

export const DIM_LEVEL_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
