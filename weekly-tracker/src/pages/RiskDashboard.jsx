import { useEffect, useMemo, useState } from "react";
import { computePortfolioContractorScores } from "../engines/contractorEngine";
import { useRiskRows } from "../hooks/useRiskRows";
import { loadProjectTrend } from "../hooks/useProjectTrend";
import { useGanttMetrics } from "../hooks/useGanttMetrics";
import { getDiscrepancyHistory } from "../services/dashboardService";
import { loadContractorReliability } from "../hooks/useContractorReliability";
import { computeRiskSummaryStats } from "../engines/portfolioRiskEngine";
import RiskSummaryKpis from "../components/risk/RiskSummaryKpis";
import CriticalWarnings from "../components/risk/CriticalWarnings";
import Glyph from "../components/risk/Glyph";
import OverviewTab from "../components/risk/OverviewTab";
import HeatmapTab from "../components/risk/HeatmapTab";
import EscalationsTab from "../components/risk/EscalationsTab";
import ContractorsTab from "../components/risk/ContractorsTab";
import PmAlignmentTab from "../components/risk/PmAlignmentTab";
import GanttSpiTab from "../components/risk/GanttSpiTab";
import { RISK_COLORS } from "../engines/riskEngine";
import { useAuth } from "../auth/AuthContext";
import PrintHeader from "../components/print/PrintHeader";
import ExportButton from "../components/print/ExportButton";

const VIEWS = [
  { id: "overview",     label: "Overview" },
  { id: "heatmap",      label: "Risk Heatmap" },
  { id: "escalations",  label: "Escalations" },
  { id: "contractors",  label: "Contractors" },
  { id: "pm-align",     label: "PM Alignment" },
  { id: "gantt-spi",    label: "Gantt SPI" },
];

// ── Main component ────────────────────────────────────────────────────────────

function RiskDashboard({ projects, reports, siteVisits = [] }) {
  const { user } = useAuth();
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeView, setActiveView] = useState("overview");
  const [filterStore, setFilterStore] = useState("");
  const [filterContractor, setFilterContractor] = useState("");
  const [filterReport, setFilterReport] = useState("");
  const [useSCurve, setUseSCurve] = useState(false);

  // Gantt SPI tab state (loaded lazily)
  const ganttMetricsMap = useGanttMetrics(projects, activeView === 'gantt-spi');
  const [projectTrends,   setProjectTrends]   = useState({});    // projectId → trend[]
  const [discHistory,     setDiscHistory]     = useState({});    // projectId → disc[]
  const [reliabilityMap,  setReliabilityMap]  = useState(new Map());
  const [ganttSpiLoading, setGanttSpiLoading] = useState(false);

  useEffect(() => {
    if (activeView !== 'gantt-spi' || !projects || projects.length === 0) return;
    setGanttSpiLoading(true);
    const ids = projects.map(p => p.id);
    Promise.all([
      loadContractorReliability(ids),
      Promise.all(ids.map(id => loadProjectTrend(id, 8).then(t => [id, t]))),
      Promise.all(ids.map(id => getDiscrepancyHistory(id, 10).then(d => [id, d]))),
    ]).then(([reliability, trends, discs]) => {
      setReliabilityMap(reliability);
      setProjectTrends(Object.fromEntries(trends));
      setDiscHistory(Object.fromEntries(discs));
    }).catch(err => console.error('[risk] gantt-spi load error:', err))
      .finally(() => setGanttSpiLoading(false));
  }, [activeView, projects]);

  const allRows = useRiskRows(projects, reports, siteVisits, useSCurve);

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
      {/* Page header + KPI cards */}
      <div className="page-header" style={{ alignItems: "flex-start" }}>
        <div>
          <h1>Risk Dashboard</h1>
          <p>Project health - Risk scoring - Contractor performance - PM verification alignment.</p>
        </div>
        <div className="no-break" style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <RiskSummaryKpis summaryStats={summaryStats} riskColors={RISK_COLORS} />
          <ExportButton label="Export Risk Report PDF" />
        </div>
      </div>

      <PrintHeader title="Risk & Readiness Dashboard" exportedBy={user?.email} />

      {/* Monte Carlo forecast model toggle — affects every project's forecast
          (CRITICAL/HIGH cards in the Overview tab), not just one widget, since
          all rows share one useRiskRows() computation. */}
      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Forecast model:</span>
        <button
          type="button"
          onClick={() => setUseSCurve(false)}
          style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
            background: !useSCurve ? "var(--accent)" : "var(--accent-subtle)",
            color:      !useSCurve ? "var(--text-inverse)" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          Linear
        </button>
        <button
          type="button"
          onClick={() => setUseSCurve(true)}
          style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
            background: useSCurve ? "var(--accent)" : "var(--accent-subtle)",
            color:      useSCurve ? "var(--text-inverse)" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          S-curve
        </button>
        {useSCurve && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
            accounts for deceleration in final phases
          </span>
        )}
      </div>

      {/* Critical early warnings (always visible) */}
      <CriticalWarnings rows={criticalRows} Glyph={Glyph} />
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

      {activeView === "overview" && (
        <OverviewTab sortedByRisk={sortedByRisk} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
      )}

      {activeView === "heatmap" && (
        <HeatmapTab sortedByRisk={sortedByRisk} />
      )}

      {activeView === "escalations" && (
        <EscalationsTab allEscalations={allEscalations} />
      )}

      {activeView === "contractors" && (
        <ContractorsTab
          allStoreCodes={allStoreCodes}
          allContractorNames={allContractorNames}
          filterStore={filterStore}
          setFilterStore={setFilterStore}
          filterContractor={filterContractor}
          setFilterContractor={setFilterContractor}
          contractorTabScores={contractorTabScores}
          contractorTabRows={contractorTabRows}
        />
      )}

      {activeView === "pm-align" && (
        <PmAlignmentTab
          allStoreCodes={allStoreCodes}
          allContractorNames={allContractorNames}
          filterStore={filterStore}
          setFilterStore={setFilterStore}
          filterContractor={filterContractor}
          setFilterContractor={setFilterContractor}
          filterReport={filterReport}
          setFilterReport={setFilterReport}
          pmAlignReportOptions={pmAlignReportOptions}
          pmAlignRows={pmAlignRows}
          allRows={allRows}
        />
      )}

      {activeView === "gantt-spi" && (
        <GanttSpiTab
          ganttSpiLoading={ganttSpiLoading}
          ganttMetricsMap={ganttMetricsMap}
          allRows={allRows}
          projectTrends={projectTrends}
          discHistory={discHistory}
          reliabilityMap={reliabilityMap}
        />
      )}
    </div>
  );
}

export default RiskDashboard;
