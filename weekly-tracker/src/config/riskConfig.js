export const RISK_COLORS = {
  LOW:      { text: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  MEDIUM:   { text: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  HIGH:     { text: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  CRITICAL: { text: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
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
