import { getScoreTier } from '../../config/statusColors';
import { formatScheduleGapPp } from '../../hooks/useProgressPresentation';

const SCORE_TIER_TONE = { good: 'good', warn: 'warning', critical: 'critical' };

function TruthCell({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`weekly-truth-cell tone-${tone}`}>
      <div className="weekly-truth-label">{label}</div>
      <div className="weekly-truth-value">{value}</div>
      {sub && <div className="weekly-truth-sub">{sub}</div>}
    </div>
  );
}

function deltaLabel(delta) {
  if (delta === null || delta === undefined) return '—';
  if (delta > 0) return `+${delta}pp`;
  if (delta < 0) return `${delta}pp`;
  return '0pp';
}

function vsPlanLabel(progressComparison, selectedProgress) {
  if (selectedProgress === null) return '—';
  if (!progressComparison?.scheduleStatus) return '—';
  if (progressComparison.scheduleStatus === 'ahead') return `Ahead ${formatScheduleGapPp(progressComparison.scheduleGap)}pp`;
  if (progressComparison.scheduleStatus === 'behind') return `Behind ${formatScheduleGapPp(progressComparison.scheduleGap)}pp`;
  if (progressComparison.scheduleStatus === 'on_track') return 'On track';
  return '—';
}

export default function ReportTruthBar({
  overallProgress,
  progressComparison,
  selectedProgress,
  svKpis,
  report,
  portfolioKpis,
  additionalWorksList,
}) {
  const delta = progressComparison?.deltaVsLastWeek;
  const matchRate = svKpis?.overallMatchRate;
  const risk = report?.riskScale || '—';
  const blocked = report?.activitiesBlocked || '—';
  const support = report?.supportRequired || '—';
  const additionalWorksCount = additionalWorksList?.entries?.length ?? 0;
  const missingReports = portfolioKpis?.missingCount ?? 0;
  const vsPlan = vsPlanLabel(progressComparison, selectedProgress);

  return (
    <section className="weekly-truth-bar" aria-label="Report truth summary">
      <TruthCell label="Progress" value={`${overallProgress}%`} tone="accent" />
      <TruthCell
        label="This week"
        value={deltaLabel(delta)}
        tone={delta > 0 ? 'good' : delta < 0 ? 'critical' : 'neutral'}
      />
      <TruthCell
        label="Vs plan"
        value={vsPlan}
        tone={progressComparison?.scheduleStatus === 'behind' ? 'critical' : progressComparison?.scheduleStatus === 'ahead' ? 'good' : 'neutral'}
      />
      <TruthCell
        label="PM match"
        value={matchRate !== null && matchRate !== undefined ? `${matchRate}%` : '—'}
        sub={svKpis?.totalVisits > 0 ? `${svKpis.totalVisits} visit${svKpis.totalVisits === 1 ? '' : 's'}` : 'not verified'}
        tone={matchRate === null || matchRate === undefined ? 'warning' : SCORE_TIER_TONE[getScoreTier(matchRate)]}
      />
      <TruthCell label="Risk" value={risk} tone={risk === '—' ? 'neutral' : risk === 'High' ? 'critical' : 'warning'} />
      <TruthCell label="Blocked" value={blocked} tone={blocked === 'Yes' ? 'critical' : blocked === 'No' ? 'good' : 'neutral'} />
      <TruthCell label="Support" value={support} tone={support === 'Yes' ? 'warning' : support === 'No' ? 'good' : 'neutral'} />
      <TruthCell label="Add. works" value={additionalWorksCount} sub={additionalWorksList?.total || null} tone={additionalWorksCount > 0 ? 'warning' : 'good'} />
      <TruthCell label="Missing reports" value={missingReports} tone={missingReports > 0 ? 'critical' : 'good'} />
    </section>
  );
}
