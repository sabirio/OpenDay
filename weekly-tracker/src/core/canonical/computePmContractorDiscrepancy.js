import { discrepancySeverity } from '../../engines/discrepancyEngine.js';
import { computeCanonicalDifference } from '../../engines/canonicalCoreEngine.js';

export function computePmContractorDiscrepancy(progress, snapshot) {
  const contractor = progress.contractorProgress;
  const pm = progress.verifiedProgress;
  const available = contractor != null && pm != null;
  const { signedDifference, absoluteDifference } = computeCanonicalDifference(contractor, pm);
  return {
    contractorProgress: contractor,
    pmVerifiedProgress: pm,
    signedDifference,
    absoluteDifference,
    severity: signedDifference == null ? 'unavailable' : discrepancySeverity(signedDifference),
    confidence: progress.confidence,
    comparedScope: { workPackageIds: [...snapshot.scope.workPackageIds] },
    contractorReportId: snapshot.latestContractorReport?.id == null ? null : String(snapshot.latestContractorReport.id),
    siteVisitId: snapshot.latestSiteVisit?.id == null ? null : String(snapshot.latestSiteVisit.id),
    comparedAt: snapshot.latestSiteVisit?._canonicalDate || snapshot.latestContractorReport?._canonicalDate || null,
    warnings: available ? [] : [{ code: 'DISCREPANCY_INPUT_UNAVAILABLE', path: 'discrepancy', severity: 'info' }],
  };
}
