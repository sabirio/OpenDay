const PATTERN_LABELS = {
  systematic_overstatement: 'Systematic Overstatement',
  panic_report:             'Panic Report',
  front_loading:            'Front-Loading',
  accurate:                 'Accurate',
};

const PATTERN_STYLES = {
  systematic_overstatement: { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)', border: 'var(--border)' },
  panic_report:             { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  front_loading:            { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)',  border: 'var(--border)' },
  accurate:                 { color: 'var(--status-done)',  bg: 'var(--status-done-bg)',  border: 'var(--border)' },
};
const PATTERN_FALLBACK = { color: 'var(--text-muted)', bg: 'var(--bg-elevated)', border: 'var(--border)' };

const CONF_COLOR = { high: 'var(--status-done)', medium: 'var(--status-warn)', low: 'var(--text-muted)' };

function DriftSparkline({ timeline }) {
  if (!timeline || timeline.length < 2) return null;

  const W = 180, H = 48;
  const diffs  = timeline.map(p => p.avgDiff);
  const minD   = Math.min(-0.5, ...diffs);
  const maxD   = Math.max(0.5, ...diffs);
  const range  = maxD - minD || 1;

  const toY = (d) => H - ((d - minD) / range) * H;
  const toX = (i) => (i / (diffs.length - 1)) * W;

  const pts = diffs.map((d, i) => `${toX(i)},${toY(d)}`).join(' ');
  const zeroY = toY(0);

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth={1} strokeDasharray="3,2" />
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {diffs.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d)} r={3}
          fill={d > 0.15 ? 'var(--status-alert)' : d < -0.15 ? 'var(--status-done)' : 'var(--text-muted)'} />
      ))}
    </svg>
  );
}

export default function DriftChart({ driftProfile }) {
  if (!driftProfile) return null;

  const { pattern, avgHistoricalDrift, correctionFactor, reliabilityScore, worstProject } = driftProfile;
  const ps          = PATTERN_STYLES[pattern.pattern]  || PATTERN_FALLBACK;
  const patternLabel = PATTERN_LABELS[pattern.pattern] || pattern.pattern;
  const confColor    = CONF_COLOR[pattern.confidence]  || 'var(--text-muted)';

  const driftColor    = avgHistoricalDrift > 0.1 ? 'var(--status-alert)' : avgHistoricalDrift < -0.1 ? 'var(--status-done)' : 'var(--text-muted)';
  const reliabColor   = reliabilityScore >= 80 ? 'var(--status-done)' : reliabilityScore >= 60 ? 'var(--status-warn)' : 'var(--status-alert)';

  return (
    <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', minWidth: 220 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Contractor Drift Analysis
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>
          {patternLabel}
        </span>
        <span style={{ fontSize: 9, color: confColor, fontWeight: 600 }}>{pattern.confidence}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 9px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: driftColor, lineHeight: 1 }}>
            {avgHistoricalDrift > 0 ? '+' : ''}{Math.round(avgHistoricalDrift * 100)}%
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Avg drift</div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 9px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: reliabColor, lineHeight: 1 }}>
            {reliabilityScore}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>Reliability</div>
        </div>
      </div>

      {Math.abs(avgHistoricalDrift) >= 0.05 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
          Historically {avgHistoricalDrift > 0 ? 'overstates' : 'understates'} by{' '}
          <strong style={{ color: ps.color }}>{Math.abs(Math.round(avgHistoricalDrift * 100))}%</strong>
          {' '}(correction ×{correctionFactor.toFixed(2)})
        </div>
      )}

      {worstProject && Math.abs(worstProject.avgDrift) > 0.05 && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Worst: <span style={{ color: 'var(--text-primary)' }}>{worstProject.storeCode}</span>
          {' '}(avg {worstProject.avgDrift > 0 ? '+' : ''}{Math.round(worstProject.avgDrift * 100)}%)
        </div>
      )}
    </div>
  );
}

export function DriftChartExpanded({ timeline, pattern, contractorName }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No site visits recorded for drift analysis</div>
    );
  }

  const ps           = PATTERN_STYLES[pattern?.pattern] || PATTERN_FALLBACK;
  const patternLabel = PATTERN_LABELS[pattern?.pattern] || 'Unknown';

  return (
    <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Drift Timeline {contractorName ? `· ${contractorName}` : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{pattern?.description}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>
          {patternLabel}
        </span>
      </div>

      <DriftSparkline timeline={timeline} />

      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {timeline.map(p => (
          <div key={p.week} style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: p.avgDiff > 0.15 ? 'var(--status-alert)' : p.avgDiff < -0.15 ? 'var(--status-done)' : 'var(--text-muted)' }}>
              W{p.week}
            </div>
            <div>{p.avgDiff > 0 ? '+' : ''}{Math.round(p.avgDiff * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
