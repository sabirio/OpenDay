import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import { getPortfolioState, displayAction } from './homePresentation.js';

const SEV_STYLE = {
  critical: { label: 'Critical', color: 'var(--status-alert)',    bg: 'var(--status-alert-bg)'  },
  warning:  { label: 'Warning',  color: 'var(--status-warn)',     bg: 'var(--status-warn-bg)'   },
  info:     { label: 'Info',     color: 'var(--text-muted)',      bg: 'var(--bg-elevated)'       },
};

const TOP_N = 6;

// The title/severity area is a real <Link> (keyboard/focus/right-click all
// work natively) so it opens this insight's project on the existing
// Dashboard route. The blocker-expand chevron is a sibling <button>, not
// nested inside the Link — nesting a button inside an anchor is invalid
// HTML and would make click targets ambiguous.
function PriorityRow({ ins, role }) {
  const [open, setOpen] = useState(false);
  const sev = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
  const criticalBlockerTasks = ins.criticalBlockerTasks ?? [];
  const softBlockerTasks     = ins.softBlockerTasks ?? [];
  const hasBlockers = criticalBlockerTasks.length > 0 || softBlockerTasks.length > 0;
  const action = displayAction(role, ins.recommendedAction);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '12px 16px',
        background: 'var(--bg-elevated)',
        border: `1.5px solid ${sev.color}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Link wraps only static text (severity pill + title) — ConfidenceBadge
            and the blocker-expand button below each render their own <button>,
            so they must stay siblings of the Link, never nested inside it. */}
        {ins.projectId ? (
          <Link
            to={`/?project=${ins.projectId}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <PriorityLabel sev={sev} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {ins.title}
            </span>
          </Link>
        ) : (
          <>
            <PriorityLabel sev={sev} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {ins.title}
            </span>
          </>
        )}
        <ConfidenceBadge confidence={ins.confidence} />
        {hasBlockers && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? 'Hide blockers' : 'Show blockers'}
            style={{
              fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto',
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            }}
          >
            {open ? '▲' : '▼'}
          </button>
        )}
      </div>
      {ins.detail && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ins.detail}</div>
      )}
      {action && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          → {action}
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

function PriorityLabel({ sev }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
      color: sev.color, background: sev.bg,
      padding: '2px 7px', borderRadius: 4, flexShrink: 0,
    }}>
      {sev.label}
    </span>
  );
}

function PrioritiesToday({ insights, role, projectCount }) {
  const visible = insights
    .filter(ins => ins.severity === 'critical' || ins.severity === 'warning')
    .slice(0, TOP_N);

  if (visible.length === 0) {
    const portfolioState = getPortfolioState(projectCount, insights.length);
    const emptyMessage = portfolioState === 'empty'
      ? 'No projects yet — add a project to start tracking priorities.'
      : 'No critical or warning issues — well done.';

    return (
      <div style={{ marginBottom: 24 }}>
        <SectionHeader>Priorities Today</SectionHeader>
        <div style={{ padding: '20px 18px', background: 'var(--bg-elevated)', border: '1.5px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <SectionHeader>Priorities Today</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(ins => <PriorityRow key={ins.id} ins={ins} role={role} />)}
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
