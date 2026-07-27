import { TONE, countTone } from './homePresentation.js';

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      flex: '1 1 120px',
      padding: '10px 14px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function PortfolioHealth({ kpis }) {
  const {
    active, total, atRisk, critical, missing, openingSoon, avgProgress,
  } = kpis;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
        Portfolio Health
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <StatCard
          label="Avg Progress"
          value={`${avgProgress}%`}
          color={avgProgress >= 70 ? TONE.done : avgProgress >= 40 ? TONE.warn : TONE.alert}
        />
        <StatCard
          label="Active Projects"
          value={active}
          sub={`of ${total} total`}
        />
        <StatCard
          label="At Risk"
          value={atRisk}
          color={countTone(atRisk)}
          sub="schedule issues"
        />
        <StatCard
          label="Critical"
          value={critical}
          color={countTone(critical, TONE.alert)}
          sub="risk level"
        />
        <StatCard
          label="Missing Reports"
          value={missing}
          color={countTone(missing)}
        />
        <StatCard
          label="Opening Soon"
          value={openingSoon}
          color={countTone(openingSoon, TONE.warn, TONE.muted)}
          sub="within 30 days"
        />
      </div>
    </div>
  );
}

export default PortfolioHealth;
