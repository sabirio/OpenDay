import { MAX_RISK_SCORE } from "../../hooks/useRiskLevelPresentation";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";

export default function CriticalWarnings({ rows, Glyph }) {
  if (rows.length === 0) return null;

  return (
    <section className="risk-critical-warnings" aria-label="Critical project warnings">
      <div className="risk-critical-heading">
        <span><Glyph name="alert" size={18} /></span>
        <strong>Early warning · {rows.length} critical project{rows.length > 1 ? "s" : ""} require immediate action</strong>
      </div>
      <div className="risk-critical-list">
        {rows.map(({ project, riskScore, schedDev, latestReport, daysToOpening }) => {
          const dTo = daysToOpening;
          return (
            <div key={project.id} className="risk-critical-row">
              <strong>{project.storeCode} — {project.shoppingMallName}</strong>
              <span>Risk score <b>{riskScore.score} / {MAX_RISK_SCORE}</b></span>
              {schedDev?.predictedDelayDays > 0 && <span>Predicted delay <b>+{schedDev.predictedDelayDays} days</b></span>}
              {dTo !== null && <span className={dTo < 0 ? 'is-alert' : 'is-warning'}>{dTo < 0 ? <><Glyph name="block" /> {daysOverdueCount(dTo)}d overdue</> : <><Glyph name="calendar" /> {dTo}d to opening</>}</span>}
              {latestReport?.activitiesBlocked === "Yes" && <span className="is-alert"><Glyph name="block" /> Activities blocked</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
