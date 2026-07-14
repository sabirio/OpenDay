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
