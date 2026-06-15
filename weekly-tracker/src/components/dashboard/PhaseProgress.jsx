/** @param {{ bars: Array<{wpId?: string, name?: string, label?: string, pct: number, color: string}> }} props */
export default function PhaseProgress({ bars }) {
  if (!bars || bars.length === 0) return null;
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 10 }}>Work Package Progress</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
        {bars.map(({ wpId, name, label, color: wpColor, pct }) => (
          <div key={wpId || label || name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{name || label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: pct > 0 ? wpColor : '#4b5563' }}>{pct}%</span>
            </div>
            <div style={{ background: '#374151', borderRadius: 3, height: 5, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: wpColor, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
