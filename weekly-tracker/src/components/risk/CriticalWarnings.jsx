import { MAX_RISK_SCORE } from "../../hooks/useRiskLevelPresentation";
import { daysOverdueCount } from "../../hooks/useOpeningReadinessPresentation";

export default function CriticalWarnings({ rows, Glyph }) {
  if (rows.length === 0) return null;

  return (
    <div style={{ background: "var(--status-alert-bg)", border: "1.5px solid var(--status-alert)", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ color: "var(--status-alert)", display: "inline-flex", alignItems: "center" }}><Glyph name="alert" size={18} /></span>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--status-alert)" }}>EARLY WARNING - {rows.length} CRITICAL PROJECT{rows.length > 1 ? "S" : ""} REQUIRE IMMEDIATE ACTION</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {rows.map(({ project, riskScore, schedDev, latestReport, daysToOpening }) => {
          const dTo = daysToOpening;
          return (
            <div key={project.id} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 240 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--status-alert)", marginBottom: 6 }}>{project.storeCode} - {project.shoppingMallName}</div>
              <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>Risk Score: <strong style={{ color: "var(--status-alert)" }}>{riskScore.score} / {MAX_RISK_SCORE}</strong></div>
              {schedDev?.predictedDelayDays > 0 && <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>Predicted delay: <strong style={{ color: "var(--status-alert)" }}>+{schedDev.predictedDelayDays} days</strong></div>}
              {dTo !== null && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: dTo < 0 ? "var(--status-alert)" : "var(--status-warn)" }}>{dTo < 0 ? <><Glyph name="block" /> {daysOverdueCount(dTo)}d OVERDUE</> : <><Glyph name="calendar" /> {dTo}d to opening</>}</div>}
              {latestReport?.activitiesBlocked === "Yes" && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--status-alert)", marginTop: 4 }}><Glyph name="block" /> Activities blocked</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
