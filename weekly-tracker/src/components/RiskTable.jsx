import { RISK_COLORS } from "../engines/riskEngine";
import { getScoreTier, SCORE_TIER_COLORS, getScheduleDeviationColor } from "../config/statusColors";
import { RiskBadge, HealthBadge } from "./RiskGauge";
import { MiniRiskSparkline } from "./ScoreBar";

const SCHED_STATUS_COLOR = {
  "On Track": "var(--status-done)",
  "At Risk":  "var(--status-warn)",
  "Delayed":  "var(--status-alert)",
  "Critical": "var(--status-alert)",
};

const FACTOR_TOOLTIPS = {
  "Risk scale":          "Project size increases base risk",
  "Activities blocked":  "Active blockers on site",
  "Risk indicators":     "Flagged risk signals in reports",
  "Opening proximity":   "Opening date within 30 days",
  "Support required":    "Escalation or support needed",
};

function factorColor(pts) {
  if (pts < 0)  return { bar: "var(--status-done)",  badge: "var(--status-done-bg)",  text: "var(--status-done)"  };
  if (pts >= 12) return { bar: "var(--status-alert)", badge: "var(--status-alert-bg)", text: "var(--status-alert)" };
  if (pts >= 8)  return { bar: "var(--status-warn)",  badge: "var(--status-warn-bg)",  text: "var(--status-warn)"  };
  return         { bar: "var(--text-muted)",           badge: "var(--bg-elevated)",     text: "var(--text-muted)"   };
}

function levelBorderColor(level) {
  if (level === "HIGH" || level === "CRITICAL") return "var(--status-alert)";
  if (level === "MEDIUM") return "var(--status-warn)";
  return "var(--border)";
}

