import Icon from '../shared/Icon';
import { formatDate } from '../../utils/reportUtils';
import { computeGaugeArc, ratioToPercent } from '../../hooks/useChartMathPresentation';
import { useDashboardSummaryPanelModel } from '../../hooks/useDashboardSummaryPanelModel';

const STATUS_SEGMENTS = [
  { label: 'On Track', key: 'On Track', color: 'var(--status-done)' },
  { label: 'At Risk', key: 'At Risk', color: 'var(--status-warn)' },
  { label: 'Delayed', key: 'Delayed', color: 'var(--status-warn)' },
  { label: 'Critical', key: 'Critical', color: 'var(--status-alert)' },
  { label: 'No Report', key: null, color: 'var(--border-strong)' },
];

function StatusLegend({ counts }) {
  return (
    <div className="dashboard-portfolio-status-legend">
      {STATUS_SEGMENTS.map(({ label, key, color }) => {
        const count = counts[key] ?? 0;
        return (
          <div className="dashboard-portfolio-status-row" key={label}>
            <span className="dashboard-portfolio-status-label">
              <span className="dashboard-portfolio-status-dot" style={{ background: color, opacity: count === 0 ? 0.35 : 1 }} />
              {label}
            </span>
            <strong style={{ color: count === 0 ? 'var(--text-muted)' : color }}>{count}</strong>
          </div>
        );
      })}
    </div>
  );
}

function PortfolioStatusBar({ counts, total }) {
  return (
    <div
      className="dashboard-portfolio-status-bar"
      role="img"
      aria-label={`Portfolio status distribution for ${total} projects`}
    >
      {STATUS_SEGMENTS.map(({ label, key, color }) => {
        const count = counts[key] ?? 0;
        if (count === 0) return null;
        return (
          <span
            key={label}
            title={`${label}: ${count}`}
            style={{ width: `${ratioToPercent(count, total)}%`, background: color }}
          />
        );
      })}
    </div>
  );
}

function PortfolioDonut({ counts, total }) {
  const radius = 22;
  const onTrackArc = computeGaugeArc(counts['On Track'] ?? 0, total, radius);
  const atRiskArc = computeGaugeArc(counts['At Risk'] ?? 0, total, radius);
  const delayedArc = computeGaugeArc(counts.Delayed ?? 0, total, radius);
  const criticalArc = computeGaugeArc(counts.Critical ?? 0, total, radius);
  const noReportArc = computeGaugeArc(counts.null ?? 0, total, radius);
  const arcs = [
    { ...STATUS_SEGMENTS[0], count: counts['On Track'] ?? 0, dash: onTrackArc.dash, dashOffset: 'var(--ring-circumference)' },
    { ...STATUS_SEGMENTS[1], count: counts['At Risk'] ?? 0, dash: atRiskArc.dash, dashOffset: 'calc(var(--ring-circumference) - var(--ring-on-track))' },
    { ...STATUS_SEGMENTS[2], count: counts.Delayed ?? 0, dash: delayedArc.dash, dashOffset: 'calc(var(--ring-circumference) - var(--ring-on-track) - var(--ring-at-risk))' },
    { ...STATUS_SEGMENTS[3], count: counts.Critical ?? 0, dash: criticalArc.dash, dashOffset: 'calc(var(--ring-circumference) - var(--ring-on-track) - var(--ring-at-risk) - var(--ring-delayed))' },
    { ...STATUS_SEGMENTS[4], count: counts.null ?? 0, dash: noReportArc.dash, dashOffset: 'calc(var(--ring-circumference) - var(--ring-on-track) - var(--ring-at-risk) - var(--ring-delayed) - var(--ring-critical))' },
  ];

  return (
    <svg
      className="dashboard-portfolio-donut"
      width="92"
      height="92"
      viewBox="0 0 64 64"
      role="img"
      aria-label={`Portfolio status distribution for ${total} projects`}
      style={{
        '--ring-circumference': onTrackArc.circumference,
        '--ring-on-track': onTrackArc.dash,
        '--ring-at-risk': atRiskArc.dash,
        '--ring-delayed': delayedArc.dash,
        '--ring-critical': criticalArc.dash,
      }}
    >
      {arcs.map(({ label, color, count, dash, dashOffset }) => count > 0 && (
        <circle
          key={label}
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          style={{
            strokeDasharray: `${dash} var(--ring-circumference)`,
            strokeDashoffset: dashOffset,
            transform: 'rotate(-90deg)',
            transformOrigin: '32px 32px',
          }}
        />
      ))}
      <text x="32" y="31" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text-primary)">{total}</text>
      <text x="32" y="40" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--text-muted)">Projects</text>
    </svg>
  );
}

