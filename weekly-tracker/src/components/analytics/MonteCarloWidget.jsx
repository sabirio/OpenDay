import { useState } from 'react';

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
  const [showAdjusted, setShowAdjusted] = useState(false);

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

  // A2: mc.adjusted (same shape as mc) is only present once the contractor's
  // bias estimate is reliable (n>=3) — see computeRiskRows.js. It's an
  // alternate forecast, never a replacement for the reported one.
  const hasAdjusted = !!mc.adjusted && !mc.adjusted.insufficient_data;
  const active       = showAdjusted && hasAdjusted ? mc.adjusted : mc;

  const bgColor   = active.pOnTime >= 70 ? 'var(--status-done-bg)'  : active.pOnTime >= 40 ? 'var(--status-warn-bg)'  : 'var(--status-alert-bg)';
  const textColor = active.pOnTime >= 70 ? 'var(--status-done)'     : active.pOnTime >= 40 ? 'var(--status-warn)'     : 'var(--status-alert)';

  const P_COLORS = [
    { label: 'P10 (opt.)',  date: active.p10, color: 'var(--status-done)'  },
    { label: 'P50 (med.)',  date: active.p50, color: 'var(--accent)'       },
    { label: 'P90 (pess.)', date: active.p90, color: 'var(--status-alert)' },
  ];

  return (
    <div style={{ background: bgColor, border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', minWidth: 200 }}>
      {hasAdjusted && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button type="button" onClick={() => setShowAdjusted(false)}
            style={{ flex: 1, fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: !showAdjusted ? 'var(--bg-elevated)' : 'transparent',
              color: !showAdjusted ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            Reported
          </button>
          <button type="button" onClick={() => setShowAdjusted(true)}
            style={{ flex: 1, fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid var(--border)',
              background: showAdjusted ? 'var(--bg-elevated)' : 'transparent',
              color: showAdjusted ? 'var(--text-primary)' : 'var(--text-muted)' }}
            title="Adjusted for this contractor's historical over/under-reporting bias">
            Adjusted
          </button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Monte Carlo · {active.simulations.toLocaleString()} runs
        </div>
        {active.highRisk && (
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

      <ProbBar label="On time"       pct={active.pOnTime}        color="var(--status-done)"  />
      <ProbBar label="≤ 2 wk delay" pct={active.pDelay2Weeks}   color="var(--status-warn)"  />
      <ProbBar label="≤ 1 mo delay" pct={active.pDelayMonth}    color="var(--status-warn)"  />
      <ProbBar label="> 30d delay"   pct={active.pDelayCritical} color="var(--status-alert)" />

      <div style={{ marginTop: 10, fontSize: 20, fontWeight: 800, color: textColor, textAlign: 'center', lineHeight: 1 }}>
        {active.pOnTime}%
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>on-time probability</div>
      </div>

      {active.model && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
          μ = {active.mu}pp/wk · σ = {active.sigma}pp · model: {active.model}
        </div>
      )}
    </div>
  );
}