export function RiskTable({ sortedByRisk, expandedRow, setExpandedRow }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            {["Project", "Health", "Risk Score", "Level", "Top Risk Driver", "Pred. Delay", "Trend", "Contractor"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedByRisk.map(row => {
            const { project, riskScore, schedDev, trend, contScore, evolution, escalations, confidence, actions, health } = row;
            const c = riskScore.color;
            const topFactor = riskScore.factors.filter(f => f.pts > 0).sort((a, b) => b.pts - a.pts)[0];
            const isExp = expandedRow === project.id;
            const borderColor = levelBorderColor(riskScore.level);
            const { totalScore } = riskScore;

            return [
              /* ── Collapsed row ── */
              <tr
                key={project.id}
                onClick={() => setExpandedRow(isExp ? null : project.id)}
                style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: isExp ? "var(--status-done-bg)" : "transparent" }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = "var(--accent-subtle)"; }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "transparent"; }}
              >
                {/* Project — left border accent here (tr border-left unreliable with collapse) */}
                <td style={{ padding: "10px 10px", borderLeft: `3px solid ${borderColor}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{project.storeCode}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{project.shoppingMallName}</div>
                  </div>
                </td>

                {/* Health */}
                <td style={{ padding: "10px 10px" }}><HealthBadge {...health} /></td>

                {/* Risk Score + Confidence */}
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ width: 44, height: 28, borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: c.text }}>{riskScore.score}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: confidence.color, textTransform: "uppercase", textAlign: "center", marginTop: 3 }}>{confidence.level}</div>
                </td>

                {/* Level */}
                <td style={{ padding: "10px 10px" }}><RiskBadge level={riskScore.level} /></td>

                {/* Top driver */}
                <td style={{ padding: "10px 10px", fontSize: 12, color: "var(--text-secondary)" }}>{topFactor ? topFactor.name : "—"}</td>

                {/* Pred. Delay */}
                <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, color: schedDev?.predictedDelayDays > 0 ? "var(--status-alert)" : "var(--status-done)" }}>
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
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Perf</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: SCORE_TIER_COLORS[getScoreTier(contScore.performanceScore)] }}>{contScore.performanceScore}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Acc</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: SCORE_TIER_COLORS[getScoreTier(contScore.pmAlignmentScore)] }}>{contScore.pmAlignmentScore}</div>
                    </div>
                  </div>
                </td>
              </tr>,

              /* ── Expanded row ── */
              isExp && (
                <tr key={`${project.id}-exp`} style={{ background: "var(--accent-subtle)" }}>
                  <td colSpan={8} style={{ padding: "0 12px 20px 12px", borderLeft: `3px solid ${borderColor}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, paddingTop: 16 }}>

                      {/* ── Col 1: Risk Factors ── */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Risk Factors</div>
                        {riskScore.factors.map((f, i) => {
                          const fc  = factorColor(f.pts);
                          const barW = Math.min(100, Math.round((Math.abs(f.pts) / 20) * 100));
                          return (
                            <div key={i} style={{ marginBottom: 9 }} title={FACTOR_TOOLTIPS[f.name]}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{f.name}</span>
                                <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 5, background: fc.badge, color: fc.text, flexShrink: 0, marginLeft: 6 }}>
                                  {f.pts < 0 ? `−${Math.abs(f.pts)}` : `+${f.pts}`}
                                </span>
                              </div>
                              <div style={{ background: "var(--border)", borderRadius: 3, height: 4, overflow: "hidden" }}>
                                <div style={{ width: `${barW}%`, height: "100%", background: fc.bar, borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>Total score</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: c.text }}>{totalScore}</span>
                        </div>
                      </div>

                      {/* ── Col 2: Schedule + Contractor ── */}
                      <div>
                        {schedDev && (
                          <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Schedule</div>
                            {[
                              { label: "Expected",    value: `${schedDev.expectedPct}%`,  color: "var(--text-secondary)" },
                              { label: "Actual",      value: `${schedDev.actualPct}%`,    color: "var(--text-secondary)" },
                              { label: "Deviation",   value: schedDev.deviationPct > 0 ? `−${schedDev.deviationPct}%` : "On track", color: getScheduleDeviationColor(schedDev.deviationPct) },
                              schedDev.predictedDelayDays > 0 && { label: "Pred. delay", value: `+${schedDev.predictedDelayDays}d`, color: "var(--status-alert)" },
                            ].filter(Boolean).map(({ label, value, color }) => (
                              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                              </div>
                            ))}
                            <div style={{ height: 16 }} />
                          </>
                        )}

                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Contractor Scores</div>
                        {[
                          { label: "Performance", pts: contScore.performanceScore },
                          { label: "PM Alignment", pts: contScore.pmAlignmentScore },
                        ].map(({ label, pts }) => {
                          const barColor = SCORE_TIER_COLORS[getScoreTier(pts)];
                          return (
                            <div key={label} style={{ marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                                <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{pts}/100</span>
                              </div>
                              <div style={{ background: "var(--border)", borderRadius: 3, height: 5, overflow: "hidden" }}>
                                <div style={{ width: `${pts}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Col 3: Root Cause + Escalations ── */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Root Cause Breakdown</div>
                        {riskScore.rootCause && riskScore.rootCause.length > 0 ? riskScore.rootCause.map(({ cat, pct }, i) => {
                          const barColor = i === 0 ? "var(--status-alert)" : i === 1 ? "var(--status-warn)" : "var(--text-muted)";
                          const textColor = i < 2 ? "var(--text-secondary)" : "var(--text-muted)";
                          return (
                            <div key={cat} style={{ marginBottom: 9 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: textColor }}>{cat}</span>
                                <span style={{ fontWeight: 700, color: barColor }}>{pct}%</span>
                              </div>
                              <div style={{ background: "var(--border)", borderRadius: 3, height: 4, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        }) : (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No data</div>
                        )}

                        {escalations.length > 0 && (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Escalations</div>
                            {escalations.map((e, i) => (
                              <div key={i} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: RISK_COLORS[e.severity].bg, color: RISK_COLORS[e.severity].text, border: `1px solid ${RISK_COLORS[e.severity].border}`, marginBottom: 4 }}>
                                ⚠ {e.label} · {e.weeks}w
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── Col 4: Recommended Actions ── */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Recommended Actions</div>
                        {actions && actions.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {actions.map((a, i) => {
                              const isHigh = a.priority === "HIGH";
                              const bg     = isHigh ? "var(--status-alert-bg)" : "var(--status-warn-bg)";
                              const text   = isHigh ? "var(--status-alert)"    : "var(--status-warn)";
                              return (
                                <div key={i} style={{ padding: "9px 11px", borderRadius: 9, background: bg, border: "1px solid var(--border)" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: text, textTransform: "uppercase", background: "var(--border)", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>{a.priority}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: text, lineHeight: 1.3 }}>{a.action}</span>
                                  </div>
                                  <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5 }}>{a.reason}</div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No actions required</div>
                        )}
                      </div>

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
