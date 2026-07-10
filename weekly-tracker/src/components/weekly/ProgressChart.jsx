/**
 * ProgressChart — SVG burn-up line chart for project progress over time.
 * Pure display. All series data comes from the engine (computeProgressSeries).
 * No chart libraries — vanilla SVG with responsive viewBox.
 */

import { valueToSparkY } from "../../hooks/useChartMathPresentation";

const W = 1000, H = 150;
const PAD = { t: 14, r: 24, b: 40, l: 56 };
const PW  = W - PAD.l - PAD.r;
const PH  = H - PAD.t - PAD.b;

function xOf(i, n) {
  return PAD.l + (n < 2 ? PW / 2 : (i / (n - 1)) * PW);
}
function yOf(pct) {
  return PAD.t + valueToSparkY(pct, 0, 100, PH);
}

export default function ProgressChart({ series, scheduleStatus, spi, reportCount, latestDate }) {
  if (!series || series.length === 0) return null;

  const n   = series.length;
  const pts = series.map((d, i) => `${xOf(i, n).toFixed(1)},${yOf(d.pct).toFixed(1)}`).join(' ');

  // X labels: always show first + last; show all when ≤8 points.
  const showLabel = (i) => i === 0 || i === n - 1 || n <= 8;

  const statusLabel = scheduleStatus === 'behind' ? 'Behind schedule'
                    : scheduleStatus === 'ahead'  ? 'Ahead of schedule'
                    : scheduleStatus === 'on_track' ? 'On track'
                    : null;
  const statusVar   = scheduleStatus === 'behind' ? 'var(--status-alert)'
                    : scheduleStatus === 'ahead'  ? 'var(--status-done)'
                    : 'var(--text-secondary)';

  return (
    <div className="dashboard-summary-card weekly-progress-chart-card">
      <div className="weekly-chart-head">
        <div>
          <div className="weekly-section-kicker">Progress over time</div>
          <h2>Historical progress trace</h2>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {/* Y gridlines + labels */}
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line
              x1={PAD.l} x2={W - PAD.r}
              y1={yOf(v).toFixed(1)} y2={yOf(v).toFixed(1)}
              stroke="var(--border)" strokeWidth="0.5"
            />
            <text
              x={PAD.l - 6} y={yOf(v).toFixed(1)}
              textAnchor="end" dominantBaseline="middle"
              fill="var(--text-muted)" fontSize="8"
            >{v}%</text>
          </g>
        ))}

        {/* Progress line */}
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          points={pts}
        />

        {/* Dots + X-axis date labels */}
        {series.map((d, i) => (
          <g key={`${d.date}-${i}`}>
            <circle
              cx={xOf(i, n).toFixed(1)}
              cy={yOf(d.pct).toFixed(1)}
              r="2.5"
              fill="var(--bg-surface)"
              stroke="var(--accent)"
              strokeWidth="1.2"
            />
            {showLabel(i) && (
              <text
                x={xOf(i, n).toFixed(1)}
                y={(H - PAD.b + 16).toFixed(1)}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fill="var(--text-muted)"
                fontSize="8"
              >
                {d.date?.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Caption */}
      <div className="weekly-chart-caption">
        {spi != null && <span>SPI <strong style={{ color: 'var(--text-primary)' }}>{spi}</strong></span>}
        {statusLabel  && <span style={{ color: statusVar, fontWeight: 600 }}>{statusLabel}</span>}
        <span>{reportCount} report{reportCount !== 1 ? 's' : ''}</span>
        {latestDate   && <span>Latest {latestDate}</span>}
      </div>
    </div>
  );
}
