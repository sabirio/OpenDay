import { SPI_STATUS, getScoreTier, SCORE_TIER_COLORS } from "../../config/statusColors";
import { countDiscrepanciesByStatus } from "../../hooks/useDiscrepancyPresentation";
import SPISparkline from "./SPISparkline";
import Glyph from "./Glyph";

function GanttSpiTab({ ganttSpiLoading, ganttMetricsMap, allRows, projectTrends, discHistory, reliabilityMap }) {
  if (ganttSpiLoading) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>
          Loading Gantt SPI data…
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── SPI Overview table ── */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Schedule Performance Index (SPI) — All Projects</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>SPI = actual progress ÷ planned progress · ≥0.95 On Schedule · 0.80–0.94 At Risk · &lt;0.80 Critical</div>
        {ganttMetricsMap.size === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No Gantt data found. Generate a Gantt for your projects to see SPI analytics.</div>
        ) : (
          <div className="ds-data-surface">
            <table className="ds-table ds-table--dense">
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['Project', 'SPI', 'Status', 'Critical Path', 'Last Visit', 'Trend (8w)'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map(({ project }) => {
                  const m    = ganttMetricsMap.get(project.id);
                  const st   = m ? SPI_STATUS[m.spiStatus] : SPI_STATUS.no_schedule;
                  const ch   = m?.criticalHealth;
                  const chColor = !ch || ch.total === 0 ? 'var(--text-muted)' : ch.label === 'healthy' ? 'var(--status-done)' : ch.label === 'warning' ? 'var(--status-warn)' : 'var(--status-alert)';
                  const trend = projectTrends[project.id] || [];
                  return (
                    <tr key={project.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{project.storeCode}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{project.shoppingMallName}</div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: st.color }}>
                          {m?.spi != null ? m.spi.toFixed(2) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {ch && ch.total > 0 ? (
                          <span style={{ color: chColor, fontSize: 12, fontWeight: 600 }}>
                            {ch.behind === 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Glyph name="check" /> All on track</span> : `${ch.behind}/${ch.total} behind`}
                          </span>
                        ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {m?.lastVisitDate
                          ? new Date(m.lastVisitDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                          : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <SPISparkline points={trend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Discrepancy History ── */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Discrepancy History</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>PM vs GC progress gaps from site visits · latest 10 per project</div>
        {allRows.map(({ project }) => {
          const discs = discHistory[project.id] || [];
          if (discs.length === 0) return null;
          const { critical: critCount, warning: warnCount } = countDiscrepanciesByStatus(discs);
          return (
            <div key={project.id} style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{project.storeCode}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{project.shoppingMallName}</span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {critCount > 0 && <span style={{ color: 'var(--status-alert)', fontSize: 12, fontWeight: 700 }}>{critCount} critical</span>}
                  {warnCount > 0 && <span style={{ color: 'var(--status-warn)', fontSize: 12, fontWeight: 700 }}>{warnCount} warning</span>}
                </div>
              </div>
              <div className="ds-data-surface">
                <table className="ds-table ds-table--dense">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['WP', 'Visit Date', 'GC%', 'PM%', 'Delta', 'Status'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {discs.map((d, i) => {
                      const stColor = d.status === 'critical' ? 'var(--status-alert)' : d.status === 'warning' ? 'var(--status-warn)' : 'var(--status-done)';
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>{d.wpId}</td>
                          <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.visitDate ? new Date(d.visitDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                          <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.contractorPct ?? '—'}%</td>
                          <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.sitePct ?? '—'}%</td>
                          <td style={{ padding: '5px 8px', fontSize: 13, fontWeight: 700, color: stColor }}>{d.delta != null ? `Δ${d.delta}%` : '—'}</td>
                          <td style={{ padding: '5px 8px' }}>
                            <span style={{ background: d.status === 'critical' ? 'var(--status-alert-bg)' : d.status === 'warning' ? 'var(--status-warn-bg)' : 'var(--status-done-bg)', color: stColor, borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {allRows.every(({ project }) => !(discHistory[project.id]?.length > 0)) && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No discrepancy data yet. Submit PM site visits to track GC vs PM gaps.</div>
        )}
      </div>

      {/* ── Contractor Reliability ── */}
      <div className="dashboard-summary-card" style={{ margin: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Contractor Reliability Score</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Based on site_visit_discrepancies · score = 100% - (critical gaps / total assessments)</div>
        {reliabilityMap.size === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No discrepancy data yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {allRows.map(({ project }) => {
              const rel = reliabilityMap.get(project.id);
              if (!rel || rel.total === 0) return null;
              const scoreColor = SCORE_TIER_COLORS[getScoreTier(rel.score)];
              return (
                <div key={project.id} style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{project.storeCode}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{project.generalContractor || 'No GC'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{rel.score}</span>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                      <div>{rel.ok} ok</div>
                      {rel.warning > 0 && <div style={{ color: 'var(--status-warn)' }}>{rel.warning} warn</div>}
                      {rel.critical > 0 && <div style={{ color: 'var(--status-alert)' }}>{rel.critical} crit</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default GanttSpiTab;
