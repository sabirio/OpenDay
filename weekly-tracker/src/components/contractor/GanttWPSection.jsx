import { useState, useRef, useEffect } from "react";
import { useGanttStatusDefaultProgress, useGanttWPSectionModel } from "../../hooks/useGanttWPSectionModel";

const GANTT_STATUS_OPTS = [
  { value: 'not_started', label: 'Not Started', bg: 'var(--field-bg-subtle)', color: 'var(--field-text-secondary)', border: 'var(--field-border-strong)' },
  { value: 'in_progress', label: 'In Progress', bg: 'var(--field-warning-bg)', color: 'var(--field-warning-fg)', border: 'var(--field-warning-border)' },
  { value: 'completed',   label: 'Completed',   bg: 'var(--field-success-bg)', color: 'var(--field-success-fg)', border: 'var(--field-success-border)' },
  { value: 'delayed',     label: 'Delayed',     bg: 'var(--field-delayed-bg)', color: 'var(--field-delayed-fg)', border: 'var(--field-delayed-border)' },
  { value: 'blocked',     label: 'Blocked',     bg: 'var(--field-danger-bg)', color: 'var(--field-danger-fg)', border: 'var(--field-danger-border)' },
];

function GanttWPRow({ task, entry, onChange }) {
  const getDefaultProgressForGanttStatus = useGanttStatusDefaultProgress();
  const pct    = entry?.progress_pct ?? task.actual_progress ?? 0;
  const status = entry?.status       ?? task.status          ?? 'not_started';
  const pctColor = pct >= 100 ? 'var(--field-success-fg)' : pct >= 50 ? 'var(--field-accent-contractor)' : 'var(--field-text-secondary)';

  function setPct(val) {
    const autoStatus = val === 0 ? 'not_started' : val === 100 ? 'completed' : 'in_progress';
    onChange({ progress_pct: val, status: autoStatus });
  }
  function setStatus(val) {
    onChange({ progress_pct: getDefaultProgressForGanttStatus(val, pct), status: val });
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--field-bg-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--field-text-body)', fontWeight: 500 }}>{task.label}</span>
          {task.isCritical && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--field-danger-bg)', color: 'var(--field-danger-fg)', border: '1px solid var(--field-danger-border)' }}>CRITICAL</span>
          )}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: pctColor, minWidth: 44, textAlign: 'right' }}>{pct}%</span>
      </div>
      <input
        type="range" min="0" max="100" step="10"
        value={pct}
        onChange={e => setPct(parseInt(e.target.value))}
        style={{ width: '100%', cursor: 'pointer', accentColor: pctColor, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {GANTT_STATUS_OPTS.map(opt => {
          const sel = status === opt.value;
          return (
            <button key={opt.value} type="button"
              onClick={() => setStatus(opt.value)}
              style={{
                padding: '10px 14px', minHeight: 44, borderRadius: 8, fontSize: 13,
                border: `1px solid ${sel ? opt.border : 'var(--field-border)'}`,
                background: sel ? opt.bg : 'var(--field-bg-card)',
                color: sel ? opt.color : 'var(--field-text-muted)',
                fontWeight: sel ? 700 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {(task.earlyStart || task.earlyFinish) && (
        <div style={{ fontSize: 10, color: 'var(--field-text-muted)', marginTop: 6 }}>
          {task.earlyStart ? new Date(task.earlyStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
          {' → '}
          {task.earlyFinish ? new Date(task.earlyFinish).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
          {' · '}
          {task.duration_days}d
        </div>
      )}
    </div>
  );
}

// ── Collapsible phase wrapper ──────────────────────────────────────────────

export function PhaseSection({ phaseKey, tasks, ganttWpProgress, onUpdateProgress, projectId }) {
  const storageKey = `gantt_phases_${projectId}`;

  const [open, setOpen] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return stored[phaseKey] ?? false;
    } catch { return false; }
  });

  const { phasePct, allComplete } = useGanttWPSectionModel(tasks, ganttWpProgress);

  // Auto-close when the last task reaches 100% (skip on first mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (allComplete && open) toggle(false);
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(next = !open) {
    setOpen(next);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      stored[phaseKey] = next;
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch { /* ignore corrupt localStorage */ }
  }

  const pctColor = phasePct >= 100 ? 'var(--field-success-fg)' : phasePct >= 50 ? 'var(--field-accent-contractor)' : 'var(--field-text-secondary)';

  return (
    <div style={{ background: 'var(--field-bg-card)', border: '1px solid var(--field-border)', borderRadius: 14, marginBottom: 14, overflow: 'hidden', boxShadow: 'var(--field-shadow)' }}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-testid="gantt-phase-header"
        onClick={() => toggle()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        style={{
          padding: '12px 22px',
          borderLeft: '4px solid var(--field-accent-contractor)',
          borderBottom: open ? '1px solid var(--field-bg-subtle)' : 'none',
          background: 'var(--field-bg-faint)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, color: 'var(--field-text-secondary)', display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--field-text-heading)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {phaseKey}
          </h3>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pctColor }}>{phasePct}%</span>
      </div>

      {/* Tasks */}
      {open && (
        <div style={{ padding: '20px 22px' }}>
          {tasks.map(task => (
            <GanttWPRow
              key={task.id}
              task={task}
              entry={ganttWpProgress[task.id]}
              onChange={updates => onUpdateProgress(task.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
