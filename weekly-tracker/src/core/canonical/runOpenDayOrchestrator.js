import { evaluateProjectState } from '../opendayEngine/evaluateProjectState.js';
import { computeProjectSummary } from '../../engines/projectSummaryEngine.js';
import { buildCanonicalProjectSnapshot } from './buildCanonicalProjectSnapshot.js';
import { computeCanonicalProgress } from './computeCanonicalProgress.js';
import { computePmContractorDiscrepancy } from './computePmContractorDiscrepancy.js';
import { buildLegacyRiskCompatibilityInput } from '../../engines/riskCompatibilityEngine.js';

export function runOpenDayOrchestrator(raw = {}, options = {}) {
  const requestedAt = options.calculatedAt;
  const validRequestedAt = requestedAt == null || Number.isFinite(Date.parse(requestedAt));
  const calculatedAt = validRequestedAt && requestedAt != null ? new Date(requestedAt).toISOString() : new Date().toISOString();
  const effectiveOptions = { ...options, calculatedAt };
  const snapshot = buildCanonicalProjectSnapshot(raw, effectiveOptions);
  if (!validRequestedAt) snapshot.warnings.push({
    code: 'INVALID_CALCULATED_AT_REPLACED', path: 'options.calculatedAt',
    originalValue: requestedAt, normalizedValue: calculatedAt, severity: 'warning',
  });
  const progress = computeCanonicalProgress(snapshot);
  const discrepancy = computePmContractorDiscrepancy(progress, snapshot);
  const riskCompatibilityInput = buildLegacyRiskCompatibilityInput(snapshot.contractorReports, snapshot.siteVisits);
  const legacyState = evaluateProjectState(snapshot.project, snapshot.contractorReports, snapshot.siteVisits, {
    ...effectiveOptions,
    riskCompatibilityInput,
    canonicalScopeWPIds: snapshot.scope.workPackageIds,
  });
  const projectSummary = computeProjectSummary(
    snapshot.project,
    snapshot.contractorReports,
    snapshot.siteVisits,
    progress.overallProgress,
    legacyState.wpCumulativeStatuses,
    calculatedAt
  );
  return {
    snapshot,
    progress,
    discrepancy,
    schedule: legacyState.progressComparison || null,
    readiness: legacyState.readiness || null,
    risks: legacyState.riskScore,
    // Phase 3D.1: promoted straight from legacyState (no second derivation
    // path here — evaluateProjectState() remains the one place these are
    // computed) so canonical consumers can read commitment/assessment state
    // without reaching into compatibility.legacyState.
    scheduleOwnershipMode: legacyState.scheduleOwnershipMode,
    commitmentState: legacyState.commitmentState,
    assessmentAvailability: legacyState.assessmentAvailability,
    reportDueState: legacyState.reportDueState,
    warnings: [...snapshot.warnings, ...progress.warnings, ...discrepancy.warnings],
    calculatedAt: snapshot.metadata.calculatedAt,
    compatibility: { legacyState, projectSummary, readiness: true, risk: true, schedule: true },
  };
}
