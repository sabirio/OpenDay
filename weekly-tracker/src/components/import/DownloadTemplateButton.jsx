import { useCallback, useRef, useState } from "react";

/**
 * DownloadTemplateButton — "Don't have a file? Download Excel template."
 * Generates the Blank Import Template via the exact same workbook engine
 * Project Export uses (src/export/xlsx/buildProjectWorkbook.js with an
 * empty project list) — never a static public/*.xlsx file, never a second
 * hard-coded header list. Dynamically imported on click, same pattern as
 * components/weekly/WeeklyReportExportButton.jsx / components/projects/
 * ExportProjectsButton.jsx.
 */
export default function DownloadTemplateButton() {
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
        { PROJECT_IMPORT_TEMPLATE_FILENAME },
      ] = await Promise.all([
        import("../../export/xlsx/buildProjectWorkbook.js"),
        import("../../export/xlsx/downloadXlsxBlob.js"),
        import("../../export/xlsx/projectExportFilename.js"),
      ]);

      const bytes = buildProjectWorkbookBytes([]);
      downloadXlsxBlob(bytes, PROJECT_IMPORT_TEMPLATE_FILENAME);
    } catch (err) {
      console.error("[DownloadTemplateButton] template generation failed:", err);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-muted)" }}>
      <span>Don't have a file?</span>
      <button type="button" className="btn btn-ghost" onClick={handleClick} disabled={busy}>
        {busy ? "Generating…" : "Download Excel template"}
      </button>
    </div>
  );
}
