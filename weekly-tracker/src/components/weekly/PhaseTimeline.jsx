/**
 * PhaseTimeline — horizontal stepper of project phases.
 * Pure display. Receives classified phases from classifyPhases() engine output.
 * Clicking a phase cell opens its WP detail in a full-width panel below.
 */
import { useState, Fragment } from 'react';
import { getWPStatusTier } from '../../engines/progressEngine';
import { statusColor, statusStyles } from './sharedUtils';

const TIER_GLYPH = { done: '✓', good: '▶', warn: '⚠', muted: '·' };

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
  if (status === 'out_of_scope') {
    return (
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: 'transparent',
        border: '1.5px solid var(--border)',
        flexShrink: 0,
      }} />
    );
  }
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
  const [activeId, setActiveId] = useState(null);

  const activePhase = phases.find(p => p.id === activeId);

  return (
    <div style={{ marginBottom: 20 }}>

      {/* ── Horizontal stepper row ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 12, alignItems: 'flex-start' }}>
        {phases.map((phase, i) => {
          const { status, pct, delta } = phase;
          const isLast         = i === phases.length - 1;
          const isActive       = phase.id === activeId;
          const isUpcoming     = status === 'upcoming';
          const isCurrent      = status === 'current';
          const isOutOfScope   = status === 'out_of_scope';
          const hasChanges     = phaseChangeFlags?.[phase.id];
          const nextStatus     = phases[i + 1]?.status;
          const nextIsNonActive = nextStatus === 'upcoming' || nextStatus === 'out_of_scope';

          return (
            <Fragment key={phase.id}>
              {/* Phase cell — column: [node] [name] [pct/label] [delta] [chevron] */}
              <div
                onClick={isOutOfScope ? undefined : () => setActiveId(isActive ? null : phase.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: '1 1 70px',
                  maxWidth: 110,
                  cursor: isOutOfScope ? 'default' : 'pointer',
                  opacity: isOutOfScope ? 0.35 : isUpcoming ? 0.45 : 1,
                  userSelect: 'none',
                  padding: '4px 4px 6px',
                  borderRadius: 8,
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  outline: isActive ? '1.5px solid var(--accent)' : 'none',
                }}
              >
                {/* Fixed-height node container so connector always aligns to center */}
                <div style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PhaseNode status={status} />
                </div>

                <span style={{
                  fontSize: 12,
                  textAlign: 'center',
                  color: isOutOfScope ? 'var(--text-muted)' : isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isCurrent ? 700 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  lineHeight: 1.25,
                  maxWidth: 90,
                  marginTop: 4,
                }}>
                  {phase.name}
                </span>

                <span style={{
                  fontSize: isOutOfScope ? 10 : 12,
                  fontWeight: 600,
                  fontStyle: isOutOfScope ? 'italic' : 'normal',
                  color: 'var(--text-muted)',
                  marginTop: 2,
                }}>
                  {isOutOfScope ? 'Not in scope' : `${pct}%`}
                </span>

                {!isOutOfScope && phase.weight != null && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    вес {phase.weight}%
                  </span>
                )}

                {!isOutOfScope && hasChanges && delta !== null && delta > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--status-done)', fontWeight: 700 }}>
                    ▲+{delta}pp
                  </span>
                )}

                {isActive && (
                  <span style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>▾</span>
                )}
              </div>

              {/* Horizontal connector to next phase.
                  marginTop: 4px cell padding + 12px (half of 24px node area) − 1px (half border) = 15px */}
              {!isLast && (
                <div style={{
                  flex: '0 0 16px',
                  alignSelf: 'flex-start',
                  marginTop: 15,
                  borderTop: (isOutOfScope || nextIsNonActive)
                    ? '2px dashed var(--border)'
                    : '2px solid var(--accent)',
                }} />
              )}
            </Fragment>
          );
        })}
      </div>

      {/* ── Expanded WP detail panel (full-width, below entire stepper) ─ */}
      {activePhase && (
        <div style={{
          marginTop: 12,
          background: 'var(--bg-elevated)',
          borderRadius: 10,
          padding: '12px 16px',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 10, paddingBottom: 8,
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: activePhase.status === 'current' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}>
              {activePhase.name}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              {activePhase.pct}%
            </span>
            {activePhase.weight != null && (
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                · вес {activePhase.weight}%
              </span>
            )}
          </div>

          {/* WP groups grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {activePhase.groups.map(group => (
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
                  const entry    = mergedStatuses?.[activePhase.id]?.[taskName] || {};
                  const wpStatus = entry.status || 'Not Started';
                  const tc       = statusColor(wpStatus);
                  const ts       = statusStyles(wpStatus);
                  const lbl      = TIER_GLYPH[getWPStatusTier(wpStatus)];
                  const wpDelta  = wpDeltas?.[activePhase.id]?.[taskName];
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
                      <DeltaIndicator d={wpDeltas ? wpDelta : null} />
                      <span style={{
                        padding: '1px 6px', borderRadius: 6,
                        fontSize: 9, fontWeight: 600,
                        background: ts.bg, color: ts.color, border: `1px solid ${ts.border}`,
                        flexShrink: 0,
                      }}>
                        {wpStatus}
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
  );
}
