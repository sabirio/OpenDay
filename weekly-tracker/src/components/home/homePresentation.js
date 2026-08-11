// homePresentation.js — Home-local presentation helpers.
//
// Pure functions only. Every input here is an already-computed value from
// core/home/homeDashboardModel.js (kpis/summary) or the canonical auth role
// (useAuth().role) — nothing here derives a business state, it only chooses
// how to display one. This consolidates duplication that existed across
// MorningBrief.jsx and PortfolioHealth.jsx (three copies of "pick a tone from
// a count/severity"); it is intentionally scoped to Home only, not a global
// StatusBadge/tone system.

export const TONE = {
  done:  'var(--status-done)',
  warn:  'var(--status-warn)',
  alert: 'var(--status-alert)',
  muted: 'var(--text-muted)',
};

// Highest-severity-wins tone for a critical/warning count pair.
export function severityTone({ critical = 0, warning = 0 }) {
  if (critical > 0) return TONE.alert;
  if (warning > 0) return TONE.warn;
  return TONE.done;
}

// Tone for a single "count of problems" stat — restTone when the count is
// zero (usually "good"), concernTone otherwise.
export function countTone(count, concernTone = TONE.warn, restTone = TONE.done) {
  return count > 0 ? concernTone : restTone;
}

// Whether Home has any projects at all vs. has projects but nothing flagged.
// 'empty'   — genuinely no projects yet (new tenant)
// 'healthy' — projects exist, zero critical/warning/info insights
// 'active'  — projects exist and there's at least one insight to show
export function getPortfolioState(projectCount, insightTotal) {
  if (!projectCount) return 'empty';
  if (!insightTotal) return 'healthy';
  return 'active';
}

// Role-aware display of a command's recommendedAction string. The action
// text (e.g. "Chase PM for weekly report", "Escalate to GC") is written from
// a PM's operational perspective — only PM sees it verbatim. Every other
// role that can reach Home (Admin, Viewer) sees neutral review-oriented
// wording instead, since neither is the project's PM and shouldn't be told
// to act as one.
export function displayAction(role, recommendedAction) {
  if (!recommendedAction) return null;
  return role === 'PM' ? recommendedAction : 'Needs review';
}

export function getAttentionInsights(insights = []) {
  return insights.filter(insight => insight.severity === 'critical' || insight.severity === 'warning');
}

export function getInsightDisplayTitle(insight, projects = []) {
  if (!insight) return '';
  const project = projects.find(candidate => String(candidate.id) === String(insight.projectId));
  const code = project?.storeCode;
  if (!code || insight.title.includes(code)) return insight.title;
  return `${code} — ${insight.title}`;
}

function validTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function buildRecentActivity({ projects = [], reports = [], siteVisits = [], limit = 4 }) {
  const projectsById = new Map(projects.map(project => [String(project.id), project]));
  const identify = (projectId) => {
    const project = projectsById.get(String(projectId));
    return {
      code: project?.storeCode || 'Unknown project',
      name: project?.shoppingMallName || null,
    };
  };

  const reportItems = reports.flatMap((report) => {
    const occurredAt = report.submittedAt || report.reportingDate;
    const timestamp = validTimestamp(occurredAt);
    if (timestamp === null) return [];
    return [{
      key: `report-${report.id ?? report.projectId}-${occurredAt}`,
      type: 'Weekly report',
      ...identify(report.projectId),
      action: 'submitted',
      occurredAt,
      timestamp,
    }];
  });

  const visitItems = siteVisits.flatMap((visit) => {
    const occurredAt = visit.visitDate || visit.submittedAt;
    const timestamp = validTimestamp(occurredAt);
    if (timestamp === null) return [];
    return [{
      key: `visit-${visit.id ?? visit.projectId}-${occurredAt}`,
      type: 'PM site visit',
      ...identify(visit.projectId),
      action: 'recorded',
      occurredAt,
      timestamp,
    }];
  });

  return [...reportItems, ...visitItems]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

export function formatActivityDate(value) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
