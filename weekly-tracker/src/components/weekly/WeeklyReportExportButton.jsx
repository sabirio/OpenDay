import { useCallback, useRef, useState } from 'react';

/**
 * WeeklyReportExportButton — the UI entry point for the Export Engine's
 * first consumer. Unlike the older browser-print-dialog-based export button
 * (components/print/ExportButton.jsx, still used by RiskDashboard), this
 * generates a real, standalone PDF (see src/export/) that does not depend on
 * this page's DOM/layout.
 *
 * All export code (buildWeeklyReportExportModel, the PDF template,
 * @react-pdf/renderer itself) is loaded via dynamic import on first click —
 * it is not part of the app's normal startup bundle. See src/export/pdf/
 * renderExportPdf.js for why.
 */
export default function WeeklyReportExportButton({
  project,
  report,
  prevReport,
  projectReports,
  siteVisits,
  canonicalResult,
  activeTemplate,
  legacyWorkPackages,
  overallProgress,
  onError,
}) {
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (inFlightRef.current) return; // guard against double-click/rapid re-trigger
    inFlightRef.current = true;
    setBusy(true);
    try {
      const [
        { buildWeeklyReportExportModel },
        { WeeklyReportPdfTemplate },
        { renderPdfBlob, downloadPdfBlob },
        { resolveExportEvidence },
        { buildWeeklyReportFilename },
      ] = await Promise.all([
        import('../../export/weekly/buildWeeklyReportExportModel.js'),
        import('../../export/pdf/WeeklyReportPdfTemplate.js'),
        import('../../export/pdf/renderExportPdf.js'),
        import('../../export/pdf/resolveExportEvidence.js'),
        import('../../export/weekly/weeklyReportFilename.js'),
      ]);

      const model = buildWeeklyReportExportModel({
        project, report, prevReport, projectReports, siteVisits,
        canonicalResult, activeTemplate, legacyWorkPackages, overallProgress,
      });

      const evidenceItems = await resolveExportEvidence(model.evidence.photos);
      const doc = WeeklyReportPdfTemplate(model, evidenceItems);
      const blob = await renderPdfBlob(doc);
      const filename = buildWeeklyReportFilename({
        storeCode: model.project?.storeCode,
        reportingDate: model.reportingPeriod?.reportingDate,
        submittedAt: model.reportingPeriod?.submittedAt,
      });
      downloadPdfBlob(blob, filename);
    } catch (err) {
      console.error('[WeeklyReportExportButton] PDF generation failed:', err);
      onError?.("Couldn't generate the PDF — please try again.");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [project, report, prevReport, projectReports, siteVisits, canonicalResult, activeTemplate, legacyWorkPackages, overallProgress, onError]);

  return (
    <button
      type="button"
      className="btn btn-primary no-print"
      onClick={handleClick}
      disabled={busy}
    >
      {busy ? 'Generating PDF…' : <>⬇ Export PDF</>}
    </button>
  );
}
