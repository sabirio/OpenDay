/**
 * Adapts contractor_reports + contractor_report_wps rows to the legacy report
 * shape consumed by screens that have not been migrated yet.
 *
 * Pure adapter (no I/O) — relocated from services/contractorReportAdapter.js
 * (architecture-conformance pass): it composes core/projects/grouping's
 * getWPGrouping, which a services/ file must never import.
 */

import { getWPById, getPhaseById } from '../../config/masterTaskLibrary.js';
import { getWPByIdV2, retailFitoutV2 } from '../../domains/construction/templates/retailFitoutV2.js';
import { getWPGrouping, isZonedTemplate } from '../projects/grouping/getWPGrouping.js';
import { clampProgressPct } from '../../engines/progressEngine.js';

const STATUS_TO_LEGACY = {
  completed: "Completed",
  in_progress: "In Progress",
  delayed: "In Progress",
  blocked: "In Progress",
  not_started: "Not Started",
};

function toLegacyStatus(status) {
  return STATUS_TO_LEGACY[status] || "Not Started";
}

// Defensive numeric coercion at the adapter boundary (P1.3): contractor_reports
// .overall_progress and contractor_report_wps.progress_pct are Postgres numeric
// columns, but a corrupted/legacy row can still surface as a non-numeric string,
// NaN, or an out-of-range value. `?? 0` alone only catches null/undefined — a
// bad-but-non-null value would flow through unchanged into workPackageStatuses,
// fail ContractorReportSchema's z.number() check downstream, and silently drop
// the ENTIRE report from the reports list (one bad WP row disappearing a whole
// report is worse than clamping that one value). Clamp here instead, once, at
// the boundary where raw DB rows become the shape engines consume.
function toFiniteProgress(value, label) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    if (value != null) console.warn(`[contractorReportAdapter] non-numeric ${label}:`, value);
    return 0;
  }
  return clampProgressPct(n);
}

// contractor_report_wps.wp_id stores the fine-grained work-package id (e.g.
// "walls.framing" for v1, "common.demolition.strip_out" for v2's zoned
// template) — NOT a group id, and the table has no wp_label/phase_id columns
// of its own. The legacy shape consumed by progressEngine.calculatePhaseProgress()
// is keyed [groupId][taskLabel] (v1: phaseId; v2: categoryId — see
// buildV2ProgressTemplate.js's synthetic-phase convention), so both id and
// label are resolved here via getWPGrouping — the single grouping source of
// truth shared with the contractor/site-visit form UIs — rather than
// duplicating v1/v2 branching logic.
function buildWorkPackageStatuses(wps, templateType = null) {
  const acc = {};
  for (const wp of (wps || [])) {
    const meta    = isZonedTemplate(templateType) ? getWPByIdV2(wp.wp_id) : getWPById(wp.wp_id);
    const grouping = getWPGrouping(templateType, wp.wp_id);
    const groupId = grouping?.categoryId || grouping?.phaseId || wp.wp_id;
    const label   = meta?.label || wp.wp_id;
    if (!groupId) continue;

    if (!acc[groupId]) acc[groupId] = {};
    acc[groupId][label] = {
      status: toLegacyStatus(wp.status),
      progress: toFiniteProgress(wp.progress_pct, `contractor_report_wps.progress_pct (wp_id=${wp.wp_id})`),
      comment: wp.comment || "",
    };
  }
  return acc;
}

// v2 categories have no explicit "order" field (unlike v1 phases) — this
// mirrors the exact zone-then-category traversal order buildV2ProgressTemplate.js
// already uses to assign its synthetic phases' `order`, reused here only for
// this legacy display concern (not a calculation) so "furthest along" has a
// deterministic meaning for zoned projects too.
function buildV2CategoryOrder() {
  const order = {};
  let i = 0;
  for (const zone of retailFitoutV2.zones) {
    for (const cat of zone.categories) order[cat.id] = i++;
  }
  return order;
}
const V2_CATEGORY_ORDER = buildV2CategoryOrder();

// Furthest-along phase/category with actual progress, for the "Current Phase"
// column — not every phase ever touched, just where the contractor stands now.
function deriveCurrentPhases(wps, templateType = null) {
  const zoned = isZonedTemplate(templateType);
  let furthestLabel = null, furthestOrder = -Infinity;
  for (const wp of (wps || [])) {
    const hasProgress = (wp.progress_pct ?? 0) > 0 || (wp.status && wp.status !== 'not_started');
    if (!hasProgress) continue;

    if (zoned) {
      const grouping = getWPGrouping(templateType, wp.wp_id);
      if (!grouping) continue;
      const order = V2_CATEGORY_ORDER[grouping.categoryId] ?? -Infinity;
      if (order > furthestOrder) { furthestOrder = order; furthestLabel = grouping.categoryLabel; }
      continue;
    }

    const meta = getWPById(wp.wp_id);
    const phase = meta?.phaseId ? getPhaseById(meta.phaseId) : null;
    if (!phase) continue;
    if (phase.order > furthestOrder) { furthestOrder = phase.order; furthestLabel = phase.label; }
  }
  return furthestLabel ? [furthestLabel] : [];
}

function normalizePhotos(photoUrls) {
  if (!Array.isArray(photoUrls)) return [];
  return photoUrls.filter((photo) => typeof photo === 'string' && photo.trim().length > 0);
}

export function adaptContractorReportToLegacy(contractorReport, wps = [], templateType = null) {
  if (!contractorReport) return null;

  const reportingDate = contractorReport.report_date || contractorReport.submitted_at;

  return {
    id: contractorReport.id,
    projectId: contractorReport.project_id,
    submittedAt: contractorReport.submitted_at || contractorReport.created_at || reportingDate,
    reportingDate,
    weekNumber: contractorReport.week_number ?? null,
    overallProgress: toFiniteProgress(contractorReport.overall_progress, `contractor_reports.overall_progress (id=${contractorReport.id})`),
    submittedBy: contractorReport.submitted_by || null,
    projectScheduleStatus: contractorReport.project_schedule_status || "On Track",
    workPackageStatuses: buildWorkPackageStatuses(wps, templateType),
    photos: normalizePhotos(contractorReport.photo_urls),
    risks: [],
    riskOwners: [],
    supportTypes: [],
    currentPackages: [],
    currentPhases: deriveCurrentPhases(wps, templateType),
    // 023: these 6 columns didn't exist on contractor_reports before — the RPC
    // silently dropped them into progress_history.snapshot's opaque JSONB blob,
    // so Weekly Reports' Look Ahead/Declaration panels always showed empty.
    nextWeekTop3: contractorReport.next_week_top3 || "",
    weekAfterTop3: contractorReport.week_after_top3 || "",
    activitiesBlocked: contractorReport.activities_blocked || "No",
    delayReason: contractorReport.delay_reason || "",
    pendingIssues: contractorReport.pending_issues || "",
    finalComments: contractorReport.final_comments || "",
    sourceTable: "contractor_reports",
  };
}

export function adaptContractorReportsToLegacy(reports, wpsByReportId = {}, templateTypeByProjectId = {}) {
  return (reports || [])
    .map((report) => adaptContractorReportToLegacy(
      report,
      wpsByReportId[report.id] || [],
      templateTypeByProjectId[report.project_id] ?? null,
    ))
    .filter(Boolean);
}
