import { computeCumulativeStatuses, computeWPCumulativeStatuses } from '../../utils/reportUtils.js';
import { calculateProjectProgressResult } from '../../engines/progressEngine.js';
import { computeExpectedPct } from '../../utils/scheduleUtils.js';
import { V2_TEMPLATE_TYPE } from '../../domains/construction/templates/retailFitoutV2.js';
import { buildV2ProgressTemplate } from '../projects/weights/buildV2ProgressTemplate.js';
import { clampProgressPct } from '../../engines/progressEngine.js';
import { meanObservedProgress, roundCanonical } from '../../engines/canonicalCoreEngine.js';
import { isTemplateValid } from '../projects/index.js';
import { resolveEffectiveV2ZoneAreas } from '../projects/areas/resolveProjectArea.js';

function computeVerifiedProgress(snapshot) {
  const rows = snapshot.latestSiteVisit?.wps;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const active = new Set(snapshot.scope.workPackageIds);
  const usable = rows.filter(row => active.has(row.wpId ?? row.wp_id) && Number.isFinite(Number(row.observed_progress)));
  if (!usable.length) return null;
  return meanObservedProgress(usable);
}

export function computeCanonicalProgress(snapshot) {
  const wpCum = computeWPCumulativeStatuses(snapshot.contractorReports);
  const legCum = computeCumulativeStatuses(snapshot.contractorReports);
  const template = snapshot.project.templateType === V2_TEMPLATE_TYPE
    ? buildV2ProgressTemplate(
        resolveEffectiveV2ZoneAreas(snapshot.project),
        snapshot.project.scope?.zones ?? null,
        snapshot.project.scope?.categories ?? null,
        snapshot.template,
      )
    : (snapshot.template && isTemplateValid(snapshot.template) ? snapshot.template : null);
  const legacy = calculateProjectProgressResult(wpCum, legCum, snapshot.scope.workPackageIds, template, snapshot.project.scope?.weightOverrides ?? null);
  const contractorProgress = snapshot.contractorReports.length ? clampProgressPct(legacy.progress) : null;
  const overallProgress = contractorProgress ?? 0;
  const verifiedProgress = computeVerifiedProgress(snapshot);
  const expected = computeExpectedPct(snapshot.project, new Date(snapshot.metadata.calculatedAt));
  const plannedProgress = Number.isFinite(expected) ? clampProgressPct(expected) : null;
  const variance = contractorProgress == null || verifiedProgress == null ? null : roundCanonical(contractorProgress - verifiedProgress);
  return {
    overallProgress: roundCanonical(overallProgress),
    contractorProgress: contractorProgress == null ? null : roundCanonical(contractorProgress),
    verifiedProgress,
    plannedProgress: plannedProgress == null ? null : roundCanonical(plannedProgress),
    variance,
    confidence: verifiedProgress == null ? null : 100,
    calculationMethod: `progressEngine:${legacy.format};pm:active-wp-mean`,
    breakdown: legacy.phases || [],
    warnings: [],
    calculatedAt: snapshot.metadata.calculatedAt,
  };
}
