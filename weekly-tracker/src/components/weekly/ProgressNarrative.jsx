/**
 * ProgressNarrative — B1 progress stat blocks + reasons list.
 *
 * Pure display. Reads progressComparison from calculateProgressComparison().
 * No calculations here — all numbers come from the engine.
 */

const REASON_COLOR = {
  positive: 'var(--status-done)',
  neutral:  'var(--text-muted)',
  warning:  'var(--status-warn)',
  critical: 'var(--status-alert)',
};

const REASON_BULLET = {
  positive: '✔',
  neutral:  '●',
  warning:  '⚠',
  critical: '✖',
};

function StatBlock({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export default function ProgressNarrative({ progressComparison }) {
  if (!progressComparison) return null;

  const { actualPct, scheduleStatus, scheduleGap, deltaVsLastWeek, reasons = [] } = progressComparison;

  // ── Delta block ────────────────────────────────────────────────────────────
  let deltaNode;
  if (deltaVsLastWeek === null || deltaVsLastWeek === undefined) {
    deltaNode = (
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>— no previous data</span>
    );
  } else if (deltaVsLastWeek > 0) {
    deltaNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-done)', lineHeight: 1 }}>▲ +{deltaVsLastWeek}pp</span>
    );
  } else if (deltaVsLastWeek < 0) {
    deltaNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-alert)', lineHeight: 1 }}>▼ {deltaVsLastWeek}pp</span>
    );
  } else {
    deltaNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>━ no change</span>
    );
  }

  // ── Vs Plan block ──────────────────────────────────────────────────────────
  let planNode;
  if (scheduleStatus === 'ahead') {
    planNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-done)', lineHeight: 1 }}>
        Ahead {Math.abs(scheduleGap)}pp
      </span>
    );
  } else if (scheduleStatus === 'behind') {
    planNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-alert)', lineHeight: 1 }}>
        Behind {Math.abs(scheduleGap)}pp
      </span>
    );
  } else if (scheduleStatus === 'on_track') {
    planNode = (
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>On track</span>
    );
  } else {
    planNode = (
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>— no baseline</span>
    );
  }

  return (
    <div className="dashboard-summary-card" style={{ marginBottom: 16 }}>
      {/* Three stat blocks */}
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: reasons.length > 0 ? 16 : 0 }}>
        <StatBlock label="Current">
          <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
            {actualPct}<span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>%</span>
          </span>
        </StatBlock>

        <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0 }} />

        <StatBlock label="This Week">
          {deltaNode}
        </StatBlock>

        <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0 }} />

        <StatBlock label="Vs Plan">
          {planNode}
        </StatBlock>
      </div>

      {/* Reasons list */}
      {reasons.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: REASON_COLOR[r.type] ?? 'var(--text-muted)', flexShrink: 0, lineHeight: 1.4 }}>
                {REASON_BULLET[r.type] ?? '●'}
              </span>
              <span style={{ fontSize: 12, color: REASON_COLOR[r.type] ?? 'var(--text-muted)', lineHeight: 1.5 }}>
                {r.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
