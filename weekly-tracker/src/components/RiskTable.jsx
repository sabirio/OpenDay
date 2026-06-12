import { RISK_COLORS } from "../engines/riskEngine";
import { RiskBadge, HealthBadge } from "./RiskGauge";
import { FactorPill, MiniRiskSparkline, ScoreBar } from "./ScoreBar";

const SCHED_STATUS_COLOR = {
  "On Track": "#22c55e",
  "At Risk":  "#f59e0b",
  "Delayed":  "#dc2626",
  "Critical": "#991b1b",
};

export function RiskTable({ sortedByRisk, expandedRow, setExpandedRow }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            {["Project", "Health", "Risk Score", "Level", "Top Risk Driver", "Pred. Delay", "Trend", "Contractor"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedByRisk.map(row => {
            const { project, riskScore, schedDev, trend, contScore, evolution, escalations, confidence, actions, health } = row;
            const c = riskScore.color;
            const topFactor = riskScore.factors.filter(f => f.pts > 0).sort((a, b) => b.pts - a.pts)[0];
            const isExp = expandedRow === project.id;
            return [
              <tr key={project.id} onClick={() => setExpandedRow(isExp ? null : project.id)}
                style={{ borderBottom: "1px solid #e5e7eb", cursor: "pointer", background: isExp ? "#f9fafb" : "#ffffff" }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = "#fff7ed"; }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "#ffffff"; }}>

                {/* Project */}
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 3, height: 18, borderRadius: 2, background: c.text, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>{project.storeCode}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{project.shoppingMallName}</div>
                    </div>
                  </div>
                </td>

                {/* Health */}
                <td style={{ padding: "10px 10px" }}>
                  <HealthBadge {...health} />
                </td>

                {/* Risk Score + Confidence */}
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ width: 44, height: 28, borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: c.text }}>{riskScore.score}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: confidence.color, textTransform: "uppercase", textAlign: "center", marginTop: 3 }}>{confidence.level}</div>
                </td>

                {/* Level */}
                <td style={{ padding: "10px 10px" }}><RiskBadge level={riskScore.level} /></td>

                {/* Top driver */}
                <td style={{ padding: "10px 10px", fontSize: 12, color: "#374151" }}>{topFactor ? topFactor.name : "—"}</td>

                {/* Pred. Delay */}
                <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, color: schedDev?.predictedDelayDays > 0 ? "#dc2626" : "#22c55e" }}>
                  {schedDev?.predictedDelayDays > 0 ? `+${schedDev.predictedDelayDays}d` : "On track"}
                </td>

                {/* Trend */}
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 16, color: trend.color }}>{trend.icon}</span>
                    <MiniRiskSparkline points={evolution} />
                  </div>
                </td>

                {/* Contractor */}
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>Perf</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: contScore.performanceScore >= 80 ? "#22c55e" : contScore.performanceScore >= 60 ? "#f59e0b" : "#dc2626" }}>{contScore.performanceScore}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>Acc</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: contScore.pmAlignmentScore >= 80 ? "#22c55e" : contScore.pmAlignmentScore >= 60 ? "#f59e0b" : "#dc2626" }}>{contScore.pmAlignmentScore}</div>
                    </div>
                  </div>
                </td>
              </tr>,

              /* Expanded row */
              isExp && (
                <tr key={`${project.id}-exp`} style={{ background: "#f9fafb" }}>
                  <td colSpan={8} style={{ padding: "0 10px 16px 10px" }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 12 }}>

                      {/* Risk factors */}
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Risk Factors</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {riskScore.factors.map((f, i) => <FactorPill key={i} f={f} />)}
                        </div>
                      </div>

                      {/* Schedule */}
                      {schedDev && (
                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Schedule</div>
                          {[
                            { label: "Expected", value: `${schedDev.expectedPct}%`, color: "#374151" },
                            { label: "Actual",   value: `${schedDev.actualPct}%`,   color: "#374151" },
                            { label: "Deviation", value: schedDev.deviationPct > 0 ? `−${schedDev.deviationPct}%` : "On track", color: schedDev.deviationPct > 15 ? "#dc2626" : schedDev.deviationPct > 5 ? "#d97706" : "#22c55e" },
                            schedDev.predictedDelayDays > 0 && { label: "Pred. delay", value: `+${schedDev.predictedDelayDays}d`, color: "#dc2626" },
                          ].filter(Boolean).map(({ label, value, color }) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
                              <span style={{ fontSize: 12, color: "#9ca3af" }}>{label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Escalations */}
                      {escalations.length > 0 && (
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Escalations</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {escalations.map((e, i) => (
                              <div key={i} style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: RISK_COLORS[e.severity].bg, color: RISK_COLORS[e.severity].text, border: `1px solid ${RISK_COLORS[e.severity].border}` }}>
                                ⚠ {e.label} · {e.weeks}w
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Contractor scores */}
                      <div style={{ minWidth: 200 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Contractor Scores</div>
                        <ScoreBar label="Performance" pts={contScore.performanceScore} max={100} color={contScore.performanceScore >= 80 ? "#22c55e" : contScore.performanceScore >= 60 ? "#f59e0b" : "#dc2626"} />
                        <ScoreBar label="PM Alignment Score" pts={contScore.pmAlignmentScore} max={100} color={contScore.pmAlignmentScore >= 80 ? "#22c55e" : contScore.pmAlignmentScore >= 60 ? "#f59e0b" : "#dc2626"} />
                      </div>

                      {/* Root Cause */}
                      {riskScore.rootCause && riskScore.rootCause.length > 0 && (
                        <div style={{ minWidth: 180 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Root Cause</div>
                          {riskScore.rootCause.map(({ cat, pct }) => (
                            <div key={cat} style={{ marginBottom: 6 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                                <span style={{ color: "#9ca3af" }}>{cat}</span>
                                <span style={{ fontWeight: 700, color: "#374151" }}>{pct}%</span>
                              </div>
                              <div style={{ background: "#e5e7eb", borderRadius: 3, height: 5, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: "#6366f1", borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Recommended Actions */}
                      {actions && actions.length > 0 && (
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Recommended Actions</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {actions.map((a, i) => {
                              const ac = a.priority === "HIGH" ? { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" } : { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" };
                              return (
                                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 8px", borderRadius: 7, background: ac.bg, border: `1px solid ${ac.border}` }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: ac.text, textTransform: "uppercase", marginTop: 2, flexShrink: 0 }}>{a.priority}</span>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: ac.text }}>{a.action}</div>
                                    <div style={{ fontSize: 10, color: "#9ca3af" }}>{a.reason}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export { SCHED_STATUS_COLOR };
