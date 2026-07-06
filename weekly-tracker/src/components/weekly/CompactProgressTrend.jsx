const W = 360;
const H = 92;
const PAD = { t: 12, r: 12, b: 18, l: 28 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

function xOf(i, n) {
  return PAD.l + (n < 2 ? PW / 2 : (i / (n - 1)) * PW);
}

function yOf(pct) {
  return PAD.t + PH - (pct / 100) * PH;
}

export default function CompactProgressTrend({ series, scheduleStatus, spi }) {
  if (!series || series.length === 0) {
    return (
      <div className="weekly-compact-trend is-empty">
        <div className="weekly-section-kicker">Progress trace</div>
        <span>No progress history yet</span>
      </div>
    );
  }

  const points = series.map((d, i) => `${xOf(i, series.length).toFixed(1)},${yOf(d.pct).toFixed(1)}`).join(' ');
  const statusLabel = scheduleStatus === 'behind' ? 'Behind plan'
    : scheduleStatus === 'ahead' ? 'Ahead of plan'
      : scheduleStatus === 'on_track' ? 'On plan'
        : 'No baseline';

  return (
    <div className="weekly-compact-trend">
      <div className="weekly-trend-head">
        <div>
          <div className="weekly-section-kicker">Progress trace</div>
          <strong>{statusLabel}</strong>
        </div>
        {spi != null && <span>SPI {spi}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-hidden="true">
        {[0, 50, 100].map(v => (
          <line key={v} x1={PAD.l} x2={W - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--border)" strokeWidth="0.5" />
        ))}
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map((d, i) => (
          <circle key={`${d.date}-${i}`} cx={xOf(i, series.length)} cy={yOf(d.pct)} r="2.6" fill="var(--bg-base)" stroke="var(--accent)" strokeWidth="1.4" />
        ))}
      </svg>
    </div>
  );
}
