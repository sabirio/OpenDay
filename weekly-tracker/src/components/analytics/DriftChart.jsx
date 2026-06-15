const PATTERN_LABELS = {
  systematic_overstatement: 'Systematic Overstatement',
  panic_report:             'Panic Report',
  front_loading:            'Front-Loading',
  accurate:                 'Accurate',
};

const PATTERN_COLORS = {
  systematic_overstatement: '#ef4444',
  panic_report:             '#f97316',
  front_loading:            '#f97316',
  accurate:                 '#10b981',
};

const CONFIDENCE_COLORS = { high: '#10b981', medium: '#f97316', low: '#9ca3af' };

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
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#374151" strokeWidth={1} strokeDasharray="3,2" />
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth={2} strokeLinejoin="round" />
      {diffs.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d)} r={3} fill={d > 0.15 ? '#ef4444' : d < -0.15 ? '#10b981' : '#9ca3af'} />
      ))}
    </svg>
  );
}

export default function DriftChart({ driftProfile }) {
  if (!driftProfile) return null;

  const { pattern, avgHistoricalDrift, correctionFactor, reliabilityScore, worstProject } = driftProfile;
  const patternColor = PATTERN_COLORS[pattern.pattern]  || '#9ca3af';
  const patternLabel = PATTERN_LABELS[pattern.pattern]  || pattern.pattern;
  const confColor    = CONFIDENCE_COLORS[pattern.confidence] || '#9ca3af';

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 10, padding: '12px 14px', minWidth: 220 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Contractor Drift Analysis
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: patternColor + '22', color: patternColor, border: `1px solid ${patternColor}55` }}>
          {patternLabel}
        </span>
        <span style={{ fontSize: 9, color: confColor, fontWeight: 600 }}>{pattern.confidence}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: '7px 9px', border: '1px solid #374151' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: avgHistoricalDrift > 0.1 ? '#ef4444' : avgHistoricalDrift < -0.1 ? '#10b981' : '#9ca3af', lineHeight: 1 }}>
            {avgHistoricalDrift > 0 ? '+' : ''}{Math.round(avgHistoricalDrift * 100)}%
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Avg drift</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 7, padding: '7px 9px', border: '1px solid #374151' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: reliabilityScore >= 80 ? '#10b981' : reliabilityScore >= 60 ? '#f97316' : '#ef4444', lineHeight: 1 }}>
            {reliabilityScore}
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Reliability</div>
        </div>
      </div>

      {Math.abs(avgHistoricalDrift) >= 0.05 && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, lineHeight: 1.4 }}>
          Historically {avgHistoricalDrift > 0 ? 'overstates' : 'understates'} by{' '}
          <strong style={{ color: patternColor }}>{Math.abs(Math.round(avgHistoricalDrift * 100))}%</strong>
          {' '}(correction ×{correctionFactor.toFixed(2)})
        </div>
      )}

      {worstProject && Math.abs(worstProject.avgDrift) > 0.05 && (
        <div style={{ fontSize: 10, color: '#9ca3af' }}>
          Worst: <span style={{ color: '#e5e7eb' }}>{worstProject.storeCode}</span>
          {' '}(avg {worstProject.avgDrift > 0 ? '+' : ''}{Math.round(worstProject.avgDrift * 100)}%)
        </div>
      )}
    </div>
  );
}

export function DriftChartExpanded({ timeline, pattern, contractorName }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No site visits recorded for drift analysis</div>
    );
  }

  const patternColor = PATTERN_COLORS[pattern?.pattern] || '#9ca3af';
  const patternLabel = PATTERN_LABELS[pattern?.pattern] || 'Unknown';

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #374151', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Drift Timeline {contractorName ? `· ${contractorName}` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{pattern?.description}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: patternColor + '22', color: patternColor, border: `1px solid ${patternColor}55` }}>
          {patternLabel}
        </span>
      </div>

      <DriftSparkline timeline={timeline} />

      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {timeline.map(p => (
          <div key={p.week} style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: p.avgDiff > 0.15 ? '#ef4444' : p.avgDiff < -0.15 ? '#10b981' : '#9ca3af' }}>
              W{p.week}
            </div>
            <div>{p.avgDiff > 0 ? '+' : ''}{Math.round(p.avgDiff * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
