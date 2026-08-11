import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConfidenceBadge from './ConfidenceBadge.jsx';
import { displayAction, getAttentionInsights, getInsightDisplayTitle } from './homePresentation.js';

const SEV_STYLE = {
  critical: { label: 'Critical', color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' },
  warning: { label: 'Warning', color: 'var(--status-warn)', bg: 'var(--status-warn-bg)' },
  info: { label: 'Info', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
};

const TOP_N = 6;

function PriorityRow({ ins, projects, role }) {
  const [open, setOpen] = useState(false);
  const sev = SEV_STYLE[ins.severity] ?? SEV_STYLE.info;
  const criticalBlockerTasks = ins.criticalBlockerTasks ?? [];
  const softBlockerTasks = ins.softBlockerTasks ?? [];
  const hasBlockers = criticalBlockerTasks.length > 0 || softBlockerTasks.length > 0;
  const action = displayAction(role, ins.recommendedAction);
  const title = getInsightDisplayTitle(ins, projects);

  return (
    <div className={`home-priority-row severity-${ins.severity}`}>
      <div className="home-priority-heading">
        {ins.projectId ? (
          <Link to={`/?project=${ins.projectId}`} className="home-priority-link">
            <PriorityLabel sev={sev} />
            <span>{title}</span>
          </Link>
        ) : (
          <>
            <PriorityLabel sev={sev} />
            <span className="home-priority-title">{title}</span>
          </>
        )}
        <ConfidenceBadge confidence={ins.confidence} />
        {hasBlockers && (
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-label={open ? 'Hide blockers' : 'Show blockers'}
            className="home-priority-toggle"
          >
            {open ? '▲' : '▼'}
          </button>
        )}
      </div>
      {ins.detail && <div className="home-priority-detail">{ins.detail}</div>}
      {action && <div className="home-priority-action">→ {action}</div>}
      {open && hasBlockers && (
        <div className="home-priority-blockers">
          {criticalBlockerTasks.length > 0 && (
            <div className="home-blocker-critical">Critical: {criticalBlockerTasks.join(', ')}</div>
          )}
          {softBlockerTasks.length > 0 && (
            <div className="home-blocker-warning">Warning: {softBlockerTasks.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

function PriorityLabel({ sev }) {
  return (
    <span className="home-priority-label" style={{ color: sev.color, background: sev.bg }}>
      {sev.label}
    </span>
  );
}

function PrioritiesToday({ insights, projects, role }) {
  const visible = getAttentionInsights(insights).slice(1, TOP_N);
  if (visible.length === 0) return null;

  return (
    <div className="home-priority-list">
      {visible.map(ins => <PriorityRow key={ins.id} ins={ins} projects={projects} role={role} />)}
    </div>
  );
}

export default PrioritiesToday;
