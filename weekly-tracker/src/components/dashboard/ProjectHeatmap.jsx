import { WP_COLS, getWpStatus, getWpProgress, wpStyle } from '../../config/dashboardConstants';

export default function ProjectHeatmap({ rows, onRowClick }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight: 700, fontSize: 15, color: '#f9fafb', marginBottom: 4 }}>Work Package Status Heatmap</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Cumulative status of each work package per project · click row to open project details</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: '3px 3px', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontSize: 11, fontWeight: 700, color: '#6b7280', minWidth: 110 }}>Project</th>
              {WP_COLS.map(c => <th key={c.wpId} style={{ textAlign: 'center', padding: '4px 3px', fontSize: 9, fontWeight: 700, color: c.color || '#6b7280', minWidth: 48, whiteSpace: 'nowrap' }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ project, cumulativeStatuses, wpCumulativeStatuses }) => (
              <tr key={project.id} onClick={() => onRowClick(String(project.id))} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, color: '#e5e7eb', whiteSpace: 'nowrap' }}>{project.storeCode}</td>
                {WP_COLS.map(col => {
                  const st = getWpStatus(cumulativeStatuses, wpCumulativeStatuses, col);
                  const pct = getWpProgress(wpCumulativeStatuses, col);
                  const s = wpStyle(st);
                  const cellLabel = pct !== null ? `${pct}%` : s.lbl;
                  const title = pct !== null ? `${col.wpId}: ${pct}%` : (st || 'No data');
                  return <td key={col.wpId} style={{ textAlign: 'center', padding: '3px' }}><div title={title} style={{ width: 44, height: 28, borderRadius: 6, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: pct !== null ? 10 : 13, fontWeight: 800, color: s.text, border: '1px solid #374151' }}>{cellLabel}</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', fontSize: 11, paddingTop: 12, borderTop: '1px solid #374151' }}>
        {[
          { s: 'Completed',   bg: '#064e3b', t: '#6ee7b7', l: '✓' },
          { s: 'In Progress', bg: '#164e63', t: '#67e8f9', l: '▶' },
          { s: 'Not Started', bg: '#374151', t: '#9ca3af', l: '·' },
          { s: 'No Data',     bg: '#1f2937', t: '#6b7280', l: '–' },
        ].map(({ s, bg, t, l }) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 22, height: 20, borderRadius: 5, background: bg, border: '1px solid #374151', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: t }}>{l}</div>
            <span style={{ color: '#9ca3af' }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
