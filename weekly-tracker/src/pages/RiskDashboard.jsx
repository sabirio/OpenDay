import { useEffect, useMemo, useState } from "react";
import { useRiskRows } from "../hooks/useRiskRows";
import { loadProjectTrend } from "../hooks/useProjectTrend";
import { useGanttMetrics } from "../hooks/useGanttMetrics";
import { loadContractorReliability } from "../hooks/useContractorReliability";
import { loadDiscrepancyHistory } from "../hooks/useDiscrepancyHistory";
import {
  computeRiskDashboardContractorScores,
  computeRiskDashboardSummaryStats,
} from "../hooks/useRiskDashboardCalculations";
import RiskSummaryKpis, { SupportingRiskKpis } from "../components/risk/RiskSummaryKpis";
import CriticalWarnings from "../components/risk/CriticalWarnings";
import Glyph from "../components/risk/Glyph";
import OverviewTab from "../components/risk/OverviewTab";
import HeatmapTab from "../components/risk/HeatmapTab";
import EscalationsTab from "../components/risk/EscalationsTab";
import ContractorsTab from "../components/risk/ContractorsTab";
import PmAlignmentTab from "../components/risk/PmAlignmentTab";
import GanttSpiTab from "../components/risk/GanttSpiTab";
import { RISK_COLORS } from "../config/riskConfig";
import { RISK_LEVELS } from "../hooks/useRiskLevelPresentation";
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

  // Gantt SPI tab state (loaded lazily). `spiResult.idsKey` tracks which set
  // of project ids the loaded trend/discrepancy/reliability data actually
  // belongs to — "loading" is derived (idsKey !== the current project id
  // set) rather than a separate boolean set synchronously at the top of the
  // effect, and a stale response for a since-changed project set can no
  // longer overwrite fresher state (the old version had no such guard at
  // all — `alive` here is a genuine correctness fix, not just a lint fix).
  const ganttMetricsMap = useGanttMetrics(projects, activeView === 'gantt-spi');
  const [spiResult, setSpiResult] = useState({ idsKey: null, projectTrends: {}, discHistory: {}, reliabilityMap: new Map() });

  useEffect(() => {
    if (activeView !== 'gantt-spi' || !projects || projects.length === 0) return;
    const ids = projects.map(p => p.id);
    let alive = true;
    Promise.all([
      loadContractorReliability(ids),
      Promise.all(ids.map(id => loadProjectTrend(id, 8).then(t => [id, t]))),
      Promise.all(ids.map(id => loadDiscrepancyHistory(id, 10).then(d => [id, d]))),
    ]).then(([reliability, trends, discs]) => {
      if (!alive) return;
      setSpiResult({
        idsKey: ids.join(','),
        reliabilityMap: reliability,
        projectTrends: Object.fromEntries(trends),
        discHistory: Object.fromEntries(discs),
      });
    }).catch(err => console.error('[risk] gantt-spi load error:', err));
    return () => { alive = false; };
  }, [activeView, projects]);

  const ganttSpiIdsKey = (projects || []).map(p => p.id).join(',');
  const ganttSpiLoading = activeView === 'gantt-spi' && !!projects && projects.length > 0 && spiResult.idsKey !== ganttSpiIdsKey;
  const { projectTrends, discHistory, reliabilityMap } = spiResult;

  const allRows = useRiskRows(projects, reports, siteVisits, useSCurve);

  const sortedByRisk   = useMemo(() => [...allRows].sort((a, b) => b.riskScore.score - a.riskScore.score), [allRows]);
  const criticalRows   = useMemo(() => sortedByRisk.filter(r => r.riskScore.level === RISK_LEVELS.CRITICAL), [sortedByRisk]);
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
    computeRiskDashboardContractorScores(contractorTabRows),
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

  const summaryStats = useMemo(() => computeRiskDashboardSummaryStats(allRows), [allRows]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Risk Dashboard</h1>
          <p>Project health - Risk scoring - Contractor performance - PM verification alignment.</p>
        </div>
      </div>

      <PrintHeader title="Risk & Readiness Dashboard" exportedBy={user?.email} />

      <div className="split-workspace">
        <div className="workspace">
          {/* Headline risk-level signals — "where is risk" at a glance */}
          <div className="no-break" style={{ marginBottom: 4 }}>
            <RiskSummaryKpis summaryStats={summaryStats} riskColors={RISK_COLORS} />
          </div>

          {/* Monte Carlo forecast model toggle — affects every project's forecast
              (CRITICAL/HIGH cards in the Overview tab), not just one widget, since
              all rows share one useRiskRows() computation. Frequently used and
              changes the meaning of the primary analytical output below, so it
              stays here rather than moving to the Inspector. */}
          <div className="no-print" role="group" aria-labelledby="forecast-model-label" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <span id="forecast-model-label" style={{ fontSize: 13, color: "var(--text-muted)" }}>Forecast model:</span>
            <button
              type="button"
              aria-pressed={!useSCurve}
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
              aria-pressed={useSCurve}
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
          <div role="group" aria-label="Risk dashboard view" style={{ display: "flex", gap: 3, marginBottom: 20, background: "var(--accent-subtle)", borderRadius: 12, padding: 4, border: "1px solid var(--border)", width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
            {VIEWS.map(({ id, label }) => (
              <button key={id} type="button" aria-pressed={activeView === id} data-testid="risk-view-tab" data-view-id={id} onClick={() => setActiveView(id)} style={{
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

        {/* ── Inspector: supporting risk metrics + export — no selected-risk
            state exists yet in Risk Dashboard, so this is a default-only
            context rail rather than a dynamic one (see Phase 4B report). ── */}
        <div className="inspector">
          <div className="inspector-section">
            <div className="inspector-section-title">Supporting metrics</div>
            <SupportingRiskKpis summaryStats={summaryStats} />
          </div>

          <div className="inspector-section">
            <div className="inspector-section-title">Actions</div>
            <ExportButton label="Export Risk Report PDF" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default RiskDashboard;
