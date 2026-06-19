/**
 * PhaseTimeline — vertical phase timeline replacing the horizontal PhaseStepper.
 * Pure display. Receives classified phases from classifyPhases() engine output.
 * Phases run top-to-bottom: Done → Current (expanded by default) → Upcoming.
 */
import { useState } from 'react';
import { getWPGroups, WP_STATUS_SCORES } from '../../config/workPackages';
import { statusColor, statusStyles } from './sharedUtils';

function DeltaIndicator({ d }) {
  if (!d) return null;
  if (d.isNew)     return <span style={{ fontSize: 10, color: 'var(--text-muted)',   flexShrink: 0 }}>● new</span>;
  if (d.delta > 0) return <span style={{ fontSize: 10, color: 'var(--status-done)', flexShrink: 0, fontWeight: 600 }}>▲ +{d.delta}pp</span>;
  if (d.delta < 0) return <span style={{ fontSize: 10, color: 'var(--status-warn)', flexShrink: 0, fontWeight: 600 }}>▼ {d.delta}pp</span>;
  return <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>—</span>;
}

function PhaseNode({ status }) {
  if (status === 'done') {
    return (
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--bg-surface)', lineHeight: 1 }}>✓</span>
      </div>
    );
  }
  if (status === 'current') {
    return (
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: 'var(--accent)',
        outline: '2px solid var(--accent)',
        outlineOffset: '3px',
        flexShrink: 0,
      }} />
    );
  }
  // upcoming
  return (
    <div style={{
      width: 12, height: 12, borderRadius: '50%',
      background: 'transparent',
      border: '2px dashed var(--text-muted)',
      flexShrink: 0,
    }} />
  );
}

export default function PhaseTimeline({ phases, mergedStatuses, wpDeltas, phaseChangeFlags }) {
  const currentPhase = phases.find(p => p.status === 'current');
  const [activeId, setActiveId] = useState(currentPhase?.id ?? null);

  return (
    <div style={{ marginBottom: 20 }}>
      {phases.map((phase, i) => {
        const { status, pct, delta } = phase;
        const isDone     = status === 'done';
        const isCurrent  = status === 'current';
        const isUpcoming = status === 'upcoming';
        const isLast     = i === phases.length - 1;
        const isActive   = phase.id === activeId;
        const hasChanges = phaseChangeFlags?.[phase.id];

        // Connector below this node inherits next phase's style.
        const nextIsUpcoming = phases[i + 1]?.status === 'upcoming';

        return (
          <div key={phase.id} style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>

            {/* ── Axis column ───────────────────────────────────────────── */}
            <div style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              {/* Vertical spacer above node — aligns node with the header row text */}
              <div style={{ height: 10, flexShrink: 0 }} />
              <PhaseNode status={status} />
              {/* Connector to next phase */}
              {!isLast && (
                <div style={{
                  flex: 1, width: 0, minHeight: 12,
                  marginTop: 3,
                  borderLeft: nextIsUpcoming
                    ? '2px dashed var(--text-muted)'
                    : '2px solid var(--accent)',
                }} />
              )}
            </div>

            {/* ── Phase content ─────────────────────────────────────────── */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 6, minWidth: 0 }}>

              {/* Header row */}
              <div
                onClick={() => setActiveId(isActive ? null : phase.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: isCurrent ? 'var(--accent-subtle)' : 'transparent',
                  opacity: isUpcoming ? 0.45 : 1,
                  userSelect: 'none',
                }}
              >
                <span style={{
                  fontSize: 13,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isDone ? 'var(--text-secondary)' : isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {phase.name}
                </span>

                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: isDone ? 'var(--text-muted)' : isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                  flexShrink: 0,
                }}>
                  {pct}%
                </span>

                {/* Per-phase delta badge */}
                {hasChanges && delta !== null && delta > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--status-done)', fontWeight: 700, flexShrink: 0 }}>
                    ▲+{delta}pp
                  </span>
                )}

                <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {isActive ? '▴' : '▾'}
                </span>
              </div>

              {/* Expanded WP detail */}
              {isActive && (
                <div style={{
                  marginTop: 4, marginLeft: 4, marginBottom: 8,
                  background: 'var(--bg-elevated)',
                  borderRadius: 10,
                  padding: '10px 14px',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                    {(phase.groups ?? getWPGroups(phase.id)).map(group => (
                      <div key={group.id ?? group.name}>
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          marginBottom: 4, paddingBottom: 2,
                          borderBottom: '1px solid var(--border)',
                        }}>
                          {group.name}
                        </div>
                        {group.tasks.map(taskName => {
                          const entry  = mergedStatuses?.[phase.id]?.[taskName] || {};
                          const status = entry.status || 'Not Started';
                          const tc     = statusColor(status);
                          const ts     = statusStyles(status);
                          const score  = WP_STATUS_SCORES[status] ?? 0;
                          const lbl    = score >= 1 ? '✓' : score >= 0.5 ? '▶' : score >= 0.3 ? '⚠' : '·';
                          const delta  = wpDeltas?.[phase.id]?.[taskName];
                          return (
                            <div key={taskName} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '3px 0',
                              borderBottom: '1px solid var(--border)',
                            }}>
                              <span style={{ fontSize: 12, color: tc, fontWeight: 700, width: 12, textAlign: 'center', flexShrink: 0 }}>{lbl}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, lineHeight: 1.3, minWidth: 0 }}>{taskName}</span>
                              {entry.progress > 0 && entry.progress < 100 && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{entry.progress}%</span>
                              )}
                              <DeltaIndicator d={wpDeltas ? delta : null} />
                              <span style={{
                                padding: '1px 6px', borderRadius: 6,
                                fontSize: 9, fontWeight: 600,
                                background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`,
                                flexShrink: 0,
                              }}>
                                {status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
