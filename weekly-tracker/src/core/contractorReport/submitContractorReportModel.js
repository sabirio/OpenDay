import { submitReport } from '../../services/contractorReportService';
import { buildContractorReportSubmission } from './buildContractorReportSubmission';

/**
 * Compose one contractor report submission and persist it. The single
 * entry point the ContractorReport.jsx page's submit action calls —
 * everything upstream of "save to the DB" (synthesis, normalization,
 * cumulative-progress math) is pure and lives in buildContractorReportSubmission.
 */
export async function submitContractorReportModel(input) {
  const { mainReportPayload, wpProgressArray, cumulativeProgress, contractorRawAverageProgress } =
    buildContractorReportSubmission(input);

  await submitReport(input.project.id, wpProgressArray, {
    reportDate: mainReportPayload.reportingDate,
    overallProgress: contractorRawAverageProgress,
    masterReportId: mainReportPayload.id,
    reportSnapshot: mainReportPayload,
    cumulativeProgress,
    photoUrls: input.photoUrls,
  });

  return mainReportPayload;
}