function PortfolioHealth({ counts, total }) {
  return (
    <div className="dashboard-portfolio-column dashboard-portfolio-health-column">
      <h2>Portfolio Health</h2>
      {total > 0 ? (
        <>
          <div className={total <= 5 ? 'dashboard-portfolio-health-compact' : 'dashboard-portfolio-health-donut'}>
            {total <= 5
              ? <PortfolioStatusBar counts={counts} total={total} />
              : <PortfolioDonut counts={counts} total={total} />}
            <StatusLegend counts={counts} />
          </div>
        </>
      ) : (
        <p className="dashboard-portfolio-empty">No health signal yet</p>
      )}
    </div>
  );
}

function PortfolioScope({ kpis }) {
  const closed = kpis.total - kpis.active;

  return (
    <div className="dashboard-portfolio-column dashboard-portfolio-scope-column">
      <h2>Portfolio Scope</h2>
      <div className="dashboard-portfolio-total"><strong>{kpis.total}</strong><span>Projects</span></div>
      <dl className="dashboard-portfolio-scope-grid">
        <div><dt>Active</dt><dd>{kpis.active}</dd></div>
        <div><dt>Closed</dt><dd>{closed}</dd></div>
        <div><dt>New Opening</dt><dd>{kpis.newOpening}</dd></div>
        <div><dt>Rebuilding</dt><dd>{kpis.rebuilding}</dd></div>
      </dl>
    </div>
  );
}

function PortfolioReporting({ kpis, reportsTotal, svKpis, lastVisitDate }) {
  const siteVisits = svKpis?.totalVisits ?? 0;
  const siteVisitMeta = siteVisits > 0 && lastVisitDate ? `Last ${formatDate(lastVisitDate)}` : 'No visits yet';

  return (
    <div className="dashboard-portfolio-column dashboard-portfolio-reporting-column">
      <h2>Reporting &amp; Site Visits</h2>
      <div className="dashboard-portfolio-reporting-grid">
        <div>
          <span>Reports This Week</span>
          <strong>{kpis.reportsThisWeek}</strong>
          <small>{reportsTotal} total</small>
        </div>
        <div>
          <span>Site Visits</span>
          <strong>{siteVisits}</strong>
          <small>{siteVisitMeta}</small>
        </div>
      </div>
      {kpis.total > 0 && kpis.missing > 0 && (
        <p className="dashboard-portfolio-missing-callout">
          {kpis.missing} of {kpis.total} projects missing current reporting
        </p>
      )}
    </div>
  );
}

/**
 * Compact Portfolio Overview surface. All values are existing canonical model
 * outputs; the total-project status bar is a presentation-only alternative to
 * the donut for portfolios of five projects or fewer.
 */
export function PortfolioSummaryPanel({ rows, allRows = [], kpis, reportsTotal, svKpis, lastVisitDate }) {
  const { analytics, donutCounts, donutTotal } = useDashboardSummaryPanelModel(rows, allRows);

  return (
    <>
      {analytics?.mcRiskyCount > 0 && (
        <div className="dashboard-portfolio-monte-carlo-warning">
          <strong><Icon name="warning" size={14} /> Monte Carlo Warning:</strong>
          <span>{analytics.mcRiskyCount} project{analytics.mcRiskyCount > 1 ? 's' : ''} have &lt;50% probability of opening on time</span>
        </div>
      )}
      <section className="dashboard-portfolio-panel" aria-label="Portfolio overview summary">
        <PortfolioHealth counts={donutCounts} total={donutTotal} />
        <PortfolioScope kpis={kpis} />
        <PortfolioReporting
          kpis={kpis}
          reportsTotal={reportsTotal}
          svKpis={svKpis}
          lastVisitDate={lastVisitDate}
        />
      </section>
    </>
  );
}
