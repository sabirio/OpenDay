// Drift Chart — visualises contractor drift timeline + pattern badge.

const PATTERN_LABELS = {
  systematic_overstatement: 'Systematic Overstatement',
  panic_report:             'Panic Report',
  front_loading:            'Front-Loading',
  accurate:                 'Accurate',
};

const PATTERN_COLORS = {
  systematic_overstatement: '#ef4444',
  panic_report:             '#f97316',
  front_loading:            '#f59e0b',
  accurate:                 '#22c55e',
};

const CONFIDENCE_COLORS = { high: '#22c55e', medium: '#f59e0b', low: '#94a3b8' };

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
      {/* Zero reference line */}
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#334155" strokeWidth={1} strokeDasharray="3,2" />
      {/* Positive fill above zero */}
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinejoin="round" />
      {/* Data dots */}
      {diffs.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d)} r={3} fill={d > 0.15 ? '#ef4444' : d < -0.15 ? '#22c55e' : '#94a3b8'} />
      ))}
    </svg>
  );
}

/**
 * Compact contractor drift chart + pattern badge.
 *
 * @param {{ driftProfile: object }} props — result from computeContractorDriftProfile()
 */
export default function DriftChart({ driftProfile }) {
  if (!driftProfile) return null;

  const { pattern, avgHistoricalDrift, correctionFactor, reliabilityScore, worstProject } = driftProfile;
  const patternColor  = PATTERN_COLORS[pattern.pattern]  || '#94a3b8';
  const patternLabel  = PATTERN_LABELS[pattern.pattern]  || pattern.pattern;
  const confColor     = CONFIDENCE_COLORS[pattern.confidence] || '#94a3b8';

  const allTimeline = driftProfile.worstProject ? [] : []; // placeholder; full timeline passed separately
  // The full cross-project timeline is embedded in driftProfile.pattern.avgOverallDrift
  // For per-project use, pass timeline directly if available

  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px', minWidth: 220 }}>
      {/* Header */}
      <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
        Contractor Drift Analysis
      </div>

      {/* Pattern badge + confidence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: patternColor + '22', color: patternColor, border: `1px solid ${patternColor}44` }}>
          {patternLabel}
        </span>
        <span style={{ fontSize: 9, color: confColor, fontWeight: 600 }}>{pattern.confidence}</span>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: '#1e293b', borderRadius: 7, padding: '7px 9px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: avgHistoricalDrift > 0.1 ? '#ef4444' : avgHistoricalDrift < -0.1 ? '#22c55e' : '#94a3b8', lineHeight: 1 }}>
            {avgHistoricalDrift > 0 ? '+' : ''}{Math.round(avgHistoricalDrift * 100)}%
          </div>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Avg drift</div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: 7, padding: '7px 9px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: reliabilityScore >= 80 ? '#22c55e' : reliabilityScore >= 60 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>
            {reliabilityScore}
          </div>
          <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>Reliability</div>
        </div>
      </div>

      {/* Correction factor description */}
      {Math.abs(avgHistoricalDrift) >= 0.05 && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>
          Historically {avgHistoricalDrift > 0 ? 'overstates' : 'understates'} by{' '}
          <strong style={{ color: patternColor }}>{Math.abs(Math.round(avgHistoricalDrift * 100))}%</strong>
          {' '}(correction ×{correctionFactor.toFixed(2)})
        </div>
      )}

      {/* Worst project */}
      {worstProject && Math.abs(worstProject.avgDrift) > 0.05 && (
        <div style={{ fontSize: 10, color: '#64748b' }}>
          Worst: <span style={{ color: '#e2e8f0' }}>{worstProject.storeCode}</span>
          {' '}(avg {worstProject.avgDrift > 0 ? '+' : ''}{Math.round(worstProject.avgDrift * 100)}%)
        </div>
      )}
    </div>
  );
}

/**
 * Larger DriftChart with sparkline — used in per-project drilldown.
 *
 * @param {{ timeline: object[], pattern: object, contractorName: string }} props
 */
export function DriftChartExpanded({ timeline, pattern, contractorName }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>No site visits recorded for drift analysis</div>
    );
  }

  const patternColor = PATTERN_COLORS[pattern?.pattern] || '#94a3b8';
  const patternLabel = PATTERN_LABELS[pattern?.pattern] || 'Unknown';

  return (
    <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Drift Timeline {contractorName ? `· ${contractorName}` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{pattern?.description}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: patternColor + '22', color: patternColor, border: `1px solid ${patternColor}44` }}>
          {patternLabel}
        </span>
      </div>

      <DriftSparkline timeline={timeline} />

      {/* Visit legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
        {timeline.map(p => (
          <div key={p.week} style={{ fontSize: 9, color: '#64748b', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: p.avgDiff > 0.15 ? '#ef4444' : p.avgDiff < -0.15 ? '#22c55e' : '#94a3b8' }}>
              W{p.week}
            </div>
            <div>{p.avgDiff > 0 ? '+' : ''}{Math.round(p.avgDiff * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
