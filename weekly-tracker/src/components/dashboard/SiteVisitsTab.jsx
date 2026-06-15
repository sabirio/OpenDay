import { formatDate } from '../../utils/reportUtils';
import { KpiCard } from './DashboardWidgets';

const T = {
  surface:   'rgba(255,255,255,0.04)',
  border:    '#374151',
  textPri:   '#f9fafb',
  textBody:  '#e5e7eb',
  textSec:   '#9ca3af',
  textMuted: '#6b7280',
};

export default function SiteVisitsTab({ svData, svFiltered, svKpis, svStoreFilter, onFilterChange, expandedVisitId, onExpandedChange, svStoreOptions }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Filter bar */}
      {svData.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={svStoreFilter}
            onChange={e => { onFilterChange(e.target.value); onExpandedChange(null); }}
            style={{ height: 36, padding: '0 12px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 13, color: T.textBody, background: '#1f2937', cursor: 'pointer', outline: 'none' }}>
            <option value="all">All stores</option>
            {svStoreOptions.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          {svStoreFilter !== 'all' && (
            <button type="button" onClick={() => onFilterChange('all')}
              style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid #991b1b', background: '#7f1d1d', color: '#fca5a5', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Clear ×
            </button>
          )}
          <div style={{ marginLeft: 'auto', fontSize: 12, color: T.textSec }}>{svFiltered.length} / {svData.length} visits</div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KpiCard label="Total Visits"    value={svKpis.totalVisits} color="#22d3ee" />
        <KpiCard label="Match Rate"      value={svKpis.overallMatchRate !== null ? `${svKpis.overallMatchRate}%` : '—'} color={svKpis.overallMatchRate === null ? '#4b5563' : svKpis.overallMatchRate >= 80 ? '#10b981' : svKpis.overallMatchRate >= 60 ? '#f97316' : '#ef4444'} sub="PM vs GC agreement" />
        <KpiCard label="Discrepancies"   value={svKpis.totalDiscrepancies} color={svKpis.totalDiscrepancies > 0 ? '#ef4444' : '#10b981'} sub="GC overclaiming" />
        <KpiCard label="PM Ahead"        value={svKpis.totalPmAhead}       color={svKpis.totalPmAhead > 0 ? '#f97316' : '#10b981'} sub="PM sees more progress" />
        <KpiCard label="Matched Items"   value={svKpis.totalMatches}       color="#10b981" sub={`of ${svKpis.totalAssessed} assessed`} />
      </div>

      {svData.length === 0 ? (
        <div className="dashboard-summary-card" style={{ textAlign: 'center', padding: '48px 24px', color: T.textSec, fontSize: 14 }}>
          No site visits recorded yet.<br />
          <span style={{ fontSize: 12 }}>Open a project from the Projects page and click "Site Visit" to start an assessment.</span>
        </div>
      ) : (
        <div className="dashboard-summary-card">
          <div style={{ fontWeight: 700, fontSize: 15, color: T.textPri, marginBottom: 4 }}>Site Visit Comparison</div>
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 16 }}>PM observed statuses vs GC weekly reports · click row to expand detail</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {svFiltered.map(({ visit, project, gcReport, items, matches, discrepancies, pmAhead, matchRate }) => {
              const toggleId    = visit.id || visit.submittedAt;
              const isExpanded  = expandedVisitId === toggleId;
              const matchColor  = matchRate === null ? '#4b5563' : matchRate >= 80 ? '#10b981' : matchRate >= 60 ? '#f97316' : '#ef4444';
              const phaseOrder  = [...new Set(items.map(i => i.phase))];
              const byPhase     = phaseOrder.map(ph => ({ phase: ph, items: items.filter(i => i.phase === ph) })).filter(g => g.items.length > 0);
              return (
                <div key={toggleId} style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* Summary row */}
                  <div
                    onClick={() => onExpandedChange(isExpanded ? null : toggleId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: isExpanded ? 'rgba(16,185,129,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13, color: T.textPri }}>{project?.storeCode || 'Unknown'}</strong>
                        <span style={{ fontSize: 11, color: T.textSec }}>{project?.shoppingMallName}</span>
                        <span style={{ fontSize: 11, color: T.border }}>·</span>
                        <span style={{ fontSize: 12, color: T.textBody, fontWeight: 600 }}>Visit: {formatDate(visit.visitDate || visit.submittedAt)}</span>
                        {gcReport && <span style={{ fontSize: 11, color: T.textMuted }}>GC ref: {formatDate(gcReport.reportingDate || gcReport.submittedAt)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {matchRate !== null && <span style={{ fontSize: 13, fontWeight: 800, color: matchColor }}>{matchRate}%</span>}
                      {discrepancies > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>⚠ {discrepancies}</span>}
                      {pmAhead > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#7c2d12', color: '#fdba74', border: '1px solid #92400e' }}>↑ {pmAhead}</span>}
                      {matches > 0 && <span style={{ padding: '2px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700, background: '#064e3b', color: '#6ee7b7', border: '1px solid #065f46' }}>✓ {matches}</span>}
                      <span style={{ color: T.textSec, fontSize: 14, fontWeight: 700 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '16px', borderTop: `1px solid ${T.border}`, background: T.surface }}>
                      {visit.pmScheduleStatus && (
                        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>PM Assessment:</span>
                          <span style={{
                            padding: '2px 9px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            background: visit.pmScheduleStatus === 'On Track' ? '#064e3b' : visit.pmScheduleStatus === 'Delayed' ? '#7f1d1d' : visit.pmScheduleStatus === 'At Risk' ? '#7c2d12' : '#374151',
                            color:      visit.pmScheduleStatus === 'On Track' ? '#6ee7b7' : visit.pmScheduleStatus === 'Delayed' ? '#fca5a5' : visit.pmScheduleStatus === 'At Risk' ? '#fdba74' : '#9ca3af',
                          }}>
                            {visit.pmScheduleStatus}
                          </span>
                          {visit.observations && <span style={{ fontSize: 12, color: T.textMuted }}>{visit.observations}</span>}
                        </div>
                      )}
                      {byPhase.map(({ phase, items: phItems }) => (
                        <div key={phase} style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: T.textMuted, marginBottom: 7 }}>{phase}</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
                            <thead>
                              <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                {['Item', 'GC Report', 'PM Observed', 'Result'].map(h => (
                                  <th key={h} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 11, color: T.textMuted, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {phItems.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: `1px solid ${T.border}` }}>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: T.textBody }}>{item.label}</td>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: T.textSec }}>{item.gc || <span style={{ color: T.textMuted }}>—</span>}</td>
                                  <td style={{ padding: '7px 12px', fontSize: 12, color: T.textBody, fontWeight: 600 }}>{item.pm || <span style={{ color: T.textMuted }}>—</span>}</td>
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
