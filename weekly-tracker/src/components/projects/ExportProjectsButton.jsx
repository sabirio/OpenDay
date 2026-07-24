import { useCallback, useRef, useState } from "react";

/**
 * ExportProjectsButton — downloads the current Portfolio result set (after
 * search/filters, exactly what the table below is showing) as a real XLSX
 * workbook. All export code (the XLSX engine under src/export/xlsx/) is
 * loaded via dynamic import on first click, mirroring
 * components/weekly/WeeklyReportExportButton.jsx's pattern — not part of
 * the app's normal startup bundle.
 *
 * Pure read/download: no project, import_jobs, or any other row is ever
 * written by this action.
 */
export default function ExportProjectsButton({ projects, onError }) {
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const handleClick = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const [
        { buildProjectWorkbookBytes },
        { downloadXlsxBlob },
        { buildProjectExportFilename },
      ] = await Promise.all([
        import("../../export/xlsx/buildProjectWorkbook.js"),
        import("../../export/xlsx/downloadXlsxBlob.js"),
        import("../../export/xlsx/projectExportFilename.js"),
      ]);

      const bytes = buildProjectWorkbookBytes(projects || []);
      downloadXlsxBlob(bytes, buildProjectExportFilename());
    } catch (err) {
      console.error("[ExportProjectsButton] workbook generation failed:", err);
      onError?.("Couldn't generate the export file — please try again.");
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [projects, onError]);

  return (
    <button type="button" className="secondary-button" onClick={handleClick} disabled={busy}>
      {busy ? "Generating…" : "Export Projects"}
    </button>
  );
}
