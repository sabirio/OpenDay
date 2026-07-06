/**
 * ProgressNarrative — B1 progress stat blocks + reasons list + Why % panel.
 *
 * Pure display. Reads progressComparison from calculateProgressComparison().
 * explainResult comes pre-computed from WeeklyReports (explainFromSnapshot or explainLive).
 * No calculations here — all numbers come from the engine.
 */
import { useState } from "react";

// ── Why this %? expandable attribution panel ──────────────────────────────────
function WhyPanel({ explainResult }) {
  const [open, setOpen] = useState(false);
  if (!explainResult) return null;

  const { total, officialTotal, drift, denominator, lines, byPhase, excluded } = explainResult;
  const source = officialTotal != null ? 'snapshot' : 'live';

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
        aria-expanded={open}
      >
        Why {Math.round(total)}%? <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Denominator note */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Based on <strong style={{ color: 'var(--text-secondary)' }}>{lines.length}</strong> active work package{lines.length !== 1 ? 's' : ''} · weights sum to {denominator.toFixed(2)}
            {' · '}<span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{source === 'snapshot' ? 'frozen weights' : 'live weights'}</span>
            {drift != null && Math.abs(drift) > 0.5 && (
              <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--status-alert)' }}>[drift {drift > 0 ? '+' : ''}{drift.toFixed(1)}pp]</span>
            )}
          </div>

          {/* BY PHASE */}
          {byPhase.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>
                By phase
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {byPhase.map(p => (
                  <div key={p.phaseId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{p.label}</span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(p.phaseProgress)}%
                        {' · '}
                        <strong style={{ color: 'var(--text-primary)' }}>{p.contribution.toFixed(1)}pp</strong>
                      </span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, p.phaseProgress)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOP WP CONTRIBUTORS */}
          {lines.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>
                Top contributors
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lines.slice(0, 8).map(l => (
                  <div key={l.wpId} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 9, flexShrink: 0 }}>●</span>
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{l.label}</span>
                    <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {Math.round(l.progress)}% · <strong style={{ color: 'var(--text-primary)' }}>{l.contribution.toFixed(1)}pp</strong>
                    </span>
                  </div>
                ))}
                {lines.length > 8 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 14, marginTop: 2 }}>
                    +{lines.length - 8} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOT IN SCOPE */}
          {excluded.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              <span style={{ fontWeight: 600 }}>Not in scope ({excluded.length}):</span>{' '}
              {excluded.map(e => e.label).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

export default function ProgressNarrative({ progressComparison, selectedProgress, explainResult }) {
  if (!progressComparison) return null;

  const { scheduleStatus, scheduleGap, deltaVsLastWeek, reasons = [] } = progressComparison;
  // selectedProgress: from progress_history for the selected week (null = no stored row → show —)
  // Falls back to progressComparison.actualPct only when selectedProgress is not explicitly provided.
  const displayPct = selectedProgress !== undefined ? selectedProgress : progressComparison.actualPct;

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
  // When there is no stored progress row for this week (displayPct === null),
  // VS PLAN must also show no-data — not compute from the live fallback value.
  let planNode;
  if (displayPct === null) {
    planNode = (
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>— no data for this week</span>
    );
  } else if (scheduleStatus === 'ahead') {
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
    <div className="dashboard-summary-card weekly-progress-narrative">
      <div className="weekly-section-kicker">Progress explanation</div>
      {/* Three stat blocks */}
      <div className="weekly-progress-stats" style={{ marginBottom: reasons.length > 0 ? 16 : 0 }}>
        <StatBlock label="Current">
          {displayPct !== null && displayPct !== undefined
            ? (
              <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                {displayPct}<span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)' }}>%</span>
              </span>
            ) : (
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-muted)' }}>—</span>
            )
          }
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

      {/* Why this %? attribution panel */}
      <WhyPanel explainResult={explainResult} />
    </div>
  );
}
