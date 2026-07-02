import { useEffect, useMemo, useState } from "react";
import { isSevereScheduleStatus, daysUntil } from "../utils/reportUtils";
import { RISK_COLORS, RISK_DIMENSIONS } from "../engines/riskEngine";
import { computePortfolioContractorScores } from "../engines/contractorEngine";
import { computePmAlignmentItems, summarizeAlignmentItems } from "../engines/pmAlignmentEngine";
import { useRiskRows } from "../hooks/useRiskRows";
import { RiskGauge, RiskBadge, HealthBadge, DimCell } from "../components/RiskGauge";
import { FactorPill, MiniRiskSparkline, ScoreBar } from "../components/ScoreBar";
import { RiskTable } from "../components/RiskTable";
import { RISK_LEVEL_COLORS, SPI_STATUS } from "../config/statusColors";
import { loadAllGanttMetrics, getProjectTrend } from "../services/ganttService";
import { getDiscrepancyHistory, getContractorReliability } from "../services/dashboardService";
import { computeRiskSummaryStats } from "../engines/portfolioEngine";
import EvmWidget from "../components/analytics/EvmWidget";
import MonteCarloWidget from "../components/analytics/MonteCarloWidget";
import DriftChart from "../components/analytics/DriftChart";

const SEV_COLORS = RISK_LEVEL_COLORS;

function Glyph({ name, size = 14 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "alert":    return (<svg {...common}><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>);
    case "block":    return (<svg {...common}><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>);
    case "calendar": return (<svg {...common}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>);
    case "check":    return (<svg {...common}><path d="M20 6 9 17l-5-5"/></svg>);
    case "arrowUp":  return (<svg {...common}><path d="M12 19V5M5 12l7-7 7 7"/></svg>);
    case "doc":      return (<svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>);
    case "search":   return (<svg {...common}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);
    default: return null;
  }
}

const VIEWS = [
  { id: "overview",     label: "Overview" },
  { id: "heatmap",      label: "Risk Heatmap" },
  { id: "escalations",  label: "Escalations" },
  { id: "contractors",  label: "Contractors" },
  { id: "pm-align",     label: "PM Alignment" },
  { id: "gantt-spi",    label: "Gantt SPI" },
];

// ── SPI sparkline (SVG, no external library) ──────────────────────────────────

