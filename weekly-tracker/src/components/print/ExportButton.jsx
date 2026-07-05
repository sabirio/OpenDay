/**
 * ExportButton — triggers window.print() for PDF export (browser "Save as
 * PDF" in the print dialog). className="no-print" hides the button itself
 * in the printed output (see src/styles/print.css).
 */
export default function ExportButton({ label = 'Export PDF' }) {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 8, minHeight: 44,
        background: 'var(--accent)', color: 'var(--text-inverse)',
        border: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: 600,
      }}
    >
      ⬇ {label}
    </button>
  );
}
