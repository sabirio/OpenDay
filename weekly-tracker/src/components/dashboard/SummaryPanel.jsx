import { KpiCard } from './DashboardWidgets';

/**
 * @param {{ kpis: object, reportsTotal: number, rows?: object[] }} props
 * rows (optional) — allRows from Dashboard/RiskDashboard for analytics KPIs
 */
export default function SummaryPanel({ kpis, reportsTotal, rows }) {
  const analytics = rows && rows.length > 0 ? (() => {
    const evmRows  = rows.filter(r => r.evm?.SPI != null);
    const avgSPI   = evmRows.length
      ? Math.round((evmRows.reduce((s, r) => s + r.evm.SPI, 0) / evmRows.length) * 100) / 100
      : null;

    const mcRiskyCount = rows.filter(r => r.monteCarlo && !r.monteCarlo.insufficient_data && r.monteCarlo.pOnTime < 50).length;

    return { avgSPI, mcRiskyCount };
  })() : null;

  return (
    <>
      {/* Monte Carlo alert — any project with pOnTime < 50% */}
      {analytics?.mcRiskyCount > 0 && (
        <div style={{
          background: '#7c2d12', border: '1px solid #92400e', borderRadius: 10,
          padding: '8px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
          borderLeft: '4px solid #f97316',
        }}>
          <span style={{ fontWeight: 700, color: '#fdba74' }}>⚠ Monte Carlo Warning:</span>
          <span style={{ color: '#fdba74' }}>
            {analytics.mcRiskyCount} project{analytics.mcRiskyCount > 1 ? 's' : ''} have &lt;50% probability of opening on time
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Total Projects"    value={kpis.total}           color="#9ca3af"/>
        <KpiCard label="Active"            value={kpis.active}          color="#10b981"  sub={`${kpis.total - kpis.active} closed`}/>
        <KpiCard label="At Risk"           value={kpis.atRisk}          color={kpis.atRisk > 0 ? "#f97316" : "#10b981"}   sub="schedule issues"/>
        <KpiCard label="Critical"          value={kpis.critical}        color={kpis.critical > 0 ? "#ef4444" : "#10b981"} sub="immediate action"/>
        <KpiCard label="Reports This Week" value={kpis.reportsThisWeek} color="#22d3ee"  sub={`${reportsTotal} total`}/>
        <KpiCard label="Opening <30 Days"  value={kpis.openingSoon}     color={kpis.openingSoon > 0 ? "#f97316" : "#10b981"} sub="proximity alert"/>
        {analytics?.avgSPI != null && (
          <KpiCard
            label="Avg Portfolio SPI"
            value={analytics.avgSPI.toFixed(2)}
            color={analytics.avgSPI >= 1.0 ? '#10b981' : analytics.avgSPI >= 0.9 ? '#f97316' : '#ef4444'}
            sub="schedule performance"
          />
        )}
      </div>
    </>
  );
}
