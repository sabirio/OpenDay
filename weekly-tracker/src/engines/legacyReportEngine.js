// Adapters for legacy (pre-WorkPackage) report format.
// Pure; no component state. Extracted from WeeklyReports.jsx per one-source rule.

import { WP_STATUS_SCORES } from '../config/workPackages';

export const OLD_TO_WP_WEEKLY = {
  "Flooring installation":                                   { wpId: "finishes",      task: "Floor finishes" },
  "Drywall partition installation":                          { wpId: "construction",  task: "Partitions & drywall" },
  "Electrical systems installation":                         { wpId: "mep",           task: "Electrical conduits & cabling" },
  "HVAC systems installation":                               { wpId: "mep",           task: "HVAC ducts" },
  "Fire safety systems installation":                        { wpId: "mep",           task: "Fire suppression pipes" },
  "Low current systems installation":                        { wpId: "mep",           task: "Low current systems" },
  "Ceiling installation":                                    { wpId: "construction",  task: "Ceiling structures" },
  "Lighting installation":                                   { wpId: "finishes",      task: "Lighting fixtures" },
  "Furniture installation":                                  { wpId: "equipment",     task: "Furniture & loose items" },
  "Sprinkler system testing and commissioning":              { wpId: "commissioning", task: "Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":        { wpId: "commissioning", task: "Fire alarm testing" },
  "Emergency announcement system testing and commissioning": { wpId: "commissioning", task: "Integrated systems testing" },
  "HVAC system testing and commissioning":                   { wpId: "commissioning", task: "HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":             { wpId: "commissioning", task: "Electrical testing & certification" },
  "Low current testing and commissioning":                   { wpId: "commissioning", task: "Security & access control testing" },
  "Staff training":                                          { wpId: "handover",      task: "Staff training" },
  "Manuals, certificates, test reports":                     { wpId: "handover",      task: "O&M manuals" },
  "Final cleaning":                                          { wpId: "handover",      task: "Final cleaning" },
  "Snag list resolution":                                    { wpId: "handover",      task: "Defects & snagging resolution" },
};

export function mapOldToWPStatus(s) {
  if (!s) return null;
  const v = String(s).toLowerCase().trim();
  if (v === "completed" || v === "done" || v === "complete") return "Completed";
  if (v.includes("progress") || v === "started" || v === "active") return "In Progress";
  if (v === "delayed" || v === "blocked" || v === "behind") return "Delayed";
  return null;
}

export function deriveWPStatusesFromOldReport(report) {
  if (!report) return {};
  const result = {};
  function set(wpId, taskName, rawStatus) {
    const status = mapOldToWPStatus(rawStatus);
    if (!status) return;
    if (!result[wpId]) result[wpId] = {};
    result[wpId][taskName] = { status };
  }
  set("demolition", "Demolition works", report.demolitionStatus);
  for (const [oldKey, { wpId, task }] of Object.entries(OLD_TO_WP_WEEKLY)) {
    const raw = report.constructionStatuses?.[oldKey]
      ?? report.testingStatuses?.[oldKey]
      ?? report.handoverStatuses?.[oldKey];
    set(wpId, task, raw);
  }
  return result;
}

export function mergeOldDerivedStatuses(derivedList) {
  const result = {};
  for (const derived of derivedList) {
    for (const [wpId, tasks] of Object.entries(derived)) {
      if (!result[wpId]) result[wpId] = {};
      for (const [taskName, entry] of Object.entries(tasks)) {
        const cur = result[wpId][taskName];
        if (!cur || (WP_STATUS_SCORES[entry.status] ?? -1) > (WP_STATUS_SCORES[cur.status] ?? -1)) {
          result[wpId][taskName] = entry;
        }
      }
    }
  }
  return result;
}
