// Audited, intentional legacy-fallback import — tracked in
// src/tests/architectureGuard.test.mjs's ALLOWED_LEGACY_IMPORTERS.
// Migrating would rewrite live legacy-report compatibility behavior;
// out of scope here and hard-constraint-protected (no business-semantics
// changes).
// eslint-disable-next-line no-restricted-imports
import { WORK_PACKAGES, makeEmptyWPStatuses } from "../../config/workPackages";
import { isBadScheduleStatus } from "../../utils/reportUtils";
// calculateWeeksBetween/getConstructionWeekInfo moved to utils/scheduleUtils.js;
// buildCumulativeWPStatuses moved to utils/reportUtils.js (architecture-
// conformance pass — this file is components/, calc must live in engines/core).

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
  if (isBadScheduleStatus(form.projectScheduleStatus)) {
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
