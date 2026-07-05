export default function GanttLegend({ colors }) {
  const bars = [
    { label: 'Planned',       bg: 'var(--border)',          border: colors.border },
    { label: 'In Progress',   bg: colors.blue,              border: 'none' },
    { label: 'Complete',      bg: colors.green,             border: 'none' },
    { label: 'Critical Path', bg: 'rgba(255,100,100,0.4)', border: colors.redCrit },
    { label: 'Warning',       bg: 'rgba(245,158,11,0.2)',  border: colors.yellow },
    { label: 'Critical Disc', bg: 'rgba(239,68,68,0.2)',   border: colors.red },
  ];
  const lines = [
    { label: 'Today',         color: colors.white60, dashed: true },
    { label: 'Target Open',   color: colors.green,   dashed: false },
    { label: 'Const. Done',   color: colors.blue,    dashed: false },
    { label: 'Forecast Open', color: colors.yellow,  dashed: true },
  ];

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
      padding: '8px 14px', borderTop: `1px solid ${colors.border}`,
      background: colors.bgEl, flexShrink: 0,
    }}>
      {bars.map(({ label, bg, border }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.muted }}>
          <div style={{
            width: 18, height: 9, borderRadius: 3, flexShrink: 0,
            background: bg, border: border !== 'none' ? `1.5px solid ${border}` : 'none',
          }} />
          <span>{label}</span>
        </div>
      ))}
      {lines.map(({ label, color, dashed }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.muted }}>
          <div style={{
            width: 18, height: 0, flexShrink: 0,
            borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
