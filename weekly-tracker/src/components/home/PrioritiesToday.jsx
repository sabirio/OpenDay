const SEV_STYLE = {
  critical: { label: 'Critical', color: 'var(--status-alert)',    bg: 'var(--status-alert-bg)'  },
  warning:  { label: 'Warning',  color: 'var(--status-warn)',     bg: 'var(--status-warn-bg)'   },
  info:     { label: 'Info',     color: 'var(--text-muted)',      bg: 'var(--bg-elevated)'       },
};

const TOP_N = 6;

function PrioritiesToday({ insights }) {
  const visible = insights
    .filter(ins => ins.severity === 'critical' || ins.severity === 'warning')
    .slice(0, TOP_N);

  if (visible.length === 0) {
    return (
      <div style={{ marginBottom: 24 }}>
        <SectionHeader>Priorities Today</SectionHeader>
        <div style={{ padding: '20px 18px', background: 'var(--bg-elevated)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          No critical or warning issues — well done.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionHeader>Priorities Today</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(ins => {
          const sev = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
          return (
            <div key={ins.id} style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '12px 16px',
              background: 'var(--bg-elevated)',
              border: '1.5px solid var(--border)',
              borderLeft: `4px solid ${sev.color}`,
              borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
                  color: sev.color, background: sev.bg,
                  padding: '2px 7px', borderRadius: 4,
                }}>
                  {sev.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {ins.title}
                </span>
              </div>
              {ins.detail && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ins.detail}</div>
              )}
              {ins.recommendedAction && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  → {ins.recommendedAction}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default PrioritiesToday;
