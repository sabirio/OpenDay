import { computePmAlignmentItems } from './pmAlignmentEngine.js';
import { computeCumulativeStatuses, computeWPCumulativeStatuses } from '../utils/reportUtils.js';
import { calculateProjectProgressResult } from './progressEngine.js';

/** Temporary adapter preserving the existing item-level PM mismatch inputs. */
export function buildLegacyRiskCompatibilityInput(reports = [], siteVisits = []) {
  if (!reports.length || !siteVisits.length) return null;
  const sortedReports = [...reports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
  const latestReport = sortedReports.at(-1);
  const latestVisit = [...siteVisits].sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))[0];
  const visitDate = new Date(latestVisit.visitDate || latestVisit.submittedAt);
  const reportAtVisit = sortedReports.filter(report => new Date(report.reportingDate || report.submittedAt) <= visitDate).at(-1) || latestReport;
  const items = computePmAlignmentItems(reportAtVisit, latestVisit);
  return {
    overstatedCount: items.filter(item => item.overstate).length,
    pmScheduleAssessment: latestVisit.pmScheduleAssessment,
    contractorScheduleStatus: latestReport.projectScheduleStatus,
  };
}

/** Historical trend adapter retained until progress-history replay is canonical. */
export function computeLegacyRiskTrend(sortedReports) {
  if (sortedReports.length < 2) return { trend: 'Insufficient data', icon: '—', color: 'var(--text-muted)', avgDiff: 0 };
  const points = sortedReports.map((_, i) => {
    const slice = sortedReports.slice(0, i + 1);
    return calculateProjectProgressResult(computeWPCumulativeStatuses(slice), computeCumulativeStatuses(slice)).progress;
  });
  const recent = points.slice(-Math.min(4, points.length));
  const diffs = recent.slice(1).map((value, i) => value - recent[i]);
  if (!diffs.length) return { trend: 'Insufficient data', icon: '—', color: 'var(--text-muted)', avgDiff: 0 };
  const avgDiff = Math.round(diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length);
  const lastDiff = diffs.at(-1);
  const prevAvg = diffs.length >= 2 ? diffs.slice(0, -1).reduce((sum, diff) => sum + diff, 0) / (diffs.length - 1) : avgDiff;
  const velocitySlowing = diffs.length >= 2 && lastDiff < prevAvg - 2;
  if (avgDiff >= 5) return { trend: 'Improving', icon: '↑', color: 'var(--status-done)', avgDiff };
  if (avgDiff >= 1) return { trend: velocitySlowing ? 'Acceleration Loss' : 'Stable', icon: velocitySlowing ? '⚡' : '→', color: velocitySlowing ? 'var(--status-warn)' : 'var(--accent)', avgDiff };
  if (avgDiff >= -2) return { trend: 'Stalling', icon: '⚠', color: 'var(--status-warn)', avgDiff };
  return { trend: 'Deteriorating', icon: '↓', color: 'var(--status-alert)', avgDiff };
}
