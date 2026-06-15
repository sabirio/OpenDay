const T = {
  textPri:   '#f9fafb',
  textBody:  '#e5e7eb',
  textSec:   '#9ca3af',
  border:    '#374151',
};

export default function ContractorsTab({ contractorPerf }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight: 700, fontSize: 15, color: T.textPri, marginBottom: 4 }}>Contractor Performance</div>
      <div style={{ fontSize: 12, color: T.textSec, marginBottom: 16 }}>Grouped by general contractor · sorted by risk indicators</div>
      {contractorPerf.length === 0
        ? <div style={{ textAlign: 'center', color: T.textSec, padding: '48px 0' }}>No contractor data.</div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dashboard-table" style={{ minWidth: 760 }}>
              <thead>
                <tr><th>Contractor</th><th>Projects</th><th>Avg Progress</th><th>At Risk</th><th>Blockers</th><th>Support</th><th>Missing Reports</th><th>Total Reports</th></tr>
              </thead>
              <tbody>
                {contractorPerf.map(c => {
                  const hasIssue = c.atRisk > 0 || c.blockers > 0;
                  return (
                    <tr key={c.name} style={{ background: hasIssue ? 'rgba(249,115,22,0.06)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 700, color: T.textPri }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: T.textSec }}>{c.projects.join(', ')}</div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: T.textBody }}>{c.n}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 48, background: T.border, borderRadius: 3, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${c.avgProg}%`, height: '100%', background: c.avgProg >= 75 ? '#10b981' : c.avgProg >= 40 ? '#22d3ee' : '#f97316', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.textBody }}>{c.avgProg}%</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.atRisk > 0 ? '#f97316' : '#10b981' }}>{c.atRisk}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.blockers > 0 ? '#ef4444' : '#10b981' }}>{c.blockers}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.support > 0 ? '#f97316' : '#10b981' }}>{c.support}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.missing > 0 ? '#ef4444' : '#10b981' }}>{c.missing}/{c.n}</td>
                      <td style={{ fontSize: 13, color: T.textBody }}>{c.reportCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
