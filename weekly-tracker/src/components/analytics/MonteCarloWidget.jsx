// Monte Carlo Widget — probabilistic opening-date forecast display.

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProbBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: '#1e293b', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

/**
 * Compact Monte Carlo forecast widget.
 *
 * @param {{ mc: object }} props — result from computeMonteCarloForecast()
 */
export default function MonteCarloWidget({ mc }) {
  if (!mc || mc.insufficient_data) {
    return (
      <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Monte Carlo Forecast
        </div>
        <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
          Insufficient data (need ≥ 3 reports)
        </div>
      </div>
    );
  }

  const borderColor = mc.pOnTime >= 70 ? '#22c55e' : mc.pOnTime >= 40 ? '#f59e0b' : '#ef4444';
  const bgColor     = mc.pOnTime >= 70 ? '#052e16' : mc.pOnTime >= 40 ? '#422006' : '#450a0a';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}44`, borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Monte Carlo · {mc.simulations.toLocaleString()} runs
        </div>
        {mc.highRisk && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#7f1d1d', color: '#fca5a5' }}>
            HIGH RISK
          </span>
        )}
      </div>

      {/* P10 / P50 / P90 dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'P10 (opt.)', date: mc.p10, color: '#22c55e' },
          { label: 'P50 (med.)', date: mc.p50, color: '#60a5fa' },
          { label: 'P90 (pess.)', date: mc.p90, color: '#f87171' },
        ].map(({ label, date, color }) => (
          <div key={label} style={{ background: '#0f172a', borderRadius: 7, padding: '7px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.2 }}>{fmt(date)}</div>
            <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Probability bars */}
      <ProbBar label="On time"        pct={mc.pOnTime}        color="#22c55e" />
      <ProbBar label="≤ 2 wk delay"  pct={mc.pDelay2Weeks}   color="#f59e0b" />
      <ProbBar label="≤ 1 mo delay"  pct={mc.pDelayMonth}    color="#ea580c" />
      <ProbBar label="> 30d delay"   pct={mc.pDelayCritical} color="#ef4444" />
    </div>
  );
}
