export default function AdditionalWorksBlock({ entries, total }) {
  const hasEntries = entries?.length > 0;

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 20, borderTop: hasEntries ? '3px solid var(--status-warn)' : undefined }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: hasEntries ? 'var(--status-warn)' : 'var(--text-primary)' }}>
        Additional Works
        {total && <span style={{ marginLeft: 10, fontSize: 14, color: 'var(--status-warn)' }}>{total} total</span>}
      </div>
      {!hasEntries ? (
        <div style={{ fontSize: 13, color: 'var(--status-done)', fontWeight: 600 }}>✓ No additional works</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8, marginBottom: 12 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ background: 'var(--status-warn-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: e.description ? 5 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    Report #{e.num} · {e.date}{e.party ? ` · ${e.party}` : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-warn)', whiteSpace: 'nowrap' }}>{e.cost}</span>
                </div>
                {e.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{e.description}</div>}
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Total Additional Works Cost</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--status-warn)' }}>{total}</span>
          </div>
        </>
      )}
    </div>
  );
}
