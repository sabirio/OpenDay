import { useState } from 'react';

function StatCard({ label, value, color, sub, details }) {
  const [open, setOpen] = useState(false);
  const hasDetails = Array.isArray(details) && details.length > 0;
  return (
    <div style={{
      flex: '1 1 140px', padding: '14px 16px', background: 'var(--bg-elevated)',
      border: '1.5px solid var(--border)', borderRadius: 10,
      cursor: hasDetails ? 'pointer' : 'default',
    }} onClick={hasDetails ? () => setOpen(o => !o) : undefined}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {hasDetails && <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      {open && hasDetails && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {details.map((d, i) => (
            <div key={i} style={{ fontSize: 11 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {d.code}{d.mall ? ` · ${d.mall}` : ''} — {d.status}
              </div>
              {d.criticalBlockers.length > 0 && (
                <div style={{ color: 'var(--status-alert)', marginTop: 2 }}>⛔ {d.criticalBlockers.join(', ')}</div>
              )}
              {d.softBlockers.length > 0 && (
                <div style={{ color: 'var(--status-warn)', marginTop: 2 }}>⚠ {d.softBlockers.join(', ')}</div>
              )}
              {d.reasons.length > 0 && d.criticalBlockers.length === 0 && d.softBlockers.length === 0 && (
                <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{d.reasons.join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioHealth({ kpis }) {
  const {
    active, total, atRisk, critical, missing, openingSoon, avgProgress,
    atRiskDetails = [], criticalDetails = [],
  } = kpis;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
        Portfolio Health
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <StatCard
          label="Avg Progress"
          value={`${avgProgress}%`}
          color={avgProgress >= 70 ? 'var(--status-done)' : avgProgress >= 40 ? 'var(--status-warn)' : 'var(--status-alert)'}
        />
        <StatCard
          label="Active Projects"
          value={active}
          sub={`of ${total} total`}
        />
        <StatCard label="At Risk" value={atRisk} color={atRisk > 0 ? 'var(--status-warn)' : 'var(--status-done)'} sub="schedule issues" details={atRiskDetails} />
        <StatCard label="Critical" value={critical} color={critical > 0 ? 'var(--status-alert)' : 'var(--status-done)'} sub="risk level" details={criticalDetails} />
        <StatCard
          label="Missing Reports"
          value={missing}
          color={missing > 0 ? 'var(--status-warn)' : 'var(--status-done)'}
        />
        <StatCard
          label="Opening Soon"
          value={openingSoon}
          color={openingSoon > 0 ? 'var(--status-warn)' : 'var(--text-muted)'}
          sub="within 30 days"
        />
      </div>
    </div>
  );
}

export default PortfolioHealth;
