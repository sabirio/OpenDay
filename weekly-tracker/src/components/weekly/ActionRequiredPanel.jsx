function ActionRow({ label, value, tone = 'neutral', detail }) {
  return (
    <div className={`weekly-action-row tone-${tone}`}>
      <div>
        <div className="weekly-action-label">{label}</div>
        {detail && <div className="weekly-action-detail">{detail}</div>}
      </div>
      <span className="weekly-action-value">{value}</span>
    </div>
  );
}

export default function ActionRequiredPanel({ report, svKpis, portfolioKpis, additionalWorksList }) {
  if (!report) return null;

  const riskItems = (report.risks || []).filter(Boolean);
  const hasRisk = riskItems.length > 0 || report.riskDescription || report.riskScale;
  const hasBlocked = report.activitiesBlocked === 'Yes';
  const hasSupport = report.supportRequired === 'Yes';
  const hasAdditionalWorks = (additionalWorksList?.entries?.length ?? 0) > 0;
  const missingReports = portfolioKpis?.missingCount ?? 0;
  const hasPmVisit = (svKpis?.totalVisits ?? 0) > 0;
  const hasPhotos = (report.photos || []).length > 0;
  const allClear = !hasRisk && !hasBlocked && !hasSupport && !hasAdditionalWorks && missingReports === 0 && hasPmVisit && hasPhotos;

  return (
    <aside className="weekly-action-panel" aria-label="Action required">
      <div className="weekly-section-kicker">Action required</div>
      <h2>PM attention queue</h2>

      {allClear ? (
        <div className="weekly-action-clear">
          <strong>All clear</strong>
          <span>No risk, blocker, support, additional works, missing report, or evidence gap is visible on this report.</span>
        </div>
      ) : (
        <div className="weekly-action-list">
          {hasBlocked && (
            <ActionRow label="Activities blocked" value="Yes" tone="critical" detail={report.delayReason || 'Delay reason not provided'} />
          )}
          {hasRisk && (
            <ActionRow label="Risks" value={report.riskScale || riskItems.length || 'Reported'} tone={report.riskScale === 'High' ? 'critical' : 'warning'} detail={riskItems.join(', ') || report.riskDescription || 'Risk noted'} />
          )}
          {hasSupport && (
            <ActionRow label="Client support" value="Required" tone="warning" detail={(report.supportTypes || []).filter(Boolean).join(', ') || report.supportDescription || 'Support requested'} />
          )}
          {hasAdditionalWorks && (
            <ActionRow label="Additional works" value={additionalWorksList.entries.length} tone="warning" detail={additionalWorksList.total ? `${additionalWorksList.total} total` : 'Cost not totaled'} />
          )}
          {missingReports > 0 && (
            <ActionRow label="Missing reports" value={missingReports} tone="critical" detail="Open the missing reports list from the Truth Bar." />
          )}
          {!hasPmVisit && (
            <ActionRow label="PM verification" value="Missing" tone="warning" detail="No PM site visit is attached to this report yet." />
          )}
          {!hasPhotos && (
            <ActionRow label="Photo evidence" value="Missing" tone="warning" detail="No photos are attached to this contractor report." />
          )}
        </div>
      )}
    </aside>
  );
}
