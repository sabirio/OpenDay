/**
 * PrintHeader — shown only when printing (`.print-only` is defined in
 * src/styles/print.css: display:none on screen, display:block in @media print).
 * Props:
 *   title:        string
 *   projectLabel?: string — pre-formatted (e.g. `${storeCode} — ${shoppingMallName}`);
 *                  this component doesn't assume a project shape.
 *   exportedBy?:  string
 */
export default function PrintHeader({ title, projectLabel, exportedBy }) {
  return (
    <div className="print-only">
      <div style={{ borderBottom: '2px solid #1e3a5f', paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a5f', marginBottom: 2 }}>
              C&F Progress Tracker
            </div>
            <div style={{ fontSize: 14, color: '#374151' }}>{title}</div>
            {projectLabel && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                Project: {projectLabel}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280' }}>
            <div>Date: {new Date().toLocaleDateString()}</div>
            {exportedBy && <div>Exported by: {exportedBy}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
