import { Fragment } from 'react';
import { formatDate } from '../../utils/reportUtils';
import { getScoreTier, SCORE_TIER_COLORS } from '../../config/statusColors';

const SCHED_CHIP = {
  'On Track': { bg: 'var(--status-done-bg)',  color: 'var(--status-done)'  },
  'Delayed':  { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)' },
  'At Risk':  { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn)'  },
  'Critical': { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)' },
};
const SCHED_FALLBACK = { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' };

export default function SiteVisitComparison({ svData, svKpis, expandedVisitId, onExpandedChange }) {
  const cols = ['Item', 'GC Report', 'PM Observed', 'Δ', 'Result'];
  const matchRateColor = (rate) =>
    rate === null ? 'var(--text-muted)' : SCORE_TIER_COLORS[getScoreTier(rate)];

  return (
    <section className="weekly-comparison-section">
      <div className="weekly-section-header">
        <div>
          <div className="weekly-section-kicker">Contractor vs PM</div>
          <h2>Verification comparison</h2>
          <p>PM site observations compared with the contractor's weekly report for the selected project.</p>
        </div>
      </div>

      <div className="weekly-verification-ledger" aria-label="Verification summary">
        <div><span>PM visits</span><strong>{svKpis.totalVisits}</strong></div>
        <div><span>Match rate</span><strong style={{ color: matchRateColor(svKpis.overallMatchRate) }}>{svKpis.overallMatchRate !== null ? `${svKpis.overallMatchRate}%` : '—'}</strong></div>
        <div><span>Discrepancies</span><strong className={svKpis.totalDiscrepancies > 0 ? 'is-critical' : ''}>{svKpis.totalDiscrepancies}</strong></div>
        <div><span>PM ahead</span><strong className={svKpis.totalPmAhead > 0 ? 'is-warning' : ''}>{svKpis.totalPmAhead}</strong></div>
        <div><span>Matched items</span><strong>{svKpis.totalMatches} / {svKpis.totalAssessed}</strong></div>
      </div>

      {svData.length === 0 ? (
        <div className="dashboard-summary-card weekly-comparison-empty">
          <h3>No PM verification yet</h3>
          <p>No site visits are recorded for this project, so contractor progress is not independently verified here yet.</p>
        </div>
      ) : (
        <div className="weekly-comparison-list">
          <h3>Evidence reconciliation</h3>
          <p>PM observed statuses compared with contractor reports. Select a visit for discrepancy detail.</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {svData.map(({ visit, project, gcReport, items, discrepancies, pmAhead, matchRate }) => {
              const toggleId   = visit.id || visit.submittedAt;
              const isExpanded = expandedVisitId === toggleId;
              const mColor     = matchRateColor(matchRate);
              const visible    = items.filter(i => i.result?.type && i.result.type !== 'match');
              const phaseOrder = [...new Set(visible.map(i => i.phase))];
              const byPhase    = phaseOrder.map(ph => ({ phase: ph, items: visible.filter(i => i.phase === ph) })).filter(g => g.items.length > 0);
              return (
                <div key={toggleId} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {/* Summary row */}
                  <div
                    onClick={() => onExpandedChange(isExpanded ? null : toggleId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isExpanded ? 'var(--accent-subtle)' : 'transparent', transition: 'background 0.15s' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{project?.storeCode || 'Unknown'}</strong>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{project?.shoppingMallName}</span>
                        <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>·</span>
                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>Visit: {formatDate(visit.visitDate || visit.submittedAt)}</span>
                        {gcReport && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>GC ref: {formatDate(gcReport.reportingDate || gcReport.submittedAt)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {matchRate !== null && <span title="PM vs GC agreement" style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--bg-elevated)', color: mColor, border: '1px solid var(--border)' }}>{matchRate}% match</span>}
                      {discrepancies > 0 && <span title="GC overclaiming vs PM" style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: '1px solid var(--border)' }}>▲ {discrepancies} discrepancies</span>}
                      {pmAhead > 0 && <span title="PM sees more progress than GC" style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-warn-bg)', color: 'var(--status-warn)', border: '1px solid var(--border)' }}>↑ {pmAhead} PM ahead</span>}
                      <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 700 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '16px', borderTop: '1px solid var(--border)', background: 'var(--accent-subtle)' }}>
                      {visit.pmScheduleStatus && (
                        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>PM Assessment:</span>
                          {(() => {
                            const chip = SCHED_CHIP[visit.pmScheduleStatus] || SCHED_FALLBACK;
                            return (
                              <span style={{ padding: '2px 9px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: chip.bg, color: chip.color }}>
                                {visit.pmScheduleStatus}
                              </span>
                            );
                          })()}
                          {visit.observations && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{visit.observations}</span>}
                        </div>
                      )}
                      {visible.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          No mismatches — PM and GC agree on all assessed items.
                        </div>
                      ) : byPhase.map(({ phase, items: phItems }) => (
                        <div key={phase} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>{phase}</div>
                          <table className="ds-table ds-table--dense" style={{ borderRadius: 8, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: 'var(--overlay-dim)' }}>
                                {cols.map((h, ci) => (
                                  <th key={h} style={{ textAlign: ci === 3 ? 'right' : 'left', padding: '7px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {phItems.map((item, idx) => (
                                <Fragment key={idx}>
                                  <tr style={{ borderBottom: item.note ? 'none' : '1px solid var(--border)' }}>
                                    <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)' }}>{item.label}</td>
                                    <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>
                                      {item.gc || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                      {item.gcProgress != null && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{item.gcProgress}%</span>}
                                    </td>
                                    <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                                      {item.pm || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                      {item.pmProgress != null && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{item.pmProgress}%</span>}
                                    </td>
                                    <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: item.delta > 0 ? 'var(--status-warn)' : item.delta < 0 ? 'var(--status-alert)' : 'var(--text-muted)' }}>
                                      {item.delta != null && item.delta !== 0
                                        ? (item.delta > 0 ? `+${item.delta}` : `${item.delta}`)
                                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '7px 12px' }}>
                                      {item.result && (
                                        <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: item.result.bg, color: item.result.color, border: `1px solid ${item.result.border}` }}>
                                          {item.result.badge}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                  {item.note && (
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td colSpan={cols.length} style={{ padding: '4px 12px 8px 24px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        <span style={{ fontStyle: 'normal', fontWeight: 700, marginRight: 6 }}>PM note:</span>{item.note}
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
