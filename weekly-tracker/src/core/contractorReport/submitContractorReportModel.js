import { submitReport } from '../../services/contractorReportService';
import { buildContractorReportSubmission } from './buildContractorReportSubmission';
import { createClientRequestId, normalizeWriteError, validateUniqueWPItems } from '../write/writeCommand.js';
import { buildReportScopeSnapshot } from '../reporting/reportScopeSnapshot.js';

/**
 * Compose one contractor report submission and persist it. The single
 * entry point the ContractorReport.jsx page's submit action calls —
 * everything upstream of "save to the DB" (synthesis, normalization,
 * cumulative-progress math) is pure and lives in buildContractorReportSubmission.
 */
export async function submitContractorReportModel(input) {
  const { mainReportPayload, wpProgressArray, cumulativeProgress, contractorRawAverageProgress, scopeTemplate, effectiveWeights } =
    buildContractorReportSubmission(input);

  const reportScopeSnapshot = await buildReportScopeSnapshot({
    project: input.project,
    scopeTemplate,
    selectedWpIds: input.ganttTasks?.length > 0 ? input.ganttTasks.filter(task => !task.is_archived).map(task => task.id) : wpProgressArray.map(item => item.wpId),
    reportPeriodStart: mainReportPayload.reportingDate,
    reportPeriodEnd: mainReportPayload.reportingDate,
  });

  const clientRequestId = input.clientRequestId || createClientRequestId();
  if (wpProgressArray.length > 0) validateUniqueWPItems(wpProgressArray, 'contractor report');
  try {
    const persisted = await submitReport(input.project.id, wpProgressArray, {
    reportDate: mainReportPayload.reportingDate,
    overallProgress: contractorRawAverageProgress,
    masterReportId: mainReportPayload.id,
    reportSnapshot: mainReportPayload,
    cumulativeProgress,
    photoUrls: input.photoUrls,
      clientRequestId,
      calculatedAt: mainReportPayload.submittedAt,
      calculationVersion: 'openday-canonical-core/1',
      effectiveWeights,
      reportScopeSnapshot,
    });
    return { ...mainReportPayload, persistedReport: persisted.report, persistedReportId: persisted.report?.id || null, idempotentReplay: persisted.idempotentReplay === true };
  } catch (error) {
    throw normalizeWriteError(error, 'contractor_report.submit', clientRequestId);
  }
}
