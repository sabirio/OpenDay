import { getScoreTier } from '../../config/statusColors';
import { formatScheduleGapPp } from '../../hooks/useProgressPresentation';

const SCORE_TIER_TONE = { good: 'good', warn: 'warning', critical: 'critical' };
const EMPTY_VALUE = '—';

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
  if (delta === null || delta === undefined) return EMPTY_VALUE;
  if (delta > 0) return `+${delta}pp`;
  if (delta < 0) return `${delta}pp`;
  return '0pp';
}

function vsPlanLabel(progressComparison, selectedProgress) {
  if (selectedProgress === null) return EMPTY_VALUE;
  if (!progressComparison?.scheduleStatus) return EMPTY_VALUE;
  if (progressComparison.scheduleStatus === 'ahead') return `Ahead ${formatScheduleGapPp(progressComparison.scheduleGap)}pp`;
  if (progressComparison.scheduleStatus === 'behind') return `Behind ${formatScheduleGapPp(progressComparison.scheduleGap)}pp`;
  if (progressComparison.scheduleStatus === 'on_track') return 'On track';
  return EMPTY_VALUE;
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
  const risk = report?.riskScale || EMPTY_VALUE;
  const blocked = report?.activitiesBlocked || EMPTY_VALUE;
  const support = report?.supportRequired || EMPTY_VALUE;
  const additionalWorksCount = additionalWorksList?.entries?.length ?? 0;
  const missingReports = portfolioKpis?.missingCount ?? 0;
  const vsPlan = vsPlanLabel(progressComparison, selectedProgress);

  return (
    <div className="ds-data-surface weekly-truth-scroll">
      <section className="weekly-truth-bar" aria-label="Report truth summary">
      <div className="weekly-truth-group weekly-truth-group-progress" aria-label="Progress signals">
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
      </div>

      <div className="weekly-truth-group weekly-truth-group-validation" aria-label="Validation signals">
        <TruthCell
          label="PM match"
          value={matchRate !== null && matchRate !== undefined ? `${matchRate}%` : EMPTY_VALUE}
          sub={svKpis?.totalVisits > 0 ? `${svKpis.totalVisits} visit${svKpis.totalVisits === 1 ? '' : 's'}` : 'not verified'}
          tone={matchRate === null || matchRate === undefined ? 'warning' : SCORE_TIER_TONE[getScoreTier(matchRate)]}
        />
      </div>

      <div className="weekly-truth-group weekly-truth-group-issues" aria-label="Issue signals">
        <TruthCell label="Risk" value={risk} tone={risk === EMPTY_VALUE ? 'quiet' : risk === 'High' ? 'critical' : 'warning'} />
        <TruthCell label="Blocked" value={blocked} tone={blocked === 'Yes' ? 'critical' : blocked === 'No' ? 'quiet' : 'neutral'} />
        <TruthCell label="Support" value={support} tone={support === 'Yes' ? 'warning' : support === 'No' ? 'quiet' : 'neutral'} />
        <TruthCell label="Add. works" value={additionalWorksCount} sub={additionalWorksList?.total || null} tone={additionalWorksCount > 0 ? 'warning' : 'quiet'} />
        <TruthCell label="Missing reports" value={missingReports} tone={missingReports > 0 ? 'critical' : 'quiet'} />
      </div>
      </section>
    </div>
  );
}
