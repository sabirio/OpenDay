import StatusBadge from '../shared/StatusBadge.jsx';

const ITEMS = [
  { key: 'critical', label: 'Critical',           tone: 'danger'  },
  { key: 'atRisk',   label: 'At Risk',             tone: 'caution' },
  { key: 'missing',  label: 'Missing Reports',     tone: 'caution' },
  { key: 'blocked',  label: 'Blocked',             tone: 'danger'  },
  { key: 'support',  label: 'Support Required',    tone: 'info'    },
];

// Level-1 "is anything wrong?" summary for the Project Dashboard. Reuses the
// exact canonical KPI counts already computed by portfolioEngine's
// computePortfolioKpis (the same numbers SummaryPanel/StatusMatrix consume)
// — no new calculation. Only nonzero signals are shown; a fully healthy
// portfolio gets one quiet positive line instead of five zero-value tiles.
export default function DashboardAttentionStrip({ kpis }) {
  const items = ITEMS
    .map((item) => ({ ...item, count: kpis?.[item.key] ?? 0 }))
    .filter((item) => item.count > 0);

  if (items.length === 0) {
    return (
      <div className="dashboard-attention-strip is-clear" role="status">
        <StatusBadge tone="positive">All clear</StatusBadge>
        <span>No projects currently need attention.</span>
      </div>
    );
  }

  return (
    <div className="dashboard-attention-strip" role="status" aria-label="Portfolio attention summary">
      {items.map((item) => (
        <span key={item.key} className="dashboard-attention-chip">
          <StatusBadge tone={item.tone}>{item.count}</StatusBadge>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
