export default function GanttLegend({ colors }) {
  const bars = [
    { label: 'Planned',       bg: 'var(--border)',          border: colors.border },
    { label: 'In Progress',   bg: colors.blue,              border: 'none' },
    { label: 'Complete',      bg: colors.green,             border: 'none' },
    // UI-consistency fix (2026-07-16): these three were the only hardcoded
    // rgba literals left in this file — every sibling swatch already uses a
    // token via `colors` (the C object GanttChart.jsx builds entirely from
    // var(--...) tokens). --status-alert-bg/--status-warn-bg are the same
    // faded-background tokens badges use app-wide.
    { label: 'Critical Path', bg: 'var(--status-alert-bg)', border: colors.redCrit },
    { label: 'Warning',       bg: 'var(--status-warn-bg)',  border: colors.yellow },
    { label: 'Critical Disc', bg: 'var(--status-alert-bg)', border: colors.red },
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
