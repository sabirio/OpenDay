export const RISK_COLORS = {
  LOW:      { text: "#86efac", bg: "#052e16", border: "#166534" },
  MEDIUM:   { text: "#fcd34d", bg: "#422006", border: "#b45309" },
  HIGH:     { text: "#fdba74", bg: "#431407", border: "#c2410c" },
  CRITICAL: { text: "#fca5a5", bg: "#450a0a", border: "#7f1d1d" },
};

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
