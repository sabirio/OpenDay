import { WORK_PACKAGES, makeEmptyWPStatuses } from "../../config/workPackages";

// WP id → old phase name mapping for backward compat
export const WP_TO_OLD_PHASE = {
  preconstruction: "Construction works",
  demolition: "Demolition works",
  construction: "Construction works",
  mep: "Construction works",
  finishes: "Construction works",
  equipment: "Construction works",
  commissioning: "Testing & Commissioning",
  handover: "Handover",
};

export function deriveOldPhasesFromPackages(packages) {
  return [...new Set((packages || []).map((id) => WP_TO_OLD_PHASE[id]).filter(Boolean))];
}

export function derivePackagesFromOldPhases(phases) {
  const map = {
    "Demolition works": ["demolition"],
    "Construction works": ["preconstruction", "construction", "mep", "finishes", "equipment"],
    "Testing & Commissioning": ["commissioning"],
    Handover: ["handover"],
  };
  const result = new Set();
  for (const p of phases || []) {
    for (const id of map[p] || []) result.add(id);
  }
  return [...result];
}

export function calculateWeeksBetween(start, end) {
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 7)));
}

export function getConstructionWeekInfo(start, end, reference) {
  const totalWeeks = calculateWeeksBetween(start, end);
  if (reference < start) return { totalWeeks, weekNumber: 0, label: "Before construction start" };
  if (reference >= end) return { totalWeeks, weekNumber: totalWeeks, label: `Construction complete · ${totalWeeks} weeks` };
  const weekNumber = Math.min(Math.floor((reference - start) / (1000 * 60 * 60 * 24 * 7)) + 1, totalWeeks);
  return { totalWeeks, weekNumber, label: `Week ${weekNumber} of ${totalWeeks}` };
}

// Build cumulative best WP statuses across all project reports
const _WP_SCORES = { 'Not Applicable': null, 'Not Started': 0, 'In Progress': 0.5, 'Completed': 1, 'Delayed': 0.3 };
export function buildCumulativeWPStatuses(allReports) {
  const base = makeEmptyWPStatuses();
  for (const report of allReports) {
    const snap = report.workPackageStatuses;
    if (!snap) continue;
    for (const wp of WORK_PACKAGES) {
      const pkgSnap = snap[wp.id] || {};
      for (const task of wp.tasks) {
        const s = pkgSnap[task.name];
        if (!s) continue;
        const cur = base[wp.id][task.name];
        if ((_WP_SCORES[s.status] ?? -1) > (_WP_SCORES[cur.status] ?? -1) ||
            (s.progress || 0) > (cur.progress || 0)) {
          base[wp.id][task.name] = { ...cur, ...s };
        }
      }
    }
  }
  return base;
}

export function makeInitialForm(prevReport, cumulativeStatuses) {
  // Start from cumulative best statuses across all reports (not just the latest)
  const wpStatuses = cumulativeStatuses
    ? JSON.parse(JSON.stringify(cumulativeStatuses))
    : makeEmptyWPStatuses();

  let currentPackages = [];

  if (prevReport?.workPackageStatuses) {
    currentPackages = prevReport.currentPackages || derivePackagesFromOldPhases(prevReport.currentPhases);
  } else if (prevReport) {
    // Old format: derive active packages from old phases
    currentPackages = derivePackagesFromOldPhases(
      Array.isArray(prevReport.currentPhases) ? prevReport.currentPhases : (prevReport.currentPhase ? [prevReport.currentPhase] : [])
    );
  }

  // Auto-select first work package if nothing is selected
  if (!currentPackages.length) {
    currentPackages = [WORK_PACKAGES[0].id];
  }

  // Auto-advance reporting date by 7 days from the last report
  const nextReportDate = prevReport
    ? (() => {
        const d = new Date(prevReport.reportingDate || prevReport.submittedAt);
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
      })()
    : new Date().toISOString().split('T')[0];

  return {
    reportingDate: nextReportDate,
    currentPackages,
    workPackageStatuses: wpStatuses,
    projectScheduleStatus: "On Track",
    risks:                 [],
    riskOwners:            [],
    riskScale:             "",
    riskDescription: "",
    supportRequired:       "No",
    supportTypes:          [],
    supportDescription: "",
    additionalWorks:       "No",
    additionalWorksParty:  "",
    additionalWorksDescription: "",
    additionalWorksCost: "",
    nextWeekTop3: "",
    weekAfterTop3: "",
    activitiesBlocked:     prevReport?.activitiesBlocked || "No",
    delayReason: "",
    pendingIssues: "",
    finalComments: "",
    photos: [],
    declarationConfirmed: false,
  };
}

export function validateContractorReport(form, photoUrls) {
  const errors = [];
  if (!form.reportingDate) errors.push("Reporting date is required.");
  if (!(form.currentPackages || []).length) errors.push("Select at least one active work package.");
  if (
    form.projectScheduleStatus === "At Risk" ||
    form.projectScheduleStatus === "Critical"
  ) {
    if (!form.risks.length) errors.push("Select at least one risk indication.");
    if (!form.riskOwners.length) errors.push("Select at least one risk owner.");
    if (!form.riskScale) errors.push("Risk scale is required.");
    if (!form.riskDescription) errors.push("Risk description is required.");
  }
  if (!form.supportRequired) errors.push("Customer support selection is required.");
  if (form.supportRequired === "Yes") {
    if (!form.supportTypes.length) errors.push("Select at least one support type.");
    if (!form.supportDescription) errors.push("Support description is required.");
  }
  // P2.1: nextWeekTop3 / weekAfterTop3 / pendingIssues / finalComments were
  // required free text — real typing friction for a phone on site. Made
  // optional per product decision (2026-07-06); still shown as fields the
  // contractor can fill in, just no longer block submit if left blank.
  if (!form.activitiesBlocked) errors.push("Activities blocked answer is required.");
  if (form.activitiesBlocked === "Yes" && !form.delayReason)
    errors.push("Delay reason is required when activities are blocked.");
  if (!photoUrls.length) errors.push("At least one photo is required.");
  if (!form.declarationConfirmed) errors.push("Declaration confirmation is required.");
  return errors;
}
