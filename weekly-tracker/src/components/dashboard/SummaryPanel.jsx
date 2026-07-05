import { KpiCard } from './DashboardWidgets';
import Icon from '../shared/Icon';
import { formatDate } from '../../utils/reportUtils';

const DONUT_SEGMENTS = [
  { label: 'On Track',  key: 'On Track',  color: 'var(--text-primary)'  },
  { label: 'At Risk',   key: 'At Risk',   color: 'var(--status-warn)'   },
  { label: 'Delayed',   key: 'Delayed',   color: 'var(--status-warn)'   },
  { label: 'Critical',  key: 'Critical',  color: 'var(--status-alert)'  },
  { label: 'No Report', key: null,        color: 'var(--border-strong)' },
];

function SmallDonut({ counts, total }) {
  const r = 20, cx = 32, cy = 32, sw = 9;
  const circ = 2 * Math.PI * r;
  const safeTotal = Math.max(total, 1);
  const allOnTrack = total > 0 && (counts['On Track'] ?? 0) === total;

  let cumOffset = 0;
  const arcs = DONUT_SEGMENTS.map(seg => {
    const n = counts[seg.key] ?? 0;
    const segLen = (n / safeTotal) * circ;
    const dashoffset = circ - cumOffset;
    cumOffset += segLen;
    return { ...seg, n, segLen, dashoffset };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
      <svg width={96} height={96} viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
        {allOnTrack ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--text-primary)" strokeWidth={sw} />
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
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--text-primary)">{total}</text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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

export default function SummaryPanel({ kpis, reportsTotal, rows, allRows = [], projects = [], svKpis, lastVisitDate }) {
  const analytics = rows && rows.length > 0 ? (() => {
    const evmRows  = rows.filter(r => r.evm?.SPI != null);
    const avgSPI   = evmRows.length
      ? Math.round((evmRows.reduce((s, r) => s + r.evm.SPI, 0) / evmRows.length) * 100) / 100
      : null;
    const mcRiskyCount = rows.filter(r => r.monteCarlo && !r.monteCarlo.insufficient_data && r.monteCarlo.pOnTime < 50).length;
    return { avgSPI, mcRiskyCount };
  })() : null;

  const donutCounts = {
    'On Track': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'On Track').length,
    'At Risk':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'At Risk').length,
    'Delayed':  allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Delayed').length,
    'Critical': allRows.filter(r => r.latestReport?.projectScheduleStatus === 'Critical').length,
    null:       allRows.filter(r => !r.latestReport).length,
  };
  const donutTotal = allRows.length;

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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'stretch' }}>
        <KpiCard label="Total Projects"    value={kpis.total}           color="var(--text-secondary)" />
        <KpiCard label="Active"            value={kpis.active}          color="var(--status-done)"    sub={`${kpis.total - kpis.active} closed`} />
        <KpiCard label="New Opening"       value={kpis.newOpening}      color="var(--accent)"         sub="project type" />
        <KpiCard label="Rebuilding"        value={kpis.rebuilding}      color="var(--text-secondary)" sub="project type" />
        <KpiCard label="Reports This Week" value={kpis.reportsThisWeek} color="var(--accent)"         sub={`${reportsTotal} total`} />

        {svKpis && svKpis.totalVisits > 0 && (
          <KpiCard
            label="Site Visits"
            value={svKpis.totalVisits}
            color="var(--accent)"
            sub={lastVisitDate ? `Last ${formatDate(lastVisitDate)}` : 'no visits'}
          />
        )}

        {/* vertical divider */}
        {donutTotal > 0 && (
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0, margin: '0 4px' }} />
        )}

        {/* Portfolio Health donut */}
        {donutTotal > 0 && (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: '12px 16px', flexShrink: 0, minWidth: 220 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>Portfolio Health</div>
            <SmallDonut counts={donutCounts} total={donutTotal} />
          </div>
        )}
      </div>
    </>
  );
}