function SPISparkline({ points, width = 140, height = 44 }) {
  const valid = (points || []).filter(p => p.spi !== null);
  if (valid.length < 2) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No trend</span>;

  const minV  = Math.min(0.5, ...valid.map(p => p.spi));
  const maxV  = Math.max(1.5, ...valid.map(p => p.spi));
  const range = maxV - minV || 1;
  const xStep = width / (valid.length - 1);
  const toX   = i => (i * xStep).toFixed(1);
  const toY   = v => (height - ((v - minV) / range) * height).toFixed(1);

  const d     = valid.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(p.spi)}`).join(' ');
  const last  = valid[valid.length - 1].spi;
  const color = last >= 0.95 ? 'var(--status-done)' : last >= 0.80 ? 'var(--status-warn)' : 'var(--status-alert)';
  const refY  = toY(1.0);

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <line x1="0" y1={refY} x2={width} y2={refY} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx={toX(valid.length - 1)} cy={toY(last)} r="3" fill={color}/>
    </svg>
  );
}

// ── Filter bar sub-component ──────────────────────────────────────────────────

function FilterBar({ stores, contractors, filterStore, setFilterStore, filterContractor, setFilterContractor, showStore = true, showContractor = true }) {
  const selStyle = { height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-input)", cursor: "pointer", outline: "none", minWidth: 140 };
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
          style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-muted)", background: "var(--accent-subtle)", cursor: "pointer" }}>
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

  // Gantt SPI tab state (loaded lazily)
  const [ganttMetricsMap, setGanttMetricsMap] = useState(new Map());
  const [projectTrends,   setProjectTrends]   = useState({});    // projectId → trend[]
  const [discHistory,     setDiscHistory]     = useState({});    // projectId → disc[]
  const [reliabilityMap,  setReliabilityMap]  = useState(new Map());
  const [ganttSpiLoading, setGanttSpiLoading] = useState(false);

  useEffect(() => {
    if (activeView !== 'gantt-spi' || !projects || projects.length === 0) return;
    if (ganttMetricsMap.size > 0) return; // already loaded
    setGanttSpiLoading(true);
    const ids = projects.map(p => p.id);
    Promise.all([
      loadAllGanttMetrics(ids),
      getContractorReliability(ids),
      Promise.all(ids.map(id => getProjectTrend(id, 8).then(t => [id, t]))),
      Promise.all(ids.map(id => getDiscrepancyHistory(id, 10).then(d => [id, d]))),
    ]).then(([metrics, reliability, trends, discs]) => {
      setGanttMetricsMap(metrics);
      setReliabilityMap(reliability);
      setProjectTrends(Object.fromEntries(trends));
      setDiscHistory(Object.fromEntries(discs));
    }).catch(err => console.error('[risk] gantt-spi load error:', err))
      .finally(() => setGanttSpiLoading(false));
  }, [activeView, projects]);

  const allRows = useRiskRows(projects, reports, siteVisits);

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

  const summaryStats = useMemo(() => computeRiskSummaryStats(allRows), [allRows]);

  return (
    <div>
      {/* ── Page header + KPI cards ── */}
      <div className="page-header" style={{ alignItems: "flex-start" }}>
        <div>
          <h1>Risk Dashboard</h1>
          <p>Project health · Risk scoring · Contractor performance · PM verification alignment.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
          <div style={{ textAlign: "center", background: summaryStats.avgHealth >= 75 ? 'var(--status-done-bg)' : summaryStats.avgHealth >= 50 ? 'var(--status-warn-bg)' : 'var(--status-alert-bg)', border: '1.5px solid var(--border)', borderRadius: 12, padding: "10px 14px", minWidth: 70 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: summaryStats.avgHealth >= 75 ? "var(--status-done)" : summaryStats.avgHealth >= 50 ? "var(--status-warn)" : "var(--status-alert)", lineHeight: 1 }}>{summaryStats.avgHealth}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Health</div>
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
          <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>{summaryStats.avgScore}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Avg Risk</div>
          </div>
          {summaryStats.opening30 > 0 && (
            <div style={{ textAlign: "center", background: "var(--status-warn-bg)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--status-warn)", lineHeight: 1 }}>{summaryStats.opening30}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--status-warn)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>Open &lt;30d</div>
            </div>
          )}
          {summaryStats.pmMismatch > 0 && (
            <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", minWidth: 64 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{summaryStats.pmMismatch}</div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>PM Mismatch</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Critical early warnings (always visible) ── */}
      {criticalRows.length > 0 && (
        <div style={{ background: "var(--status-alert-bg)", border: "1.5px solid var(--border)", borderRadius: 14, padding: "16px 20px", marginBottom: 20, borderLeft: "4px solid var(--status-alert)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: "var(--status-alert)", display: "inline-flex", alignItems: "center" }}><Glyph name="alert" size={18} /></span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "var(--status-alert)" }}>EARLY WARNING — {criticalRows.length} CRITICAL PROJECT{criticalRows.length > 1 ? "S" : ""} REQUIRE IMMEDIATE ACTION</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {criticalRows.map(({ project, riskScore, schedDev, latestReport }) => {
              const dTo = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
              return (
                <div key={project.id} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 240 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--status-alert)", marginBottom: 6 }}>{project.storeCode} — {project.shoppingMallName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>Risk Score: <strong style={{ color: "var(--status-alert)" }}>{riskScore.score} / 100</strong></div>
                  {schedDev?.predictedDelayDays > 0 && <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2 }}>Predicted delay: <strong style={{ color: "var(--status-alert)" }}>+{schedDev.predictedDelayDays} days</strong></div>}
                  {dTo !== null && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: dTo < 0 ? "var(--status-alert)" : "var(--status-warn)" }}>{dTo < 0 ? <><Glyph name="block" /> {Math.abs(dTo)}d OVERDUE</> : <><Glyph name="calendar" /> {dTo}d to opening</>}</div>}
                  {latestReport?.activitiesBlocked === "Yes" && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "var(--status-alert)", marginTop: 4 }}><Glyph name="block" /> Activities blocked</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: "var(--accent-subtle)", borderRadius: 12, padding: 4, border: "1px solid var(--border)", width: "fit-content" }}>
        {VIEWS.map(({ id, label }) => (
          <button key={id} type="button" data-testid="risk-view-tab" data-view-id={id} onClick={() => setActiveView(id)} style={{
            padding: "8px 18px", borderRadius: 9, border: "none",
            background: activeView === id ? "var(--bg-surface)" : "transparent",
            color: activeView === id ? "var(--accent)" : "var(--text-muted)",
            boxShadow: activeView === id ? "var(--shadow-sm)" : "none",
            fontSize: 13, fontWeight: activeView === id ? 700 : 500,
            cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
          }}>
            {label}
            {id === "escalations" && allEscalations.length > 0 && (
              <span style={{ marginLeft: 6, background: "var(--status-alert)", color: "var(--text-inverse)", borderRadius: 8, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>{allEscalations.length}</span>
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
          {sortedByRisk.filter(r => r.riskScore.level === "CRITICAL" || r.riskScore.level === "HIGH").map(({ project, riskScore, schedDev, trend, escalations, evolution, actions, health, evm, driftProfile, monteCarlo }) => {
            const c = riskScore.color;
            const dTo = project.targetOpeningDate ? Math.ceil((new Date(project.targetOpeningDate) - new Date()) / 86400000) : null;
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
                            const ac = a.priority === "HIGH" ? { bg: 'var(--status-alert-bg)', text: 'var(--status-alert)', border: 'var(--border)' } : { bg: 'var(--status-warn-bg)', text: 'var(--status-warn)', border: 'var(--border)' };
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
                        { label: "Deviation", value: schedDev.deviationPct > 0 ? `−${schedDev.deviationPct}%` : "On track", color: schedDev.deviationPct > 15 ? "var(--status-alert)" : schedDev.deviationPct > 5 ? "var(--status-warn)" : "var(--status-done)" },
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
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 12, fontWeight: 700, color: dTo < 0 ? "var(--status-alert)" : dTo < 30 ? "var(--status-alert)" : dTo < 90 ? "var(--status-warn)" : "var(--status-done)" }}>
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
      )}

      {/* ════════════════════════════════════════════
          VIEW: RISK HEATMAP
          ════════════════════════════════════════════ */}
      {activeView === "heatmap" && (
        <div className="dashboard-summary-card">
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>Portfolio Risk Heatmap</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Risk level by project × 14 dimensions · sorted by overall score</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: "3px 3px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 110 }}>Project</th>
                  <th style={{ textAlign: "center", padding: "4px 6px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 50 }}>Score</th>
                  {RISK_DIMENSIONS.map(d => (
                    <th key={d} style={{ textAlign: "center", padding: "4px 3px", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", minWidth: 34, whiteSpace: "nowrap" }}>
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
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{project.storeCode}</div>
                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{project.shoppingMallName}</div>
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
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(l => {
              const c = RISK_COLORS[l];
              return (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 5, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: c.text }}>{l[0]}</div>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{l}</span>
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
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>
            Risk Escalation Register
            {allEscalations.length > 0 && <span style={{ marginLeft: 8, background: "var(--status-alert)", color: "var(--text-inverse)", borderRadius: 8, fontSize: 11, fontWeight: 800, padding: "2px 8px" }}>{allEscalations.length}</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 20 }}>Unresolved risks · repeated blockers · open support requests · PM mismatches</div>
          {allEscalations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 0" }}>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><span style={{ color: "var(--status-done)", display: "inline-flex" }}><Glyph name="check" size={40} /></span></div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--status-done)" }}>No escalations detected</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>No risks have been repeatedly reported without resolution</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="dashboard-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr><th>Project</th><th>Category</th><th>Issue</th><th>Reports / Days</th><th>Latest Owner</th><th>First Seen</th><th>Last Seen</th><th>Level</th></tr>
                </thead>
                <tbody>
                  {allEscalations.map((e, i) => {
                    const typeIconName = { risk: "alert", blocker: "block", support: "doc", mismatch: "search" }[e.type] || "alert";
                    return (
                      <tr key={i}>
                        <td><div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{e.project.storeCode}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.project.shoppingMallName}</div></td>
                        <td><span style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}><Glyph name={typeIconName} /></span> <span style={{ fontSize: 12, color: "var(--text-secondary)", textTransform: "capitalize" }}>{e.type}</span></td>
                        <td><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{e.label}</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.description}</div></td>
                        <td style={{ fontSize: 18, fontWeight: 800, color: RISK_COLORS[e.severity].text }}>{e.weeks}</td>
                        <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>{e.latestOwner || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.firstSeen ? new Date(e.firstSeen).toLocaleDateString("en-GB") : "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{e.lastSeen  ? new Date(e.lastSeen).toLocaleDateString("en-GB")  : "—"}</td>
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
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>Contractor Performance & Reporting Reliability</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              <strong style={{ color: "var(--text-secondary)" }}>Performance</strong> = contractor-controlled items · <strong style={{ color: "var(--text-secondary)" }}>PM Alignment</strong> = PM site visit verification alignment · lowest first
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
              <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 0" }}>No contractor data for selected filters.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {contractorTabScores.map(c => (
                  <div key={c.name} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", marginBottom: 3 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.projects.join(", ")} · {c.n} project{c.n > 1 ? "s" : ""} · {c.reportCount} reports</div>
                      </div>
                      <div style={{ display: "flex", gap: 16 }}>
                        <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 18px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Performance</div>
                          <div style={{ fontSize: 36, fontWeight: 800, color: c.perfColor, lineHeight: 1 }}>{c.avgPerf}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c.perfColor, marginTop: 4 }}>{c.perfLevel}</div>
                        </div>
                        <div style={{ textAlign: "center", background: "var(--accent-subtle)", border: "1.5px solid var(--border)", borderRadius: 12, padding: "12px 18px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>PM Alignment</div>
                          <div style={{ fontSize: 36, fontWeight: 800, color: c.accColor, lineHeight: 1 }}>{c.avgAccuracy}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: c.accColor, marginTop: 4 }}>{c.accLevel}</div>
                        </div>
                      </div>
                    </div>
                    {contractorTabRows.filter(row => row.contractorName === c.name).map(({ project, contScore }) => (
                      <div key={project.id} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>{project.storeCode} — {project.shoppingMallName}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>Performance breakdown</div>
                            <ScoreBar label="Reporting Discipline" pts={contScore.breakdown.reporting}     max={20} color={contScore.breakdown.reporting >= 16 ? "var(--status-done)" : contScore.breakdown.reporting >= 12 ? "var(--status-warn)" : "var(--status-alert)"} />
                            <ScoreBar label="Contractor Progress"  pts={contScore.breakdown.progress}      max={25} color={contScore.breakdown.progress >= 20 ? "var(--status-done)" : contScore.breakdown.progress >= 14 ? "var(--status-warn)" : "var(--status-alert)"} />
                            <ScoreBar label="Issue Management"     pts={contScore.breakdown.issues}        max={15} color={contScore.breakdown.issues >= 12 ? "var(--status-done)" : contScore.breakdown.issues >= 8 ? "var(--status-warn)" : "var(--status-alert)"} />
                            <ScoreBar label="Communication"        pts={contScore.breakdown.communication} max={10} color={contScore.breakdown.communication >= 8 ? "var(--status-done)" : contScore.breakdown.communication >= 5 ? "var(--status-warn)" : "var(--status-alert)"} />
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>PM Alignment</div>
                            <ScoreBar label="PM Verification" pts={contScore.breakdown.pmAlignment} max={30} color={contScore.breakdown.pmAlignment >= 24 ? "var(--status-done)" : contScore.breakdown.pmAlignment >= 18 ? "var(--status-warn)" : "var(--status-alert)"} />
                            {contScore.pmAlignmentDetails.length === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No PM site visits recorded yet</div>}
                            {contScore.pmAlignmentDetails.map((d, i) => (
                              <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>
                                Visit {new Date(d.visitDate).toLocaleDateString("en-GB")}: <span style={{ fontWeight: 700, color: d.matchRate >= 80 ? "var(--status-done)" : d.matchRate >= 60 ? "var(--status-warn)" : "var(--status-alert)" }}>{d.matchRate}% match</span>
                                {d.overstatements > 0 && <span style={{ color: "var(--status-alert)", marginLeft: 8 }}>· {d.overstatements} overstated</span>}
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
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4, color: "var(--text-primary)" }}>PM Site Visit Verification</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Contractor-reported statuses vs PM observations · overstatements show where GC claimed more progress than PM verified</div>

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
                  style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-input)", cursor: "pointer", outline: "none", minWidth: 220 }}
                >
                  <option value="">All GC reports</option>
                  {pmAlignReportOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                {filterReport && (
                  <button
                    type="button"
                    onClick={() => setFilterReport("")}
                    style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 12, color: "var(--text-muted)", background: "var(--accent-subtle)", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {pmAlignRows.filter(r => r.projSiteVisits.length > 0).length === 0 && (
            <div className="dashboard-summary-card" style={{ margin: 0, textAlign: "center", color: "var(--text-muted)", padding: "60px 0" }}>
              {allRows.filter(r => r.projSiteVisits.length > 0).length === 0
                ? "No PM site visits recorded yet. Complete a PM Site Visit Report to see comparison data here."
                : "No projects match the selected filters."}
            </div>
          )}

          {/* eslint-disable-next-line no-unused-vars */}
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
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 2 }}>{project.storeCode} — {project.shoppingMallName}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
                  {project.generalContractor && <span style={{ marginRight: 10, color: "var(--text-secondary)", fontWeight: 600 }}>{project.generalContractor}</span>}
                  PM Alignment Score: <span style={{ fontWeight: 700, color: contScore.pmAlignmentScore >= 80 ? "var(--status-done)" : contScore.pmAlignmentScore >= 60 ? "var(--status-warn)" : "var(--status-alert)" }}>{contScore.pmAlignmentScore} / 100</span>
                  {" · "}{visitsSorted.length} site visit{visitsSorted.length !== 1 ? "s" : ""}
                </div>
                {visitsSorted.map((visit, vi) => {
                  const visitDate = new Date(visit.visitDate || visit.submittedAt);
                  const gcAtVisit = sorted.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sorted[sorted.length - 1];
                  const items = computePmAlignmentItems(gcAtVisit, visit);
                  const { matchRate, overstatements, matches } = summarizeAlignmentItems(items);
                  const matchColor = matchRate >= 80 ? "var(--status-done)" : matchRate >= 60 ? "var(--status-warn)" : "var(--status-alert)";
                  return (
                    <div key={vi} style={{ background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-secondary)" }}>Visit {visitDate.toLocaleDateString("en-GB")}</div>
                          {gcAtVisit && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>vs GC report {new Date(gcAtVisit.reportingDate || gcAtVisit.submittedAt).toLocaleDateString("en-GB")}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: matchColor }}>{matchRate}%</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Match rate</div></div>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: overstatements.length > 0 ? "var(--status-alert)" : "var(--status-done)" }}>{overstatements.length}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Overstated</div></div>
                          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: "var(--status-done)" }}>{matches.length}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>Matches</div></div>
                        </div>
                      </div>
                      {items.length > 0 && (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: `2px solid var(--border)` }}>
                                {["Work Item", "Contractor Status", "PM Observed", "Mismatch Type", "Severity"].map(h => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{h}</th>
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
                                const rowBg     = item.severity === "CRITICAL" ? 'var(--status-alert-bg)' : item.severity === "HIGH" ? 'var(--status-warn-bg)' : item.severity === "MEDIUM" ? 'var(--status-warn-bg)' : isPmAhead ? 'var(--status-done-bg)' : 'transparent';
                                const typeColor = item.severity === "CRITICAL" ? "var(--status-alert)" : item.severity === "HIGH" ? "var(--status-warn)" : item.severity === "MEDIUM" ? "var(--status-warn)" : isPmAhead ? "var(--status-done)" : "var(--text-muted)";
                                return (
                                  <tr key={ii} style={{ borderBottom: "1px solid var(--border)", background: rowBg, opacity: isMatch ? 0.6 : 1 }}>
                                    <td style={{ padding: "7px 10px", fontSize: 12, color: "var(--text-secondary)", maxWidth: 220 }}>{item.name}</td>
                                    <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: item.overstate ? 700 : 400, color: item.overstate ? "var(--status-alert)" : "var(--text-secondary)" }}>{item.gcStatus}</span></td>
                                    <td style={{ padding: "7px 10px", fontSize: 12 }}><span style={{ fontWeight: isPmAhead ? 700 : 400, color: isPmAhead ? "var(--status-done)" : "var(--text-secondary)" }}>{item.pmStatus}</span></td>
                                    <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: typeColor }}>{item.mismatchType}</td>
                                    <td style={{ padding: "7px 10px" }}>
                                      {sev ? (
                                        <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 9, fontSize: 11, fontWeight: 700, background: sev.bg, color: sev.text, border: `1px solid ${sev.border}` }}>{item.severity}</span>
                                      ) : isMatch ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--status-done)", fontWeight: 600 }}><Glyph name="check" /> Match</span>
                                      ) : (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--status-done)" }}><Glyph name="arrowUp" /> PM ahead</span>
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
                        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                          PM schedule assessment: <span style={{ fontWeight: 700, color: isSevereScheduleStatus(visit.pmScheduleAssessment) ? "var(--status-alert)" : visit.pmScheduleAssessment === "At Risk" ? "var(--status-warn)" : "var(--status-done)" }}>{visit.pmScheduleAssessment}</span>
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
      {/* ════════════════════════════════════════════
          VIEW: GANTT SPI
          ════════════════════════════════════════════ */}
      {activeView === "gantt-spi" && (
        <div style={{ display: "grid", gap: 16 }}>
          {ganttSpiLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: 14 }}>
              Loading Gantt SPI data…
            </div>
          )}

          {!ganttSpiLoading && (
            <>
              {/* ── SPI Overview table ── */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Schedule Performance Index (SPI) — All Projects</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>SPI = actual progress ÷ planned progress · ≥0.95 On Schedule · 0.80–0.94 At Risk · &lt;0.80 Critical</div>
                {ganttMetricsMap.size === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No Gantt data found. Generate a Gantt for your projects to see SPI analytics.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                          {['Project', 'SPI', 'Status', 'Critical Path', 'Last Visit', 'Trend (8w)'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allRows.map(({ project }) => {
                          const m    = ganttMetricsMap.get(project.id);
                          const st   = m ? SPI_STATUS[m.spiStatus] : SPI_STATUS.no_schedule;
                          const ch   = m?.criticalHealth;
                          const chColor = !ch || ch.total === 0 ? 'var(--text-muted)' : ch.label === 'healthy' ? 'var(--status-done)' : ch.label === 'warning' ? 'var(--status-warn)' : 'var(--status-alert)';
                          const trend = projectTrends[project.id] || [];
                          return (
                            <tr key={project.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{project.storeCode}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{project.shoppingMallName}</div>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: st.color }}>
                                  {m?.spi != null ? m.spi.toFixed(2) : '—'}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ background: st.bg, color: st.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                  {st.label}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {ch && ch.total > 0 ? (
                                  <span style={{ color: chColor, fontSize: 12, fontWeight: 600 }}>
                                    {ch.behind === 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Glyph name="check" /> All on track</span> : `${ch.behind}/${ch.total} behind`}
                                  </span>
                                ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                                {m?.lastVisitDate
                                  ? new Date(m.lastVisitDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                                  : '—'}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <SPISparkline points={trend} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Discrepancy History ── */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Discrepancy History</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>PM vs GC progress gaps from site visits · latest 10 per project</div>
                {allRows.map(({ project }) => {
                  const discs = discHistory[project.id] || [];
                  if (discs.length === 0) return null;
                  const critCount = discs.filter(d => d.status === 'critical').length;
                  const warnCount = discs.filter(d => d.status === 'warning').length;
                  return (
                    <div key={project.id} style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{project.storeCode}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{project.shoppingMallName}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {critCount > 0 && <span style={{ color: 'var(--status-alert)', fontSize: 12, fontWeight: 700 }}>{critCount} critical</span>}
                          {warnCount > 0 && <span style={{ color: 'var(--status-warn)', fontSize: 12, fontWeight: 700 }}>{warnCount} warning</span>}
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['WP', 'Visit Date', 'GC%', 'PM%', 'Delta', 'Status'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {discs.map((d, i) => {
                              const stColor = d.status === 'critical' ? 'var(--status-alert)' : d.status === 'warning' ? 'var(--status-warn)' : 'var(--status-done)';
                              return (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-secondary)' }}>{d.wpId}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.visitDate ? new Date(d.visitDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.contractorPct ?? '—'}%</td>
                                  <td style={{ padding: '5px 8px', fontSize: 12, color: 'var(--text-muted)' }}>{d.sitePct ?? '—'}%</td>
                                  <td style={{ padding: '5px 8px', fontSize: 13, fontWeight: 700, color: stColor }}>{d.delta != null ? `Δ${d.delta}%` : '—'}</td>
                                  <td style={{ padding: '5px 8px' }}>
                                    <span style={{ background: d.status === 'critical' ? 'var(--status-alert-bg)' : d.status === 'warning' ? 'var(--status-warn-bg)' : 'var(--status-done-bg)', color: stColor, borderRadius: 5, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                                      {d.status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
                {allRows.every(({ project }) => !(discHistory[project.id]?.length > 0)) && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No discrepancy data yet. Submit PM site visits to track GC vs PM gaps.</div>
                )}
              </div>

              {/* ── Contractor Reliability ── */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>Contractor Reliability Score</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Based on site_visit_discrepancies · score = 100% - (critical gaps / total assessments)</div>
                {reliabilityMap.size === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No discrepancy data yet.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {allRows.map(({ project }) => {
                      const rel = reliabilityMap.get(project.id);
                      if (!rel || rel.total === 0) return null;
                      const scoreColor = rel.score >= 80 ? 'var(--status-done)' : rel.score >= 60 ? 'var(--status-warn)' : 'var(--status-alert)';
                      return (
                        <div key={project.id} style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{project.storeCode}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{project.generalContractor || 'No GC'}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{rel.score}</span>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                              <div>{rel.ok} ok</div>
                              {rel.warning > 0 && <div style={{ color: 'var(--status-warn)' }}>{rel.warning} warn</div>}
                              {rel.critical > 0 && <div style={{ color: 'var(--status-alert)' }}>{rel.critical} crit</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}

export default RiskDashboard;
