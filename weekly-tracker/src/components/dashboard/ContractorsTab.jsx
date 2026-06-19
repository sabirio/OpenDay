export default function ContractorsTab({ contractorPerf }) {
  return (
    <div className="dashboard-summary-card">
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Contractor Performance</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Grouped by general contractor · sorted by risk indicators</div>
      {contractorPerf.length === 0
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '48px 0' }}>No contractor data.</div>
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
                    <tr key={c.name} style={{ background: hasIssue ? 'var(--status-warn-bg)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.projects.join(', ')}</div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.n}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 48, background: 'var(--border)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${c.avgProg}%`, height: '100%', background: c.avgProg >= 75 ? 'var(--status-done)' : c.avgProg >= 40 ? 'var(--accent)' : 'var(--status-warn)', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{c.avgProg}%</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.atRisk > 0 ? 'var(--status-warn)' : 'var(--status-done)' }}>{c.atRisk}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.blockers > 0 ? 'var(--status-alert)' : 'var(--status-done)' }}>{c.blockers}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.support > 0 ? 'var(--status-warn)' : 'var(--status-done)' }}>{c.support}/{c.n}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: c.missing > 0 ? 'var(--status-alert)' : 'var(--status-done)' }}>{c.missing}/{c.n}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-primary)' }}>{c.reportCount}</td>
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
