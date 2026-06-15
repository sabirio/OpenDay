function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProbBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: '#374151', borderRadius: 3, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default function MonteCarloWidget({ mc }) {
  if (!mc || mc.insufficient_data) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Monte Carlo Forecast
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
          Insufficient data (need ≥ 3 reports)
        </div>
      </div>
    );
  }

  const borderColor = mc.pOnTime >= 70 ? '#065f46' : mc.pOnTime >= 40 ? '#92400e' : '#991b1b';
  const bgColor     = mc.pOnTime >= 70 ? '#064e3b' : mc.pOnTime >= 40 ? '#7c2d12' : '#7f1d1d';
  const textColor   = mc.pOnTime >= 70 ? '#6ee7b7' : mc.pOnTime >= 40 ? '#fdba74' : '#fca5a5';

  return (
    <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Monte Carlo · {mc.simulations.toLocaleString()} runs
        </div>
        {mc.highRisk && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }}>
            HIGH RISK
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
        {[
          { label: 'P10 (opt.)',  date: mc.p10, color: '#10b981' },
          { label: 'P50 (med.)',  date: mc.p50, color: '#22d3ee' },
          { label: 'P90 (pess.)', date: mc.p90, color: '#ef4444' },
        ].map(({ label, date, color }) => (
          <div key={label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: '7px 8px', textAlign: 'center', border: '1px solid #374151' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.2 }}>{fmt(date)}</div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <ProbBar label="On time"       pct={mc.pOnTime}        color="#10b981" />
      <ProbBar label="≤ 2 wk delay" pct={mc.pDelay2Weeks}   color="#f97316" />
      <ProbBar label="≤ 1 mo delay" pct={mc.pDelayMonth}    color="#f97316" />
      <ProbBar label="> 30d delay"   pct={mc.pDelayCritical} color="#ef4444" />
    </div>
  );
}
