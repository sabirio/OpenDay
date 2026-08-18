import { Link } from "react-router-dom";
import { useProjectCurrentSituationPresentation } from "../../hooks/useProjectCurrentSituationPresentation.js";
import StatusBadge from "../shared/StatusBadge.jsx";

export default function ProjectCurrentSituation({ project, daysLeft, returnState }) {
  const situation = useProjectCurrentSituationPresentation(project, { daysLeft });

  return (
    <div className="project-current-situation">
      <section className="project-situation-intro" aria-labelledby="current-situation-title">
        <div className="project-situation-intro-heading">
          <div>
            <p className="project-situation-eyebrow">Current situation</p>
            <h2 id="current-situation-title">{situation.stage}</h2>
          </div>
          <StatusBadge tone="info">Project overview</StatusBadge>
        </div>

        <div className="project-situation-recommendation">
          <span>Recommended next step</span>
          <strong>{situation.recommendation.title}</strong>
          <p>{situation.recommendation.reason}</p>
        </div>

        <div className="project-situation-summary-grid">
          {situation.summaries.map((summary) => (
            <article className="project-situation-summary" key={summary.label}>
              <span>{summary.label}</span>
              <div>
                <StatusBadge tone={summary.tone}>{summary.value}</StatusBadge>
              </div>
              <p>{summary.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="project-situation-groups">
        {situation.groups.map((group) => (
          <section className="project-situation-group" key={group.id} aria-labelledby={`situation-${group.id}`}>
            <header>
              <div>
                <h3 id={`situation-${group.id}`}>{group.title}</h3>
                <p>{group.description}</p>
              </div>
              <span>{group.actions.length} {group.actions.length === 1 ? "action" : "actions"}</span>
            </header>
            <div className="project-situation-action-list">
              {group.actions.map((item) => (
                <article className="project-situation-action" key={item.href}>
                  <div className="project-situation-action-copy">
                    <div>
                      <strong>{item.label}</strong>
                      <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                    </div>
                    <p>{item.description}</p>
                  </div>
                  <Link className="btn btn-secondary" to={item.href} state={returnState}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
