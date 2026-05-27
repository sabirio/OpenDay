import { useMemo, useState } from "react";
import { computeCumulativeStatuses, estimateProgressFromStatuses, computeWPCumulativeStatuses } from "../reportUtils";
import { computeProjectProgressFromWP } from "../config/workPackages";
import {
  RISK_COLORS, RISK_DIMENSIONS,
  computeHealthScore, computeScheduleDeviation,
  computeTrend, computeProjectRiskScore, computeDimensionRisk, computeWeeklyEvolution,
} from "../engines/riskEngine";
import { computeContractorScores, computePortfolioContractorScores } from "../engines/contractorEngine";
import { computePmAlignmentItems, computeConfidenceLevel } from "../engines/pmAlignmentEngine";
import { computeEscalations } from "../engines/escalationEngine";
import { computeRecommendedActions } from "../engines/actionEngine";
import { RiskGauge, RiskBadge, HealthBadge, DimCell } from "../components/RiskGauge";
import { FactorPill, MiniRiskSparkline, ScoreBar } from "../components/ScoreBar";
import { RiskTable } from "../components/RiskTable";

const SEV_COLORS = {
  CRITICAL: { text: "#fca5a5", bg: "#450a0a", border: "#7f1d1d" },
  HIGH:     { text: "#fdba74", bg: "#431407", border: "#c2410c" },
  MEDIUM:   { text: "#fcd34d", bg: "#422006", border: "#b45309" },
};

const VIEWS = [
  { id: "overview",     label: "Overview" },
  { id: "heatmap",      label: "Risk Heatmap" },
  { id: "escalations",  label: "Escalations" },
  { id: "contractors",  label: "Contractors" },
  { id: "pm-align",     label: "PM Alignment" },
];

// ── Filter bar sub-component ──────────────────────────────────────────────────

