function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProbBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: 'var(--border)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default function MonteCarloWidget({ mc }) {
  if (!mc || mc.insufficient_data) {
    return (
      <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Monte Carlo Forecast
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Insufficient data (need ≥ 3 reports)
        </div>
      </div>
    );
  }

  const bgColor   = mc.pOnTime >= 70 ? 'var(--status-done-bg)'  : mc.pOnTime >= 40 ? 'var(--status-warn-bg)'  : 'var(--status-alert-bg)';
  const textColor = mc.pOnTime >= 70 ? 'var(--status-done)'     : mc.pOnTime >= 40 ? 'var(--status-warn)'     : 'var(--status-alert)';

  const P_COLORS = [
    { label: 'P10 (opt.)',  date: mc.p10, color: 'var(--status-done)'  },
    { label: 'P50 (med.)',  date: mc.p50, color: 'var(--accent)'       },
    { label: 'P90 (pess.)', date: mc.p90, color: 'var(--status-alert)' },
  ];

  return (
    <div style={{ background: bgColor, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Monte Carlo · {mc.simulations.toLocaleString()} runs
        </div>
        {mc.highRisk && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--status-alert-bg)', color: 'var(--status-alert)', border: '1px solid var(--border)' }}>
            HIGH RISK
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {P_COLORS.map(({ label, date, color }) => (
          <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 8px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.2 }}>{fmt(date)}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <ProbBar label="On time"       pct={mc.pOnTime}        color="var(--status-done)"  />
      <ProbBar label="≤ 2 wk delay" pct={mc.pDelay2Weeks}   color="var(--status-warn)"  />
      <ProbBar label="≤ 1 mo delay" pct={mc.pDelayMonth}    color="var(--status-warn)"  />
      <ProbBar label="> 30d delay"   pct={mc.pDelayCritical} color="var(--status-alert)" />

      <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, color: textColor, textAlign: 'center', lineHeight: 1 }}>
        {mc.pOnTime}%
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>on-time probability</div>
      </div>

      {mc.model && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          μ = {mc.mu}pp/wk · σ = {mc.sigma}pp · model: {mc.model}
        </div>
      )}
    </div>
  );
}
