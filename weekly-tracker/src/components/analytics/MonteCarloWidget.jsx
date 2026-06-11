// Monte Carlo Widget — probabilistic opening-date forecast display.

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProbBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 3, height: 5, overflow: 'hidden' }}>
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
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Monte Carlo Forecast
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
          Insufficient data (need ≥ 3 reports)
        </div>
      </div>
    );
  }

  const borderColor = mc.pOnTime >= 70 ? '#bbf7d0' : mc.pOnTime >= 40 ? '#fde68a' : '#fecaca';
  const bgColor     = mc.pOnTime >= 70 ? '#f0fdf4' : mc.pOnTime >= 40 ? '#fffbeb' : '#fef2f2';
  const textColor   = mc.pOnTime >= 70 ? '#16a34a' : mc.pOnTime >= 40 ? '#d97706' : '#dc2626';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Monte Carlo · {mc.simulations.toLocaleString()} runs
        </div>
        {mc.highRisk && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            HIGH RISK
          </span>
        )}
      </div>

      {/* P10 / P50 / P90 dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'P10 (opt.)', date: mc.p10, color: '#22c55e' },
          { label: 'P50 (med.)', date: mc.p50, color: '#3b82f6' },
          { label: 'P90 (pess.)', date: mc.p90, color: '#dc2626' },
        ].map(({ label, date, color }) => (
          <div key={label} style={{ background: '#ffffff', borderRadius: 7, padding: '7px 8px', textAlign: 'center', border: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.2 }}>{fmt(date)}</div>
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{label}</div>
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
