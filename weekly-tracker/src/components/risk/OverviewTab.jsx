import { RISK_COLORS } from "../../config/riskConfig";
import { getOpeningUrgencyColor, getScheduleDeviationColor } from "../../config/statusColors";
import { isHighOrCriticalLevel } from "../../hooks/useRiskLevelPresentation";
import { RiskGauge, HealthBadge } from "../RiskGauge";
import { FactorPill, MiniRiskSparkline } from "../ScoreBar";
import { RiskTable } from "../RiskTable";
import EvmWidget from "../analytics/EvmWidget";
import MonteCarloWidget from "../analytics/MonteCarloWidget";
import DriftChart from "../analytics/DriftChart";
import Glyph from "./Glyph";

function OverviewTab({ sortedByRisk, expandedRow, setExpandedRow }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Risk Register table */}
      {sortedByRisk.length === 0 ? (
        <div className="dashboard-summary-card" style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
          No projects found. Add projects and submit reports to activate the risk engine.
        </div>
      ) : (
        <div className="dashboard-summary-card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 4 }}>Project Risk Register</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>All projects sorted by risk score · click row to expand details</div>
          <RiskTable sortedByRisk={sortedByRisk} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
        </div>
      )}

      {/* CRITICAL / HIGH detail cards */}
      {sortedByRisk.filter(r => isHighOrCriticalLevel(r.riskScore.level)).map(({ project, riskScore, schedDev, trend, escalations, evolution, actions, health, evm, driftProfile, monteCarlo, daysToOpening }) => {
        const c = riskScore.color;
        const dTo = daysToOpening;
        return (
          <div key={project.id} className="dashboard-summary-card" style={{ margin: 0, borderLeft: `4px solid ${c.text}`, paddingLeft: 20 }}>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flexShrink: 0 }}><RiskGauge score={riskScore.score} level={riskScore.level} color={c} /></div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)" }}>{project.storeCode} — {project.shoppingMallName}</div>
                  <HealthBadge {...health} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{[project.projectManager, project.generalContractor, project.city].filter(Boolean).join(" · ")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{riskScore.factors.map((f, i) => <FactorPill key={i} f={f} />)}</div>
                {escalations.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {escalations.map((e, i) => (
                      <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: RISK_COLORS[e.severity].bg, color: RISK_COLORS[e.severity].text, border: `1px solid ${RISK_COLORS[e.severity].border}` }}>
                        <Glyph name="alert" /> {e.label} · {e.weeks}w
                      </div>
                    ))}
                  </div>
                )}
                {actions && actions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Recommended Actions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {actions.map((a, i) => {
                        const ac = isHighOrCriticalLevel(a.priority) ? { bg: 'var(--status-alert-bg)', text: 'var(--status-alert)', border: 'var(--border)' } : { bg: 'var(--status-warn-bg)', text: 'var(--status-warn)', border: 'var(--border)' };
                        return (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 8px", borderRadius: 7, background: ac.bg, border: `1px solid ${ac.border}` }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: ac.text, textTransform: "uppercase", marginTop: 2, flexShrink: 0 }}>{a.priority}</span>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: ac.text }}>{a.action}</div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{a.reason}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {schedDev && (
                <div style={{ flexShrink: 0, background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", minWidth: 180 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 10 }}>Schedule Analysis</div>
                  {[
                    { label: "Expected", value: `${schedDev.expectedPct}%`, color: "var(--text-primary)" },
                    { label: "Actual",   value: `${schedDev.actualPct}%`,   color: "var(--text-primary)" },
                    { label: "Deviation", value: schedDev.deviationPct > 0 ? `−${schedDev.deviationPct}%` : "On track", color: getScheduleDeviationColor(schedDev.deviationPct) },
                    schedDev.predictedDelayDays > 0 && { label: "Pred. delay", value: `+${schedDev.predictedDelayDays}d`, color: "var(--status-alert)" },
                    schedDev.predictedDelayDays > 0 && schedDev.predictedOpeningDate && { label: "Pred. opening", value: schedDev.predictedOpeningDate.toLocaleDateString("en-GB"), color: "var(--status-alert)" },
                  ].filter(Boolean).map(({ label, value, color }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ flexShrink: 0, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 8 }}>Trend</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 22, color: trend.color, fontWeight: 800 }}>{trend.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: trend.color }}>{trend.trend}</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: 6 }}>Risk Evolution</div>
                <MiniRiskSparkline points={evolution} />
                {dTo !== null && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 12, fontWeight: 700, color: getOpeningUrgencyColor(dTo) }}>
                    {dTo < 0 ? <><Glyph name="block" /> {Math.abs(dTo)}d overdue</> : <><Glyph name="calendar" /> {dTo}d to open</>}
                  </div>
                )}
              </div>
            </div>
            {/* Analytics widgets — EVM · Monte Carlo · Drift */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
              <EvmWidget evm={evm} />
              <MonteCarloWidget mc={monteCarlo} />
              {driftProfile && <DriftChart driftProfile={driftProfile} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default OverviewTab;
