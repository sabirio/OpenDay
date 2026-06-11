// Additional Works section — orange accent, only when there are entries.
export default function AdditionalWorksBlock({ entries, total }) {
  const hasEntries = entries?.length > 0;

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 20, borderTop: hasEntries ? '3px solid #f97316' : undefined }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: hasEntries ? '#ea580c' : '#111827' }}>
        Additional Works
        {total && <span style={{ marginLeft: 10, fontSize: 14, color: '#c2410c' }}>{total} total</span>}
      </div>
      {!hasEntries ? (
        <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>✓ No additional works</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8, marginBottom: 12 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: e.description ? 5 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af' }}>
                    Report #{e.num} · {e.date}{e.party ? ` · ${e.party}` : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>{e.cost}</span>
                </div>
                {e.description && <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{e.description}</div>}
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 10, borderTop: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Total Additional Works Cost</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#c2410c' }}>{total}</span>
          </div>
        </>
      )}
    </div>
  );
}
