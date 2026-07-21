import { buildSiteSnagOverview } from '../../../hooks/snags/useSnagPresentation.js';

function Metric({ label, value, hint }) {
  return (
    <div className="site-snag-metric">
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{hint}</small>
    </div>
  );
}

function Breakdown({ title, items }) {
  return (
    <section className="site-snag-breakdown" aria-labelledby={`${title.replaceAll(' ', '-').toLowerCase()}-heading`}>
      <h2 id={`${title.replaceAll(' ', '-').toLowerCase()}-heading`}>{title}</h2>
      {items.length === 0 ? <p>No Observation data is available.</p> : (
        <ol>
          {items.map((item) => (
            <li key={item.label}>
              <div><span>{item.label}</span><strong>{item.count}</strong></div>
              <span className="site-snag-breakdown-track" aria-hidden="true">
                <span style={{ width: `${item.relativePercent}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function SiteSnagOverview({ status, error, items, catalog, reload }) {
  if (status === 'loading' || catalog.status === 'loading') {
    return <div className="site-snag-section-state" role="status">Loading Observation overview…</div>;
  }
  if (status === 'error') {
    return <div className="snag-error" role="alert"><p>Observation overview could not be loaded.</p><button className="btn" onClick={reload}>Retry</button></div>;
  }
  if (catalog.status === 'error') {
    return <div className="snag-error" role="alert"><p>Trade and stakeholder breakdowns could not be loaded.</p><button className="btn" onClick={catalog.reload}>Retry</button></div>;
  }
  if (error) return null;

  const overview = buildSiteSnagOverview(items, catalog);
  if (overview.total === 0) {
    return <div className="empty-state"><h2>No Observations yet</h2><p>Use Field Snag List on site to capture the first Observation.</p></div>;
  }

  return (
    <div className="site-snag-overview">
      <section className="site-snag-metrics" aria-label="Observation overview metrics">
        <Metric label="Open Observations" value={overview.open} hint="Not closed or cancelled" />
        <Metric label="Overdue Observations" value={overview.overdue} hint="Past due and still active" />
        <Metric label="Captured Observations" value={overview.captured} hint="Private, awaiting publication" />
        <Metric label="Published Observations" value={overview.published} hint="Visible within publication rules" />
      </section>
      <div className="site-snag-breakdowns">
        <Breakdown title="Observations by Trade" items={overview.byTrade} />
        <Breakdown title="Observations by Responsible Stakeholder" items={overview.byStakeholder} />
      </div>
    </div>
  );
}
