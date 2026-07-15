import { KpiCard } from './DashboardWidgets';
import Icon from '../shared/Icon';
import { formatDate } from '../../utils/reportUtils';
import { maxOf } from '../../hooks/useChartMathPresentation';
import { useDashboardSummaryPanelModel } from '../../hooks/useDashboardSummaryPanelModel';

const DONUT_SEGMENTS = [
  { label: 'On Track',  key: 'On Track',  color: 'var(--status-done)'   },
  { label: 'At Risk',   key: 'At Risk',   color: 'var(--status-warn)'   },
  { label: 'Delayed',   key: 'Delayed',   color: 'var(--status-warn)'   },
  { label: 'Critical',  key: 'Critical',  color: 'var(--status-alert)'  },
  { label: 'No Report', key: null,        color: 'var(--border-strong)' },
];

function SmallDonut({ counts, total }) {
  const r = 20, cx = 32, cy = 32, sw = 9;
  const circ = 2 * Math.PI * r;
  const safeTotal = maxOf([total, 1]);
  const allOnTrack = total > 0 && (counts['On Track'] ?? 0) === total;
  const onTrack = counts['On Track'] ?? 0;
  const centerLabel = allOnTrack ? '100% OK' : `${onTrack} OK`;

  let cumOffset = 0;
  const arcs = DONUT_SEGMENTS.map(seg => {
    const n = counts[seg.key] ?? 0;
    const segLen = (n / safeTotal) * circ;
    const dashoffset = circ - cumOffset;
    cumOffset += segLen;
    return { ...seg, n, segLen, dashoffset };
  });

  return (
    <div className="dashboard-donut-wrap">
      <svg width={104} height={104} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
        {allOnTrack ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--status-done)" strokeWidth={sw} />
        ) : arcs.map(({ label, color, n, segLen, dashoffset }) =>
          n > 0 ? (
            <circle
              key={label}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeDasharray={`${segLen} ${circ - segLen}`}
              strokeDashoffset={dashoffset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '32px 32px' }}
            />
          ) : null
        )}
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--text-primary)">{centerLabel}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="var(--text-muted)">{total} projects</text>
      </svg>

      <div className="dashboard-donut-legend">
        {DONUT_SEGMENTS.map(({ label, key, color }) => {
          const n = counts[key] ?? 0;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, opacity: n === 0 ? 0.3 : 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 64 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: n === 0 ? 'var(--text-muted)' : color }}>{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SummaryPanel({ kpis, reportsTotal, rows, allRows = [], svKpis, lastVisitDate }) {
  const { analytics, donutCounts, donutTotal } = useDashboardSummaryPanelModel(rows, allRows);
  const siteVisitValue = svKpis?.totalVisits ?? 0;
  const siteVisitSub = siteVisitValue > 0 && lastVisitDate ? `Last ${formatDate(lastVisitDate)}` : 'No visits yet';

  return (
    <>
      {analytics?.mcRiskyCount > 0 && (
        <div style={{
          background: 'var(--status-warn-bg)',
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--status-warn)',
          borderRadius: 10,
          padding: '8px 14px',
          marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: 'var(--status-warn)' }}>
            <Icon name="warning" size={14} /> Monte Carlo Warning:
          </span>
          <span style={{ color: 'var(--status-warn)' }}>
            {analytics.mcRiskyCount} project{analytics.mcRiskyCount > 1 ? 's' : ''} have &lt;50% probability of opening on time
          </span>
        </div>
      )}

      <div className="dashboard-kpi-row">
        <div className="dashboard-kpi-cluster">
          <div className="dashboard-kpi-cluster-title">Portfolio Scope</div>
          <div className="dashboard-kpi-mini-grid">
            <KpiCard label="Total Projects" value={kpis.total} color="var(--text-secondary)" />
            <KpiCard label="Active" value={kpis.active} color="var(--status-done)" sub={`${kpis.total - kpis.active} closed`} />
          </div>
          <div className="dashboard-kpi-meta">
            <span>{kpis.newOpening} new opening</span>
            <span>{kpis.rebuilding} rebuilding</span>
          </div>
        </div>

        <div className="dashboard-kpi-cluster">
          <div className="dashboard-kpi-cluster-title">Evidence Flow</div>
          <div className="dashboard-kpi-mini-grid">
            <KpiCard label="Reports This Week" value={kpis.reportsThisWeek} color="var(--accent)" sub={`${reportsTotal} total`} />
            <KpiCard label="Site Visits" value={siteVisitValue} color="var(--text-secondary)" sub={siteVisitSub} />
          </div>
        </div>

        <div className="dashboard-kpi-cluster dashboard-health-card">
          <div className="dashboard-kpi-cluster-title">Portfolio Health</div>
          {donutTotal > 0 ? <SmallDonut counts={donutCounts} total={donutTotal} /> : (
            <div className="empty-state" style={{ padding: 12 }}>
              <div className="empty-state__title">No health signal yet</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
