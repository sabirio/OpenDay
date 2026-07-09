import { getScoreTier, SCORE_TIER_COLORS } from '../../config/statusColors';
import {
  formatDriftPct,
  formatAbsDriftPct,
  driftMagnitude,
  DRIFT_SIGNIFICANCE_THRESHOLD,
} from '../../hooks/useDriftPresentation';

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

// A2 bias-badge thresholds (recency-weighted EWMA, distinct from the plain
// all-history avgHistoricalDrift above it): green <3%, yellow 3-8%, red >8%.
function biasBadgeColor(absBiasPct) {
  if (absBiasPct >= 8) return { color: 'var(--status-alert)', bg: 'var(--status-alert-bg)' };
  if (absBiasPct >= 3) return { color: 'var(--status-warn)',  bg: 'var(--status-warn-bg)'  };
  return { color: 'var(--status-done)', bg: 'var(--status-done-bg)' };
}

export default function DriftChart({ driftProfile }) {
  if (!driftProfile) return null;

  const { pattern, avgHistoricalDrift, correctionFactor, reliabilityScore, worstProject, biasEwma, sampleCount, reliable } = driftProfile;
  const ps          = PATTERN_STYLES[pattern.pattern]  || PATTERN_FALLBACK;
  const patternLabel = PATTERN_LABELS[pattern.pattern] || pattern.pattern;
  const confColor    = CONF_COLOR[pattern.confidence]  || 'var(--text-muted)';

  const biasPct   = formatDriftPct(biasEwma);
  const biasStyle = biasBadgeColor(formatAbsDriftPct(biasEwma));

  const driftColor    = avgHistoricalDrift > 0.1 ? 'var(--status-alert)' : avgHistoricalDrift < -0.1 ? 'var(--status-done)' : 'var(--text-muted)';
  const reliabColor   = SCORE_TIER_COLORS[getScoreTier(reliabilityScore)];

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
        {reliable ? (
          <span title={`Recency-weighted bias, n=${sampleCount} site visits`}
            style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: biasStyle.bg, color: biasStyle.color }}>
            Trust bias {biasPct > 0 ? '+' : ''}{biasPct}%
          </span>
        ) : (
          <span title={`Only ${sampleCount ?? 0} site visit(s) so far — need 3+ for a reliable trend`}
            style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Trust bias: n={sampleCount ?? 0} (not yet reliable)
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 7, padding: '7px 9px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: driftColor, lineHeight: 1 }}>
            {avgHistoricalDrift > 0 ? '+' : ''}{formatDriftPct(avgHistoricalDrift)}%
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

      {driftMagnitude(avgHistoricalDrift) >= DRIFT_SIGNIFICANCE_THRESHOLD && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
          Historically {avgHistoricalDrift > 0 ? 'overstates' : 'understates'} by{' '}
          <strong style={{ color: ps.color }}>{formatAbsDriftPct(avgHistoricalDrift)}%</strong>
          {' '}(correction ×{correctionFactor.toFixed(2)})
        </div>
      )}

      {worstProject && driftMagnitude(worstProject.avgDrift) > DRIFT_SIGNIFICANCE_THRESHOLD && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          Worst: <span style={{ color: 'var(--text-primary)' }}>{worstProject.storeCode}</span>
          {' '}(avg {worstProject.avgDrift > 0 ? '+' : ''}{formatDriftPct(worstProject.avgDrift)}%)
        </div>
      )}
    </div>
  );
}
