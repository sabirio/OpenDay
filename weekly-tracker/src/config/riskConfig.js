export const RISK_COLORS = {
  LOW:      { text: "var(--status-done)",  bg: "var(--status-done-bg)",   border: "var(--border)" },
  MEDIUM:   { text: "var(--status-warn)",  bg: "var(--status-warn-bg)",   border: "var(--border)" },
  HIGH:     { text: "var(--status-warn)",  bg: "var(--status-warn-bg)",   border: "var(--border)" },
  CRITICAL: { text: "var(--status-alert)", bg: "var(--status-alert-bg)",  border: "var(--border)" },
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
