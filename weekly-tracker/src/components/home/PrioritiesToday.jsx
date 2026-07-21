import { useState } from 'react';
import ConfidenceBadge from './ConfidenceBadge.jsx';

const SEV_STYLE = {
  critical: { label: 'Critical', color: 'var(--status-alert)',    bg: 'var(--status-alert-bg)'  },
  warning:  { label: 'Warning',  color: 'var(--status-warn)',     bg: 'var(--status-warn-bg)'   },
  info:     { label: 'Info',     color: 'var(--text-muted)',      bg: 'var(--bg-elevated)'       },
};

const TOP_N = 6;

function PriorityRow({ ins }) {
  const [open, setOpen] = useState(false);
  const sev = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
  const criticalBlockerTasks = ins.criticalBlockerTasks ?? [];
  const softBlockerTasks     = ins.softBlockerTasks ?? [];
  const hasBlockers = criticalBlockerTasks.length > 0 || softBlockerTasks.length > 0;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '12px 16px',
        background: 'var(--bg-elevated)',
        border: `1.5px solid ${sev.color}`,
        borderRadius: 10,
        cursor: hasBlockers ? 'pointer' : 'default',
      }}
      onClick={hasBlockers ? () => setOpen(o => !o) : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
        <ConfidenceBadge confidence={ins.confidence} />
        {hasBlockers && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>}
      </div>
      {ins.detail && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ins.detail}</div>
      )}
      {ins.recommendedAction && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          → {ins.recommendedAction}
        </div>
      )}
      {open && hasBlockers && (
        <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {criticalBlockerTasks.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--status-alert)' }}>⛔ {criticalBlockerTasks.join(', ')}</div>
          )}
          {softBlockerTasks.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--status-warn)' }}>⚠ {softBlockerTasks.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

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
        {visible.map(ins => <PriorityRow key={ins.id} ins={ins} />)}
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
