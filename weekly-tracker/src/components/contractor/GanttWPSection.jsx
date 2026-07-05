import { useState, useRef, useEffect } from "react";

const GANTT_STATUS_OPTS = [
  { value: 'not_started', label: 'Not Started', bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' },
  { value: 'in_progress', label: 'In Progress', bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  { value: 'completed',   label: 'Completed',   bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  { value: 'delayed',     label: 'Delayed',     bg: '#fce7f3', color: '#be185d', border: '#f9a8d4' },
  { value: 'blocked',     label: 'Blocked',     bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
];

function GanttWPRow({ task, entry, onChange }) {
  const pct    = entry?.progress_pct ?? task.actual_progress ?? 0;
  const status = entry?.status       ?? task.status          ?? 'not_started';
  const pctColor = pct >= 100 ? '#16a34a' : pct >= 50 ? '#2f855a' : '#6b7280';

  function setPct(val) {
    const autoStatus = val === 0 ? 'not_started' : val === 100 ? 'completed' : 'in_progress';
    onChange({ progress_pct: val, status: autoStatus });
  }
  function setStatus(val) {
    const autoPct = val === 'completed' ? 100 : val === 'not_started' ? 0 : pct;
    onChange({ progress_pct: autoPct, status: val });
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{task.label}</span>
          {task.isCritical && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>CRITICAL</span>
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
                border: `1px solid ${sel ? opt.border : '#e5e7eb'}`,
                background: sel ? opt.bg : 'white',
                color: sel ? opt.color : '#9ca3af',
                fontWeight: sel ? 700 : 500,
                cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {(task.earlyStart || task.earlyFinish) && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
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

  const phasePct = tasks.length === 0 ? 0 : Math.round(
    tasks.reduce((sum, t) => {
      const e = ganttWpProgress[t.id];
      return sum + (e?.progress_pct ?? t.actual_progress ?? 0);
    }, 0) / tasks.length
  );
  const allComplete = phasePct === 100;

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

  const pctColor = phasePct >= 100 ? '#16a34a' : phasePct >= 50 ? '#2f855a' : '#6b7280';

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Header */}
      <div
        onClick={() => toggle()}
        style={{
          padding: '12px 22px',
          borderLeft: '4px solid #2f855a',
          borderBottom: open ? '1px solid #f3f4f6' : 'none',
          background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, color: '#6b7280', display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
