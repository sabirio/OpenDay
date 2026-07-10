/** Canonical read model for print/PDF consumers; contains no calculations. */
export function buildProjectReportViewModel(orchestratorResult) {
  if (!orchestratorResult) return null;
  const { snapshot, progress, discrepancy, schedule, readiness, risks, calculatedAt, warnings } = orchestratorResult;
  return {
    project: snapshot.project,
    latestReport: snapshot.latestContractorReport,
    latestSiteVisit: snapshot.latestSiteVisit,
    progress,
    discrepancy,
    schedule,
    readiness,
    risks,
    evidence: snapshot.evidence,
    calculatedAt,
    warnings,
  };
}
