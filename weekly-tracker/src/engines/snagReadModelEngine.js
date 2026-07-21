export function deriveDueState(snag, asOf, dueSoonDays = 7) {
  if (snag.status === 'CLOSED' || snag.status === 'CANCELLED') return 'COMPLETED';
  if (!snag.dueDate) return 'NO_DUE_DATE';
  const reference = new Date(asOf);
  const today = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  const due = Date.parse(`${snag.dueDate}T00:00:00Z`);
  const days = Math.floor((due - today) / 86400000);
  return days < 0 ? 'OVERDUE' : days <= dueSoonDays ? 'DUE_SOON' : 'ON_TRACK';
}

export function filterSnags(snags, filters = {}, asOf = new Date()) {
  return [...snags].filter(snag => (!filters.projectId || String(snag.projectId) === String(filters.projectId))
    && (!filters.search || `${snag.title || ''} ${snag.location?.text || ''} ${snag.location?.room || ''}`.toLowerCase().includes(String(filters.search).toLowerCase()))
    && (!filters.publicationState || snag.publicationState === filters.publicationState)
    && (!filters.status || snag.status === filters.status) && (!filters.assigneeId || String(snag.assigneeId) === String(filters.assigneeId))
    && (!filters.activeOnly || !['CLOSED','CANCELLED'].includes(snag.status))
    && (!filters.categoryCode || snag.categoryCode === filters.categoryCode) && (!filters.disciplineCode || snag.disciplineCode === filters.disciplineCode) && (!filters.priority || snag.priority === filters.priority)
    && (!filters.zoneId || String(snag.location?.zoneId) === String(filters.zoneId)) && (!filters.createdBy || String(snag.createdBy) === String(filters.createdBy))
    && (!filters.dueState || deriveDueState(snag, asOf) === filters.dueState));
}

export function summarizeSnags(snags, key) {
  return [...snags].reduce((out, snag) => {
    const value = snag[key] ?? 'UNASSIGNED';
    out[value] = (out[value] || 0) + 1;
    return out;
  }, {});
}

function buildBreakdown(snags, key, options, labelKeys, unassignedLabel) {
  const labels = new Map((options || []).map((item) => [String(item.id), labelKeys.map((labelKey) => item[labelKey]).find(Boolean)]));
  const counts = snags.reduce((result, snag) => {
    const id = snag[key] == null ? null : String(snag[key]);
    const label = (id && labels.get(id)) || unassignedLabel;
    result.set(label, (result.get(label) || 0) + 1);
    return result;
  }, new Map());
  const rows = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const maximum = Math.max(1, ...rows.map((item) => item.count));
  return rows.map((item) => ({ ...item, relativePercent: (item.count / maximum) * 100 }));
}

export function buildSiteSnagOverview(snags, catalog = {}, asOf = new Date()) {
  const items = [...(snags || [])];
  return {
    total: items.length,
    open: items.filter((snag) => !['CLOSED', 'CANCELLED'].includes(snag.status)).length,
    overdue: items.filter((snag) => deriveDueState(snag, asOf) === 'OVERDUE').length,
    captured: items.filter((snag) => snag.publicationState === 'CAPTURED').length,
    published: items.filter((snag) => snag.publicationState === 'PUBLISHED').length,
    byTrade: buildBreakdown(items, 'tradeId', catalog.trades, ['name'], 'Trade not assigned'),
    byStakeholder: buildBreakdown(items, 'stakeholderId', catalog.stakeholders, ['company_name', 'name'], 'Stakeholder not assigned'),
  };
}
