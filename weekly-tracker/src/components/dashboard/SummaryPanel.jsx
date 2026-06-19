import { KpiCard } from './DashboardWidgets';

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
      {analytics?.mcRiskyCount > 0 && (
        <div style={{
          background: 'var(--status-warn-bg)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--status-warn)',
          borderRadius: 10,
          padding: '8px 14px',
          marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--status-warn)' }}>⚠ Monte Carlo Warning:</span>
          <span style={{ color: 'var(--status-warn)' }}>
            {analytics.mcRiskyCount} project{analytics.mcRiskyCount > 1 ? 's' : ''} have &lt;50% probability of opening on time
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <KpiCard label="Total Projects"    value={kpis.total}           color="var(--text-secondary)"/>
        <KpiCard label="Active"            value={kpis.active}          color="var(--status-done)"   sub={`${kpis.total - kpis.active} closed`}/>
        <KpiCard label="At Risk"           value={kpis.atRisk}          color={kpis.atRisk > 0 ? 'var(--status-warn)' : 'var(--status-done)'}   sub="schedule issues"/>
        <KpiCard label="Critical"          value={kpis.critical}        color={kpis.critical > 0 ? 'var(--status-alert)' : 'var(--status-done)'} sub="immediate action"/>
        <KpiCard label="Reports This Week" value={kpis.reportsThisWeek} color="var(--accent)"        sub={`${reportsTotal} total`}/>
      </div>
    </>
  );
}
