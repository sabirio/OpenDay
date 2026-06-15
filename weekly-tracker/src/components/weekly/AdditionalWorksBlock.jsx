export default function AdditionalWorksBlock({ entries, total }) {
  const hasEntries = entries?.length > 0;

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 20, borderTop: hasEntries ? '3px solid #f97316' : undefined }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: hasEntries ? '#f97316' : '#f9fafb' }}>
        Additional Works
        {total && <span style={{ marginLeft: 10, fontSize: 14, color: '#fdba74' }}>{total} total</span>}
      </div>
      {!hasEntries ? (
        <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✓ No additional works</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8, marginBottom: 12 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ background: 'rgba(124,45,18,0.3)', border: '1px solid #92400e', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: e.description ? 5 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>
                    Report #{e.num} · {e.date}{e.party ? ` · ${e.party}` : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fdba74', whiteSpace: 'nowrap' }}>{e.cost}</span>
                </div>
                {e.description && <div style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.5 }}>{e.description}</div>}
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 10, borderTop: '1px solid #92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Total Additional Works Cost</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#fdba74' }}>{total}</span>
          </div>
        </>
      )}
    </div>
  );
}
