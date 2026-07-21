import { compareWPTaskStatus } from "../../config/statusScores";

// ── GC reference status helpers ───────────────────────────────────────────────

// Old-format field → WP task name best-effort mapping
export const OLD_TO_WP = {
  "Flooring installation":                              { wpId: "finishes",       task: "Floor finishes" },
  "Drywall partition installation":                     { wpId: "construction",   task: "Partitions & drywall" },
  "Electrical systems installation":                    { wpId: "mep",            task: "Electrical conduits & cabling" },
  "HVAC systems installation":                          { wpId: "mep",            task: "HVAC ducts" },
  "Fire safety systems installation":                   { wpId: "mep",            task: "Fire suppression pipes" },
  "Low current systems installation":                   { wpId: "mep",            task: "Low current systems" },
  "Ceiling installation":                               { wpId: "construction",   task: "Ceiling structures" },
  "Lighting installation":                              { wpId: "finishes",       task: "Lighting fixtures" },
  "Furniture installation":                             { wpId: "equipment",      task: "Furniture & loose items" },
  "Sprinkler system testing and commissioning":         { wpId: "commissioning",  task: "Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":   { wpId: "commissioning",  task: "Fire alarm testing" },
  "Emergency announcement system testing and commissioning": { wpId: "commissioning", task: "Integrated systems testing" },
  "HVAC system testing and commissioning":              { wpId: "commissioning",  task: "HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":        { wpId: "commissioning",  task: "Electrical testing & certification" },
  "Low current testing and commissioning":              { wpId: "commissioning",  task: "Security & access control testing" },
  "Staff training":                                     { wpId: "handover",       task: "Staff training" },
  "Manuals, certificates, test reports":                { wpId: "handover",       task: "O&M manuals" },
  "Final cleaning":                                     { wpId: "handover",       task: "Final cleaning" },
  "Snag list resolution":                               { wpId: "handover",       task: "Defects & snagging resolution" },
};

// Convert old GC status string → new WP status string
export function mapOldStatus(s) {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("completed") || lower.includes("ready")) return "Completed";
  if (lower.includes("in progress") || lower.includes("started")) return "In Progress";
  if (lower === "not applicable" || lower === "n/a") return null;
  return "Not Started";
}

/**
 * Get GC's reported status for a given WP task from either format.
 * Returns { status, progress } or null.
 */
export function getGCTaskEntry(gcReport, wpId, taskName) {
  if (!gcReport) return null;

  // New format
  if (gcReport.workPackageStatuses?.[wpId]?.[taskName] != null) {
    const e = gcReport.workPackageStatuses[wpId][taskName];
    return { status: e.status, progress: e.progress ?? 0 };
  }

  // Old format — reverse-lookup by checking if this wpId+taskName matches an old item
  for (const [oldItem, mapping] of Object.entries(OLD_TO_WP)) {
    if (mapping.wpId === wpId && mapping.task === taskName) {
      let oldStatus = null;
      if (oldItem === "Demolition works") {
        oldStatus = gcReport.demolitionStatus;
      } else if (gcReport.constructionStatuses?.[oldItem] != null) {
        oldStatus = gcReport.constructionStatuses[oldItem];
      } else if (gcReport.testingStatuses?.[oldItem] != null) {
        oldStatus = gcReport.testingStatuses[oldItem];
      } else if (gcReport.handoverStatuses?.[oldItem] != null) {
        oldStatus = gcReport.handoverStatuses[oldItem];
      }
      const mapped = mapOldStatus(oldStatus);
      return mapped ? { status: mapped, progress: 0 } : null;
    }
  }

  return null;
}

// ── Status comparison ─────────────────────────────────────────────────────────

export function comparisonResult(pmStatus, gcStatus) {
  if (!pmStatus && !gcStatus) return null;
  // Either side marked N/A — exclude from comparison metrics entirely
  if (pmStatus === "Not Applicable" || gcStatus === "Not Applicable") return null;
  if (!pmStatus) return { type: "not-assessed", badge: "Not assessed", color: "var(--field-text-label)", bg: "var(--field-bg-card)",    border: "var(--field-bg-subtle)" };
  if (!gcStatus) return { type: "no-gc",        badge: "No GC data",   color: "var(--field-text-secondary)",  bg: "var(--field-bg-faint-alt)", border: "var(--field-border)" };
  const cmp = compareWPTaskStatus(pmStatus, gcStatus); // 'match' | 'pm-higher' | 'gc-higher' — pmStatus/gcStatus already guaranteed truthy above
  if (cmp === "match")     return { type: "match",       badge: "✓ Match",       color: "var(--field-success-fg-dark)", bg: "var(--field-success-bg)", border: "var(--field-success-border)" };
  if (cmp === "gc-higher") return { type: "discrepancy", badge: "⚠ Discrepancy", color: "var(--field-danger-fg-dark)", bg: "var(--field-danger-bg)", border: "var(--field-danger-border)" };
  return                          { type: "pm-higher",   badge: "↑ PM ahead",    color: "var(--field-warning-fg-dark)", bg: "var(--field-warning-bg-subtle)", border: "var(--field-warning-border)" };
}
