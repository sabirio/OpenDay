import { formatDate } from '../../utils/reportUtils';
import { KpiCard } from './DashboardWidgets';

const SCHED_CHIP = {
  'On Track': { bg: 'var(--status-done-bg)',  color: 'var(--status-done)'  },
  'Delayed':  { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)' },
  'At Risk':  { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn)'  },
  'Critical': { bg: 'var(--status-alert-bg)', color: 'var(--status-alert)' },
};
const SCHED_FALLBACK = { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' };

export default function SiteVisitsTab({ svData, svFiltered, svKpis, svStoreFilter, onFilterChange, expandedVisitId, onExpandedChange, svStoreOptions }) {
  const matchRateColor = (rate) => rate === null ? 'var(--text-muted)' : rate >= 80 ? 'var(--status-done)' : rate >= 60 ? 'var(--status-warn)' : 'var(--status-alert)';

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Filter bar */}
      {svData.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={svStoreFilter}
            onChange={e => { onFilterChange(e.target.value); onExpandedChange(null); }}
            style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-input)', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All stores</option>
            {svStoreOptions.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          {svStoreFilter !== 'all' && (
            <button type="button" onClick={() => onFilterChange('all')}
              style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--status-alert-bg)', color: 'var(--status-alert)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Clear ×
            </button>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{svFiltered.length} / {svData.length} visits</div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiCard label="Total Visits"    value={svKpis.totalVisits} color="var(--accent)" />
        <KpiCard label="Match Rate"      value={svKpis.overallMatchRate !== null ? `${svKpis.overallMatchRate}%` : '—'} color={matchRateColor(svKpis.overallMatchRate)} sub="PM vs GC agreement" />
        <KpiCard label="Discrepancies"   value={svKpis.totalDiscrepancies} color={svKpis.totalDiscrepancies > 0 ? 'var(--status-alert)' : 'var(--status-done)'} sub="GC overclaiming" />
        <KpiCard label="PM Ahead"        value={svKpis.totalPmAhead}       color={svKpis.totalPmAhead > 0 ? 'var(--status-warn)' : 'var(--status-done)'} sub="PM sees more progress" />
        <KpiCard label="Matched Items"   value={svKpis.totalMatches}       color="var(--status-done)" sub={`of ${svKpis.totalAssessed} assessed`} />
      </div>

      {svData.length === 0 ? (
        <div className="dashboard-summary-card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)', fontSize: 14 }}>
          No site visits recorded yet.<br />
          <span style={{ fontSize: 12 }}>Open a project from the Projects page and click "Site Visit" to start an assessment.</span>
        </div>
      ) : (
        <div className="dashboard-summary-card">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Site Visit Comparison</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>PM observed statuses vs GC weekly reports · click row to expand detail</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {svFiltered.map(({ visit, project, gcReport, items, matches, discrepancies, pmAhead, matchRate }) => {
              const toggleId    = visit.id || visit.submittedAt;
              const isExpanded  = expandedVisitId === toggleId;
              const mColor      = matchRateColor(matchRate);
              const phaseOrder  = [...new Set(items.map(i => i.phase))];
              const byPhase     = phaseOrder.map(ph => ({ phase: ph, items: items.filter(i => i.phase === ph) })).filter(g => g.items.length > 0);
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
                      {matchRate !== null && <span style={{ fontSize: 13, fontWeight: 800, color: mColor }}>{matchRate}%</span>}
                      {discrepancies > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: '1px solid var(--border)' }}>⚠ {discrepancies}</span>}
                      {pmAhead > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-warn-bg)', color: 'var(--status-warn)', border: '1px solid var(--border)' }}>↑ {pmAhead}</span>}
                      {matches > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: 'var(--status-done-bg)', color: 'var(--status-done)', border: '1px solid var(--border)' }}>✓ {matches}</span>}
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
                      {byPhase.map(({ phase, items: phItems }) => (
                        <div key={phase} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>{phase}</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                                {['Item', 'GC Report', 'PM Observed', 'Result'].map(h => (
                                  <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {phItems.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)' }}>{item.label}</td>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>{item.gc || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{item.pm || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                  <td style={{ padding: '7px 12px' }}>
                                    {item.result && (
                                      <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: item.result.bg, color: item.result.color, border: `1px solid ${item.result.border}` }}>
                                        {item.result.badge}
                                      </span>
                                    )}
                                  </td>
                                </tr>
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
    </div>
  );
}