function FilterBar({ stores, contractors, filterStore, setFilterStore, filterContractor, setFilterContractor, showStore = true, showContractor = true }) {
  const selStyle = { height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid #334155", fontSize: 12, color: "#e2e8f0", background: "#1e293b", cursor: "pointer", outline: "none", minWidth: 140 };
  const hasActive = (showStore && filterStore) || (showContractor && filterContractor);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {showStore && (
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={selStyle}>
          <option value="">All stores</option>
          {stores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {showContractor && (
        <select value={filterContractor} onChange={e => setFilterContractor(e.target.value)} style={selStyle}>
          <option value="">All contractors</option>
          {contractors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {hasActive && (
        <button type="button" onClick={() => { setFilterStore(""); setFilterContractor(""); }}
          style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid #334155", fontSize: 12, color: "#94a3b8", background: "#1e293b", cursor: "pointer" }}>
          Clear
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function RiskDashboard({ projects, reports, siteVisits = [] }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [filterStore, setFilterStore] = useState("");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterReport, setFilterReport] = useState("");

  const allRows = useMemo(() => projects.map(project => {
    const projReports    = reports.filter(r => String(r.projectId) === String(project.id));
    const projSiteVisits = siteVisits.filter(v => String(v.projectId) === String(project.id));
    const sorted         = [...projReports].sort((a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt));
    const cumStatuses    = computeCumulativeStatuses(projReports) || {};
    const latestReport   = sorted[sorted.length - 1] || null;
    const wpCumStatuses  = computeWPCumulativeStatuses(projReports);
    const progress       = wpCumStatuses?.workPackageStatuses
      ? computeProjectProgressFromWP(wpCumStatuses.workPackageStatuses)
      : estimateProgressFromStatuses(cumStatuses);
    const riskScore      = computeProjectRiskScore(project, projReports, progress, projSiteVisits);
    const schedDev       = computeScheduleDeviation(project, progress);
    const trend          = computeTrend(sorted);
    const contScore      = computeContractorScores(project, projReports, projSiteVisits);
    const escalations    = computeEscalations(sorted, projSiteVisits);
    const dims           = computeDimensionRisk(project, latestReport, riskScore, schedDev, contScore, projSiteVisits);
    const evolution      = computeWeeklyEvolution(sorted, project);
    const confidence     = computeConfidenceLevel(projReports, projSiteVisits, latestReport);
    const actions        = computeRecommendedActions(riskScore, contScore, schedDev, latestReport, projSiteVisits, project);
    const health         = computeHealthScore(riskScore, progress, contScore);
    const contractorName = project.generalContractor || latestReport?.contractor || "";
    return { project, latestReport, progress, projReports, projSiteVisits, sorted, riskScore, schedDev, trend, contScore, escalations, dims, evolution, confidence, actions, health, contractorName };
  }), [projects, reports, siteVisits]);

  const sortedByRisk   = useMemo(() => [...allRows].sort((a, b) => b.riskScore.score - a.riskScore.score), [allRows]);
  const criticalRows   = useMemo(() => sortedByRisk.filter(r => r.riskScore.level === "CRITICAL"), [sortedByRisk]);
  const allEscalations = useMemo(() => allRows.flatMap(({ project, escalations }) => escalations.map(e => ({ ...e, project }))), [allRows]);

  // Unique values for filter dropdowns
  const allStoreCodes = useMemo(() => [...new Set(allRows.map(r => r.project.storeCode).filter(Boolean))].sort(), [allRows]);
  const allContractorNames = useMemo(() => [...new Set(allRows.map(r => r.contractorName).filter(Boolean))].sort(), [allRows]);

  // Contractors tab: filtered only by contractor
  const contractorTabRows = useMemo(() =>
    filterContractor ? allRows.filter(r => r.contractorName === filterContractor) : allRows,
    [allRows, filterContractor]
  );
  const contractorTabScores = useMemo(() =>
    computePortfolioContractorScores(contractorTabRows),
    [contractorTabRows]
  );

  // PM Alignment tab: filtered only by store
  const pmAlignRows = useMemo(() =>
    filterStore ? allRows.filter(r => r.project.storeCode === filterStore) : allRows,
    [allRows, filterStore]
  );

  // PM Alignment: available GC reports from visible projects (for the report filter)
  const pmAlignReportOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    pmAlignRows.filter(r => r.projSiteVisits.length > 0).forEach(({ sorted, projSiteVisits, project }) => {
      [...projSiteVisits]
        .sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))
        .forEach(visit => {
          const visitDate = new Date(visit.visitDate || visit.submittedAt);
          const gc = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0]
                  || sorted[sorted.length - 1];
          if (gc && !seen.has(String(gc.id))) {
            seen.add(String(gc.id));
            const date = new Date(gc.reportingDate || gc.submittedAt);
            opts.push({
              id: String(gc.id),
              label: `${project.storeCode} — ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
              date: gc.reportingDate || gc.submittedAt,
            });
          }
        });
    });
    return opts.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [pmAlignRows]);

  const summaryStats = useMemo(() => {
    const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    allRows.forEach(r => c[r.riskScore.level]++);
    const avgScore  = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.riskScore.score, 0) / allRows.length) : 0;
    const avgHealth = allRows.length ? Math.round(allRows.reduce((s, r) => s + r.health.score, 0) / allRows.length) : 0;
    const opening30 = allRows.filter(r => {
      const dTo = r.project.targetOpeningDate ? Math.ceil((new Date(r.project.targetOpeningDate) - new Date()) / 86400000) : null;
      return dTo !== null && dTo >= 0 && dTo < 30;
    }).length;
    const pmMismatch = allRows.filter(r => r.riskScore.factors.some(f => f.name === "PM Site Visit mismatch" || f.name === "Hidden risk (PM vs GC)")).length;
    return { ...c, avgScore, avgHealth, opening30, pmMismatch };
  }, [allRows]);

  return (
    <div>
      {/* ── Page header + KPI cards ── */}
      <div className="page-header" style={{ alignItems: "flex-start" }}>
        <div>
          <h1>Risk Dashboard</h1>
          <p>Project health · Risk scoring · Contractor performance · PM verification alignment.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ textAlign: "center", background: summaryStats.avgHealth >= 75 ? "#052e16" : summaryStats.avgHealth >= 50 ? "#422006" : "#450a0a", border: "1.5px solid #334155", borderRadius: 12, padding: "10px 14px", minWidth: 70 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: summaryStats.avgHealth >= 75 ? "#86efac" : summaryStats.avgHealth >= 50 ? "#fcd34d" : "#fca5a5", lineHeight: 1 }}>{summaryStats.avgHealth}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Health</div>
          </div>
          {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(level => {
            const c = RISK_COLORS[level];
            return (
              <div key={level} data-testid={`risk-kpi-${level.toLowerCase()}`} style={{ textAlign: "center", background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.text, lineHeight: 1 }}>{summaryStats[level]}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: c.text, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>{level}</div>
              </div>
            );
          })}
          <div style={{ textAlign: "center", background: "#1e293b", border: "1.5px solid #334155", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>{summaryStats.avgScore}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Risk</div>
          </div>
          {summaryStats.opening30 > 0 && (
            <div style={{ textAlign: "center", background: "#422006", border: "1.5px solid #c2410c", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fdba74", lineHeight: 1 }}>{summaryStats.opening30}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#fdba74", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Open &lt;30d</div>
            </div>
          )}
          {summaryStats.pmMismatch > 0 && (
            <div style={{ textAlign: "center", background: "#2e1065", border: "1.5px solid #7c3aed", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#c4b5fd", lineHeight: 1 }}>{summaryStats.pmMismatch}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>PM Mismatch</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Critical early warnings (always visible) ── */}
      {criticalRows.length > 0 && (
        <div style={{ background: "#450a0a", border: "1.5px solid #7f1d1d", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🚨</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#fca5a5" }}>EARLY WARNING — {criticalRows.length} CRITICAL PROJECT{criticalRows.length > 1 ? "S" : ""} REQUIRE IMMEDIATE ACTION</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {criticalRows.map(({ project, riskScore, schedDev, latestReport }) => {
              const dTo = project.targetOpeningDate ? Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000) : null;
              return (
                <div key={project.id} style={{ background: "#1e293b", border: "1px solid #7f1d1d", borderRadius: 10, padding: "12px 16px", minWidth: 240 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#fca5a5", marginBottom: 6 }}>{project.storeCode} — {project.shoppingMallName}</div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 2 }}>Risk Score: <strong style={{ color: "#fca5a5" }}>{riskScore.score} / 100</strong></div>
                  {schedDev?.predictedDelayDays > 0 && <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 2 }}>Predicted delay: <strong style={{ color: "#dc2626" }}>+{schedDev.predictedDelayDays} days</strong></div>}
                  {dTo !== null && <div style={{ fontSize: 12, fontWeight: 700, color: dTo < 0 ? "#dc2626" : "#d97706" }}>{dTo < 0 ? `⛔ ${Math.abs(dTo)}d OVERDUE` : `📅 ${dTo}d to opening`}</div>}
                  {latestReport?.activitiesBlocked === "Yes" && <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>⛔ Activities blocked</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "#1e293b", borderRadius: 12, padding: 4, border: "1px solid #334155", width: "fit-content" }}>
        {VIEWS.map(({ id, label }) => (
          <button key={id} type="button" data-testid="risk-view-tab" data-view-id={id} onClick={() => setActiveView(id)} style={{
            padding: "8px 18px", borderRadius: 9, border: "none",
            background: activeView === id ? "#f1f5f9" : "transparent",
            color: activeView === id ? "#0f172a" : "#94a3b8",
            fontSize: 13, fontWeight: activeView === id ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
          }}>
            {label}
            {id === "escalations" && allEscalations.length > 0 && (
              <span style={{ marginLeft: 6, background: "#dc2626", color: "white", borderRadius: 8, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{allEscalations.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          VIEW: OVERVIEW
          ════════════════════════════════════════════ */}
      {activeView === "overview" && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Risk Register table */}
          {sortedByRisk.length === 0 ? (
            <div className="dashboard-summary-card" style={{ textAlign: "center", color: "#94a3b8", padding: "60px 0" }}>
              No projects found. Add projects and submit reports to activate the risk engine.
            </div>
          ) : (
            <div className="dashboard-summary-card" style={{ margin: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", marginBottom: 4 }}>Project Risk Register</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>All projects sorted by risk score · click row to expand details</div>
              <RiskTable sortedByRisk={sortedByRisk} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
            </div>
          )}

          {/* CRITICAL / HIGH detail cards */}
          {sortedByRisk.filter(r => r.riskScore.level === "CRITICAL" || r.riskScore.level === "HIGH").map(({ project, riskScore, schedDev, trend, escalations, evolution, actions, health }) => {
            const c = riskScore.color;
            const dTo = project.targetOpeningDate ? Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000) : null;
            return (
              <div key={project.id} className="dashboard-summary-card" style={{ margin: 0, borderLeft: `4px solid ${c.text}`, paddingLeft: 20 }}>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flexShrink: 0 }}><RiskGauge score={riskScore.score} level={riskScore.level} color={c} /></div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9" }}>{project.storeCode} — {project.shoppingMallName}</div>
                      <HealthBadge {...health} />
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{[project.projectManager, project.generalContractor, project.city].filter(Boolean).join(" · ")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{riskScore.factors.map((f, i) => <FactorPill key={i} f={f} />)}</div>
                    {escalations.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {escalations.map((e, i) => (
                          <div key={i} style={{ padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: RISK_COLORS[e.severity].bg, color: RISK_COLORS[e.severity].text, border: `1px solid ${RISK_COLORS[e.severity].border}` }}>
                            ⚠ {e.label} · {e.weeks}w
                          </div>
                        ))}
                      </div>
                    )}
                    {actions && actions.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Recommended Actions</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {actions.map((a, i) => {
                            const ac = a.priority === "HIGH" ? { bg: "#450a0a", text: "#fca5a5", border: "#7f1d1d" } : { bg: "#431407", text: "#fdba74", border: "#c2410c" };
                            return (
                              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 8px", borderRadius: 7, background: ac.bg, border: `1px solid ${ac.border}` }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: ac.text, textTransform: "uppercase", marginTop: 2, flexShrink: 0 }}>{a.priority}</span>
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: ac.text }}>{a.action}</div>
                                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{a.reason}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {schedDev && (
                    <div style={{ flexShrink: 0, background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "14px 18px", minWidth: 180 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 10 }}>Schedule Analysis</div>
                      {[
                        { label: "Expected", value: `${schedDev.expectedPct}%`, color: "#e2e8f0" },
                        { label: "Actual",   value: `${schedDev.actualPct}%`,   color: "#e2e8f0" },
                        { label: "Deviation", value: schedDev.deviationPct > 0 ? `−${schedDev.deviationPct}%` : "On track", color: schedDev.deviationPct > 15 ? "#dc2626" : schedDev.deviationPct > 5 ? "#d97706" : "#22c55e" },
                        schedDev.predictedDelayDays > 0 && { label: "Pred. delay", value: `+${schedDev.predictedDelayDays}d`, color: "#dc2626" },
                        schedDev.predictedDelayDays > 0 && schedDev.predictedOpeningDate && { label: "Pred. opening", value: schedDev.predictedOpeningDate.toLocaleDateString("en-GB"), color: "#dc2626" },
                      ].filter(Boolean).map(({ label, value, color }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>{label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ flexShrink: 0, minWidth: 140 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 8 }}>Trend</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <span style={{ fontSize: 22, color: trend.color, fontWeight: 800 }}>{trend.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: trend.color }}>{trend.trend}</span>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: 6 }}>Risk Evolution</div>
                    <MiniRiskSparkline points={evolution} />
                    {dTo !== null && (
                      <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: dTo < 0 ? "#dc2626" : dTo < 30 ? "#ea580c" : dTo < 90 ? "#d97706" : "#22c55e" }}>
                        {dTo < 0 ? `⛔ ${Math.abs(dTo)}d overdue` : `📅 ${dTo}d to open`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════
          VIEW: RISK HEATMAP
          ════════════════════════════════════════════ */}
      {activeView === "heatmap" && (
        <div className="dashboard-summary-card">
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "#f1f5f9" }}>Portfolio Risk Heatmap</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Risk level by project × 14 dimensions · sorted by overall score</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: "3px 3px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#94a3b8", minWidth: 110 }}>Project</th>
                  <th style={{ textAlign: "center", padding: "4px 6px", fontSize: 11, fontWeight: 700, color: "#94a3b8", minWidth: 50 }}>Score</th>
                  {RISK_DIMENSIONS.map(d => (
                    <th key={d} style={{ textAlign: "center", padding: "4px 3px", fontSize: 9, fontWeight: 700, color: "#94a3b8", minWidth: 34, whiteSpace: "nowrap" }}>
                      {d.length > 8 ? d.substring(0, 8) + "…" : d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedByRisk.map(({ project, riskScore, dims }) => {
                  const c = riskScore.color;
                  return (
                    <tr key={project.id}>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 3, height: 16, borderRadius: 2, background: c.text, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{project.storeCode}</div>
                            <div style={{ fontSize: 10, color: "#9ca3af" }}>{project.shoppingMallName}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "center", padding: "5px 6px" }}>
                        <div style={{ width: 40, height: 26, borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontSize: 13, fontWeight: 800, color: c.text }}>{riskScore.score}</div>
                      </td>
                      {RISK_DIMENSIONS.map(d => <DimCell key={d} level={dims[d]} />)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid #334155" }}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(l => {
              const c = RISK_COLORS[l];
              return (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: c.text }}>{l[0]}</div>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{l}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          VIEW: ESCALATIONS
          ════════════════════════════════════════════ */}
      {activeView === "escalations" && (
        <div className="dashboard-summary-card">
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "#f1f5f9" }}>
            Risk Escalation Register
            {allEscalations.length > 0 && <span style={{ marginLeft: 8, background: "#dc2626", color: "white", borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "2px 8px" }}>{allEscalations.length}</span>}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 20 }}>Unresolved risks · repeated blockers · open support requests · PM mismatches</div>
          {allEscalations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>No escalations detected</div>
              <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>No risks have been repeatedly reported without resolution</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="dashboard-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr><th>Project</th><th>Category</th><th>Issue</th><th>Reports / Days</th><th>Latest Owner</th><th>First Seen</th><th>Last Seen</th><th>Level</th></tr>
                </thead>
                <tbody>
                  {allEscalations.map((e, i) => {
                    const typeIcon = { risk: "⚠", blocker: "⛔", support: "📋", mismatch: "🔍" }[e.type] || "•";
                    return (
                      <tr key={i}>
                        <td><div style={{ fontWeight: 700, color: "#f1f5f9" }}>{e.project.storeCode}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{e.project.shoppingMallName}</div></td>
                        <td><span style={{ fontSize: 13 }}>{typeIcon}</span> <span style={{ fontSize: 12, color: "#e2e8f0", textTransform: "capitalize" }}>{e.type}</span></td>
                        <td><div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9" }}>{e.label}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{e.description}</div></td>
                        <td style={{ fontSize: 18, fontWeight: 800, color: RISK_COLORS[e.severity].text }}>{e.weeks}</td>
                        <td style={{ fontSize: 13, color: "#e2e8f0" }}>{e.latestOwner || "—"}</td>
                        <td style={{ fontSize: 12, color: "#94a3b8" }}>{e.firstSeen ? new Date(e.firstSeen).toLocaleDateString("en-GB") : "—"}</td>
                        <td style={{ fontSize: 12, color: "#94a3b8" }}>{e.lastSeen  ? new Date(e.lastSeen).toLocaleDateString("en-GB")  : "—"}</td>
                        <td><RiskBadge level={e.severity} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          VIEW: CONTRACTORS
          ════════════════════════════════════════════ */}
      {activeView === "contractors" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="dashboard-summary-card" style={{ margin: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "#f1f5f9" }}>Contractor Performance & Reporting Reliability</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
              <strong>Performance</strong> = contractor-controlled items · <strong>Reporting Accuracy</strong> = PM site visit verification alignment · lowest first
            </div>

            <FilterBar
              stores={allStoreCodes}
              contractors={allContractorNames}
              filterStore={filterStore}
              setFilterStore={setFilterStore}
              filterContractor={filterContractor}
              setFilterContractor={setFilterContractor}
              showStore={false}
            />

            {contractorTabScores.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "48px 0" }}>No contractor data for selected filters.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {contractorTabScores.map(c => (
                  <div key={c.name} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 14, padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginBottom: 3 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>{c.projects.join(", ")} · {c.n} project{c.n > 1 ? "s" : ""} · {c.reportCount} reports</div>
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ textAlign: "center", background: "#1e293b", border: "1.5px solid #334155", borderRadius: 12, padding: "12px 18px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Performance</div>
                          <div style={{ fontSize: 36, fontWeight: 800, color: c.perfColor, lineHeight: 1 }}>{c.avgPerf}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c.perfColor, marginTop: 4 }}>{c.perfLevel}</div>
                        </div>
                        <div style={{ textAlign: "center", background: "#1e293b", border: "1.5px solid #334155", borderRadius: 12, padding: "12px 18px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Reporting Accuracy</div>
                          <div style={{ fontSize: 36, fontWeight: 800, color: c.accColor, lineHeight: 1 }}>{c.avgAccuracy}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c.accColor, marginTop: 4 }}>{c.accLevel}</div>
                        </div>
                      </div>
                    </div>
                    {contractorTabRows.filter(row => row.contractorName === c.name).map(({ project, contScore }) => (
                      <div key={project.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0", marginBottom: 10 }}>{project.storeCode} — {project.shoppingMallName}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>Performance breakdown</div>
                            <ScoreBar label="Reporting Discipline" pts={contScore.breakdown.reporting}     max={20} color={contScore.breakdown.reporting >= 16 ? "#22c55e" : contScore.breakdown.reporting >= 12 ? "#f59e0b" : "#dc2626"} />
                            <ScoreBar label="Contractor Progress"  pts={contScore.breakdown.progress}      max={25} color={contScore.breakdown.progress >= 20 ? "#22c55e" : contScore.breakdown.progress >= 14 ? "#f59e0b" : "#dc2626"} />
                            <ScoreBar label="Issue Management"     pts={contScore.breakdown.issues}        max={15} color={contScore.breakdown.issues >= 12 ? "#22c55e" : contScore.breakdown.issues >= 8 ? "#f59e0b" : "#dc2626"} />
                            <ScoreBar label="Communication"        pts={contScore.breakdown.communication} max={10} color={contScore.breakdown.communication >= 8 ? "#22c55e" : contScore.breakdown.communication >= 5 ? "#f59e0b" : "#dc2626"} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 6 }}>PM Alignment</div>
                            <ScoreBar label="PM Verification" pts={contScore.breakdown.pmAlignment} max={30} color={contScore.breakdown.pmAlignment >= 24 ? "#22c55e" : contScore.breakdown.pmAlignment >= 18 ? "#f59e0b" : "#dc2626"} />
                            {contScore.pmAlignmentDetails.length === 0 && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>No PM site visits recorded yet</div>}
                            {contScore.pmAlignmentDetails.map((d, i) => (
                              <div key={i} style={{ fontSize: 12, color: "#e2e8f0", marginTop: 6 }}>
                                Visit {new Date(d.visitDate).toLocaleDateString("en-GB")}: <span style={{ fontWeight: 700, color: d.matchRate >= 80 ? "#22c55e" : d.matchRate >= 60 ? "#f59e0b" : "#dc2626" }}>{d.matchRate}% match</span>
                                {d.overstatements > 0 && <span style={{ color: "#dc2626", marginLeft: 8 }}>· {d.overstatements} overstated</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          VIEW: PM ALIGNMENT
          ════════════════════════════════════════════ */}
      {activeView === "pm-align" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="dashboard-summary-card" style={{ margin: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "#f1f5f9" }}>PM Site Visit Verification</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>Contractor-reported statuses vs PM observations · overstatements show where GC claimed more progress than PM verified</div>

            <FilterBar
              stores={allStoreCodes}
              contractors={allContractorNames}
              filterStore={filterStore}
              setFilterStore={v => { setFilterStore(v); setFilterReport(""); }}
              filterContractor={filterContractor}
              setFilterContractor={setFilterContractor}
              showContractor={false}
            />

            {pmAlignReportOptions.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
                <select
                  value={filterReport}
                  onChange={e => setFilterReport(e.target.value)}
                  style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid #334155", fontSize: 12, color: "#e2e8f0", background: "#1e293b", cursor: "pointer", outline: "none", minWidth: 220 }}
                >
                  <option value="">All GC reports</option>
                  {pmAlignReportOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {filterReport && (
                  <button
                    type="button"
                    onClick={() => setFilterReport("")}
                    style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid #334155", fontSize: 12, color: "#94a3b8", background: "#1e293b", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {pmAlignRows.filter(r => r.projSiteVisits.length > 0).length === 0 && (
            <div className="dashboard-summary-card" style={{ margin: 0, textAlign: "center", color: "#94a3b8", padding: "60px 0" }}>
              {allRows.filter(r => r.projSiteVisits.length > 0).length === 0
                ? "No PM site visits recorded yet. Complete a PM Site Visit Report to see comparison data here."
                : "No projects match the selected filters."}
            </div>
          )}

          {pmAlignRows.filter(r => r.projSiteVisits.length > 0).map(({ project, projSiteVisits, sorted, contScore }) => {
            const visitsSorted = [...projSiteVisits]
              .sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))
              .filter(visit => {
                if (!filterReport) return true;
                const visitDate = new Date(visit.visitDate || visit.submittedAt);
                const gc = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
                return gc && String(gc.id) === filterReport;
              });
            if (visitsSorted.length === 0) return null;
            return (
              <div key={project.id} className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", marginBottom: 2 }}>{project.storeCode} — {project.shoppingMallName}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
                  {project.generalContractor && <span style={{ marginRight: 10, color: "#e2e8f0", fontWeight: 600 }}>{project.generalContractor}</span>}
                  Reporting Accuracy: <span style={{ fontWeight: 700, color: contScore.reportingAccuracy >= 80 ? "#22c55e" : contScore.reportingAccuracy >= 60 ? "#f59e0b" : "#dc2626" }}>{contScore.reportingAccuracy} / 100</span>
                  {" · "}{visitsSorted.length} site visit{visitsSorted.length !== 1 ? "s" : ""}
                </div>
                {visitsSorted.map((visit, vi) => {
                  const visitDate = new Date(visit.visitDate || visit.submittedAt);
                  const gcAtVisit = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
                  const items = computePmAlignmentItems(gcAtVisit, visit);
                  const overstatements = items.filter(i => i.overstate);
                  const matches = items.filter(i => i.match);
                  const matchRate = items.length > 0 ? Math.round((matches.length / items.length) * 100) : 100;
                  const matchColor = matchRate >= 80 ? "#22c55e" : matchRate >= 60 ? "#f59e0b" : "#dc2626";
                  return (
                    <div key={vi} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#e2e8f0" }}>Visit {visitDate.toLocaleDateString("en-GB")}</div>
                          {gcAtVisit && <div style={{ fontSize: 11, color: "#9ca3af" }}>vs GC report {new Date(gcAtVisit.reportingDate || gcAtVisit.submittedAt).toLocaleDateString("en-GB")}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: matchColor }}>{matchRate}%</div><div style={{ fontSize: 10, color: "#94a3b8" }}>Match rate</div></div>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: overstatements.length > 0 ? "#dc2626" : "#22c55e" }}>{overstatements.length}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>Overstated</div></div>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{matches.length}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>Matches</div></div>
                        </div>
                      </div>
                      {items.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #334155" }}>
                                {["Work Item", "Contractor Status", "PM Observed", "Mismatch Type", "Severity"].map(h => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[...items].sort((a, b) => {
                                const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
                                return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                              }).map((item, ii) => {
                                const isMatch   = item.mismatchType === "Match";
                                const isPmAhead = item.mismatchType === "PM ahead";
                                const sev = SEV_COLORS[item.severity];
                                const rowBg     = item.severity === "CRITICAL" ? "#1c0a0a" : item.severity === "HIGH" ? "#1c0f07" : item.severity === "MEDIUM" ? "#1a1300" : isPmAhead ? "#0a1c0e" : "#1e293b";
                                const typeColor = item.severity === "CRITICAL" ? "#dc2626" : item.severity === "HIGH" ? "#ea580c" : item.severity === "MEDIUM" ? "#d97706" : isPmAhead ? "#16a34a" : "#9ca3af";
                                return (
                                  <tr key={ii} style={{ borderBottom: "1px solid #334155", background: rowBg, opacity: isMatch ? 0.6 : 1 }}>
                                    <td style={{ padding: "7px 10px", fontSize: 12, color: "#e2e8f0", maxWidth: 220 }}>{item.name}</td>
                                    <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: item.overstate ? 700 : 400, color: item.overstate ? "#dc2626" : "#e2e8f0" }}>{item.gcStatus}</span></td>
                                    <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: isPmAhead ? 700 : 400, color: isPmAhead ? "#4ade80" : "#e2e8f0" }}>{item.pmStatus}</span></td>
                                    <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: typeColor }}>{item.mismatchType}</td>
                                    <td style={{ padding: "7px 10px" }}>
                                      {sev ? (
                                        <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 9, fontSize: 11, fontWeight: 700, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}` }}>{item.severity}</span>
                                      ) : isMatch ? (
                                        <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>✓ Match</span>
                                      ) : (
                                        <span style={{ fontSize: 11, color: "#22c55e" }}>↑ PM ahead</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {visit.pmScheduleAssessment && (
                        <div style={{ marginTop: 10, fontSize: 12, color: "#e2e8f0" }}>
                          PM schedule assessment: <span style={{ fontWeight: 700, color: ["Delayed", "Critical"].includes(visit.pmScheduleAssessment) ? "#dc2626" : visit.pmScheduleAssessment === "At Risk" ? "#f59e0b" : "#22c55e" }}>{visit.pmScheduleAssessment}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RiskDashboard;
