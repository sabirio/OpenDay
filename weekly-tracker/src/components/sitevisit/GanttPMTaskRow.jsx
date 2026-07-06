import { computeWPObservationDiscrepancy } from '../../engines/discrepancyEngine';

const ACCENT = "var(--field-accent-sitevisit)";

const DISC_STYLE = {
  warning:  { bg: 'var(--field-warning-bg)', color: 'var(--field-warning-fg-dark)', border: 'var(--field-warning-border)', icon: '⚠' },
  critical: { bg: 'var(--field-danger-bg)', color: 'var(--field-danger-fg-dark)', border: 'var(--field-danger-border)', icon: '⚠' },
};

const GANTT_STATUS_OPTS_SV = [
  { value: 'not_started', label: 'Not Started', bg: 'var(--field-bg-subtle)', color: 'var(--field-text-secondary)', border: 'var(--field-border-strong)' },
  { value: 'in_progress', label: 'In Progress', bg: 'var(--field-warning-bg)', color: 'var(--field-warning-fg)', border: 'var(--field-warning-border)' },
  { value: 'completed',   label: 'Completed',   bg: 'var(--field-success-bg)', color: 'var(--field-success-fg)', border: 'var(--field-success-border)' },
  { value: 'delayed',     label: 'Delayed',     bg: 'var(--field-delayed-bg)', color: 'var(--field-delayed-fg)', border: 'var(--field-delayed-border)' },
  { value: 'blocked',     label: 'Blocked',     bg: 'var(--field-danger-bg)', color: 'var(--field-danger-fg)', border: 'var(--field-danger-border)' },
];

function GanttPMTaskRow({ task, pmEntry, onChange }) {
  const gcStatus = task.status || 'not_started';
  const gcProgress = task.actual_progress ?? 0;
  const pmStatus = pmEntry?.observed_status ?? gcStatus;
  const curProgress = pmEntry?.observed_progress ?? gcProgress;

  // Live mismatch/"suspicious jump" indicator (P2.2) — reuses the exact
  // function siteVisitService.submitSiteVisit() persists the real
  // discrepancy with, so what the PM sees while entering data matches what
  // gets saved. Only surfaces once the PM's entry actually diverges from the
  // untouched default (observed === GC's own claim shouldn't self-flag).
  const touched = pmEntry != null;
  const { discStatus } = touched
    ? computeWPObservationDiscrepancy({ gc_progress: gcProgress, gc_status: gcStatus, observed_progress: curProgress, observed_status: pmStatus })
    : { discStatus: 'ok' };
  const discStyle = discStatus !== 'ok' ? DISC_STYLE[discStatus] : null;

  function handleStatusClick(statusValue) {
    const autoPct =
      statusValue === 'completed'  ? 100 :
      statusValue === 'not_started' ? 0  : curProgress;
    onChange({ ...(pmEntry || {}), observed_progress: autoPct, observed_status: statusValue });
  }

  return (
    <div data-testid="pm-task-row" data-wp-id={task.id} style={{ borderBottom: '1px solid var(--field-bg-subtle)', padding: '9px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--field-text-body)', lineHeight: 1.35 }}>{task.label}</span>
          {task.isCritical && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--field-danger-bg)', color: 'var(--field-danger-fg)', border: '1px solid var(--field-danger-border)', flexShrink: 0 }}>CRITICAL</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {GANTT_STATUS_OPTS_SV.map(opt => {
            const isPM = pmStatus === opt.value;
            const isGC = gcStatus === opt.value && !isPM;
            return (
              <button key={opt.value} type="button"
                data-testid={`pm-status-btn-${opt.value}`}
                onClick={() => handleStatusClick(opt.value)}
                style={{
                  position: 'relative',
                  padding: '4px 9px', borderRadius: 6, fontSize: 11,
                  border: isPM ? `1.5px solid ${opt.border}` : isGC ? `1px solid ${opt.border}` : '1px solid var(--field-border)',
                  background: isPM ? opt.bg : isGC ? opt.bg + '80' : 'white',
                  color: isPM ? opt.color : isGC ? opt.color : 'var(--field-text-muted)',
                  fontWeight: isPM ? 700 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
                }}>
                {opt.label}
                {isGC && (
                  <span style={{
                    position: 'absolute', top: -6, right: -4,
                    fontSize: 8, fontWeight: 800, lineHeight: 1.2,
                    background: ACCENT, color: 'white',
                    padding: '1px 3px', borderRadius: 3,
                    letterSpacing: '0.02em', pointerEvents: 'none',
                  }}>GC</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {(pmStatus === 'in_progress' || pmStatus === 'delayed') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, paddingLeft: 4 }}>
          <input
            type="range" min="0" max="100" step="10"
            value={curProgress}
            onChange={e => onChange({ ...(pmEntry || {}), observed_progress: Number(e.target.value), observed_status: pmStatus })}
            style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 34, textAlign: 'right' }}>
            {curProgress}%
          </span>
        </div>
      )}
      {discStyle && (
        <div data-testid="pm-task-discrepancy" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          marginTop: 6, marginLeft: 4, padding: '3px 9px', borderRadius: 6,
          fontSize: 11, fontWeight: 700,
          background: discStyle.bg, color: discStyle.color, border: `1px solid ${discStyle.border}`,
        }}>
          {discStyle.icon} GC claimed {gcProgress}% ({gcStatus.replace('_', ' ')}) — {curProgress !== gcProgress ? `${Math.abs(curProgress - gcProgress)}pp gap` : 'status mismatch'}
        </div>
      )}
    </div>
  );
}

export default GanttPMTaskRow;
