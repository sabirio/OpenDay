/**
 * ExportButton — triggers window.print() for PDF export (browser "Save as
 * PDF" in the print dialog). className="no-print" hides the button itself
 * in the printed output (see src/styles/print.css).
 */
export default function ExportButton({ label = 'Export PDF' }) {
  return (
    <button
      type="button"
      className="btn btn-primary no-print"
      onClick={() => window.print()}
    >
      ⬇ {label}
    </button>
  );
}
