import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDashboardModel } from "../hooks/useDashboardModel";
import { getProgressSnapshot } from "../hooks/useDashboardOrchestration";
import { ActivityHeatmap } from "../components/dashboard/DashboardWidgets";
import SummaryPanel, { ReportingSummary } from "../components/dashboard/SummaryPanel";
import StatusMatrix from "../components/dashboard/StatusMatrix";
import ProjectHeatmap from "../components/dashboard/ProjectHeatmap";
import ProgressTab from "../components/dashboard/ProgressTab";
import ContractorsTab from "../components/dashboard/ContractorsTab";
import DashboardMasterList from "../components/dashboard/DashboardMasterList";
import DashboardProjectOverview from "../components/dashboard/DashboardProjectOverview";
import MasterDetailLayout from "../components/shared/MasterDetailLayout";
import { useGanttMetrics } from "../hooks/useGanttMetrics";
import { useAllRows } from "../hooks/useAllRows";
import { SPI_STATUS } from "../config/statusColors";
import { SCHEDULE_STATUS } from "../utils/reportUtils";
import { isoWeekToMonday, currentISOWeek } from "../utils/scheduleUtils";
import Icon from "../components/shared/Icon";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "workpackages", label: "Work Packages" },
  { id: "progress", label: "Progress" },
  { id: "contractors", label: "Contractors" },
  { id: "activity", label: "Activity" },
];

function isoWeekLabel(isoWeekStr) {
  const week = parseInt(isoWeekStr.split('-W')[1], 10);
  const monday = isoWeekToMonday(isoWeekStr);
  return `Week ${week} — ${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

function PortfolioAlerts({ alerts, onDismiss }) {
  if (alerts.length === 0) return null;

  return (
    <section className="dashboard-detail-section dashboard-attention-section" aria-labelledby="portfolio-attention-title">
      <div className="dashboard-section-heading">
        <div>
          <h3 id="portfolio-attention-title">Projects needing attention</h3>
          <p>Schedule signals from the canonical dashboard model.</p>
        </div>
        {alerts.length > 5 && <span>{alerts.length - 5} more</span>}
      </div>
      <div className="dashboard-attention-list">
        {alerts.slice(0, 5).map((alert) => {
          const status = SPI_STATUS[alert.spiStatus];
          return (
            <div key={alert.pid} className={`dashboard-attention-row is-${alert.spiStatus}`}>
              <span className="dashboard-attention-status">
                <Icon name={alert.spiStatus === 'critical' ? 'block' : 'warning'} size={14} />
                {status.label}
              </span>
              <strong>{alert.code}</strong>
              <span>{alert.mall}</span>
              <span>SPI {alert.spi?.toFixed(2) ?? 'Unavailable'}</span>
              {alert.criticalTasksBehind > 0 && <span>{alert.criticalTasksBehind} critical tasks behind</span>}
              <button
                type="button"
                className="btn-icon"
                aria-label={`Dismiss ${alert.code} schedule alert`}
                onClick={() => onDismiss(alert.pid)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PortfolioOverview({
  kpis,
  spiRows,
  allRows,
  reportsTotal,
  svKpis,
  lastVisitDate,
  spiAlerts,
  onDismissAlert,
  snapshotWeek,
  snapshotLoading,
  snapshotData,
  onSnapshotWeekChange,
  rows,
  alerts,
  selectedProjectId,
  onSelectProject,
}) {
  return (
    <div className="dashboard-portfolio-overview">
      <PortfolioAlerts alerts={spiAlerts} onDismiss={onDismissAlert} />

      <section className="dashboard-detail-section">
        <h3>Portfolio Scope & Health</h3>
        <SummaryPanel kpis={kpis} rows={spiRows} allRows={allRows} />
      </section>

      <section className="dashboard-detail-section dashboard-portfolio-tools">
        <div>
          <h3>Reporting</h3>
          <ReportingSummary kpis={kpis} reportsTotal={reportsTotal} svKpis={svKpis} lastVisitDate={lastVisitDate} />
        </div>
        <div className="dashboard-snapshot-control">
          <label htmlFor="dashboard-snapshot-week">Snapshot</label>
          <p>View a past week&apos;s progress. Snapshot values are read-only.</p>
          <div>
            <input
              id="dashboard-snapshot-week"
              className="ds-input"
              type="week"
              max={currentISOWeek()}
              value={snapshotWeek || ''}
              onChange={(event) => onSnapshotWeekChange(event.target.value)}
            />
            {snapshotWeek && (
              <button type="button" className="btn-ghost-sm" onClick={() => onSnapshotWeekChange(null)}>
                <Icon name="close" size={13} /> Live
              </button>
            )}
          </div>
        </div>
      </section>

      {snapshotWeek && (
        <div className="dashboard-snapshot-banner" role="status">
          <strong>{snapshotLoading ? 'Loading snapshot...' : `Viewing ${isoWeekLabel(snapshotWeek)}`}</strong>
          <span>Read-only · progress values from history</span>
          <button type="button" className="btn-icon" aria-label="Return to live dashboard" onClick={() => onSnapshotWeekChange(null)}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <StatusMatrix
        rows={rows}
        alerts={alerts}
        drawerProjectId={selectedProjectId}
        onSelect={onSelectProject}
        snapshotData={snapshotData}
        snapshotMode={Boolean(snapshotWeek)}
      />
    </div>
  );
}

function Dashboard({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  // Supports deep-linking a specific project into Dashboard (e.g. from Home's
  // priority queue) via ?project=<id> — read once on mount, same convention
  // as the snag pages' useSearchParams usage. Not synced back to the URL on
  // in-page selection changes; this is one-way entry, not full URL state.
  const [searchParams] = useSearchParams();
  const linkedProjectId = searchParams.get("project");

  const [activeView, setActiveView] = useState("overview");
  const [selectedProjectId, setSelectedProjectId] = useState(() => linkedProjectId);
  const [mobileView, setMobileView] = useState(() => (linkedProjectId ? "detail" : "master"));
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedAlertIds, setDismissedAlertIds] = useState(new Set());
  const [snapshotWeek, setSnapshotWeek] = useState(null);
  const [snapshotData, setSnapshotData] = useState({});
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const handleSnapshotWeekChange = useCallback(async (weekStr) => {
    if (!weekStr) {
      setSnapshotWeek(null);
      setSnapshotData({});
      return;
    }
    setSnapshotWeek(weekStr);
    setSnapshotLoading(true);
    try {
      setSnapshotData(await getProgressSnapshot(weekStr));
    } catch (error) {
      console.warn('[snapshot] fetch failed:', error);
      setSnapshotData({});
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const ganttMetrics = useGanttMetrics(projects);
  const allRows = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);

  const filteredRows = useMemo(() => allRows.filter(({ project, latestReport, missingReport }) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchable = [project.storeCode, project.shoppingMallName, project.city, project.country]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!searchable.includes(query)) return false;
    }
    if (filterStatus === "active" && project.projectStatus !== "Active") return false;
    if (filterStatus === "completed" && project.projectStatus !== "Completed") return false;
    if (filterStatus === "on-track" && latestReport?.projectScheduleStatus !== SCHEDULE_STATUS.ON_TRACK) return false;
    if (filterStatus === "at-risk" && latestReport?.projectScheduleStatus !== SCHEDULE_STATUS.AT_RISK) return false;
    if (filterStatus === "delayed" && latestReport?.projectScheduleStatus !== SCHEDULE_STATUS.DELAYED) return false;
    if (filterStatus === "critical" && latestReport?.projectScheduleStatus !== SCHEDULE_STATUS.CRITICAL) return false;
    if (filterStatus === "no-report" && latestReport) return false;
    if (filterStatus === "missing" && !missingReport) return false;
    return true;
  }), [allRows, searchQuery, filterStatus]);

  const defaultSorted = useMemo(
    () => [...filteredRows].sort((a, b) => a.priorityScore - b.priorityScore || a.progress - b.progress),
    [filteredRows],
  );

  const { kpis, spiRows, alerts, contractorPerf, svData, svKpis } =
    useDashboardModel({ projects, reports, siteVisits, allRows, ganttMetrics });

  const spiAlerts = useMemo(
    () => alerts
      .filter((alert) => alert.type === 'spi' && !dismissedAlertIds.has(alert.pid))
      .sort((a, b) => (a.spi ?? 1) - (b.spi ?? 1)),
    [alerts, dismissedAlertIds],
  );

  const heatmapRows = useMemo(() => {
    const weekCount = 16;
    const now = new Date();
    const weeks = Array.from({ length: weekCount }, (_, index) => {
      const start = new Date(now);
      start.setDate(start.getDate() - (weekCount - 1 - index) * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    });
    return allRows.map(({ project, projReports }) => ({
      project,
      cells: weeks.map(({ start, end }) => {
        const weekReports = projReports.filter((report) => {
          const date = new Date(report.reportingDate || report.submittedAt);
          return date >= start && date <= end;
        });
        return { count: weekReports.length, status: weekReports.at(-1)?.projectScheduleStatus };
      }),
    }));
  }, [allRows]);

  const lastVisitDate = useMemo(() => {
    const dates = svData.map((entry) => entry.visit?.visitDate || entry.visit?.submittedAt).filter(Boolean);
    return dates.length ? dates.sort().at(-1) : null;
  }, [svData]);

  const selectedRow = useMemo(
    () => selectedProjectId === null
      ? null
      : allRows.find(({ project }) => String(project.id) === selectedProjectId) ?? null,
    [allRows, selectedProjectId],
  );

  const selectedSiteVisits = useMemo(
    () => selectedRow
      ? siteVisits.filter((visit) => String(visit.projectId) === String(selectedRow.project.id))
      : [],
    [siteVisits, selectedRow],
  );

  const detailRows = selectedRow ? [selectedRow] : defaultSorted;
  const detailHeatmapRows = selectedRow
    ? heatmapRows.filter(({ project }) => String(project.id) === selectedProjectId)
    : heatmapRows.filter(({ project }) => filteredRows.some(({ project: candidate }) => candidate.id === project.id));
  const detailContractorPerf = selectedRow
    ? contractorPerf.filter((contractor) => contractor.projects?.includes(selectedRow.project.storeCode))
    : contractorPerf;

  function selectProject(id) {
    setSelectedProjectId(String(id));
    setMobileView("detail");
  }

  function selectPortfolio() {
    setSelectedProjectId(null);
    setMobileView("detail");
  }

  function changeFilter(value) {
    setFilterStatus(value);
    setSelectedProjectId(null);
  }

  function changeSearch(value) {
    setSearchQuery(value);
    setSelectedProjectId(null);
  }

  const detailHeader = (
    <header className="detail-pane-header">
      <button type="button" className="btn btn-ghost-sm dashboard-back-to-master" onClick={() => setMobileView("master")}>
        <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} /> Projects
      </button>
      <div className="dashboard-detail-identity">
        <div>
          <div className="dashboard-detail-title">
            {selectedRow
              ? `${selectedRow.project.storeCode || 'Project'} — ${selectedRow.project.shoppingMallName || 'Name not set'}`
              : 'Portfolio Overview'}
          </div>
          <div className="dashboard-detail-meta">
            {selectedRow
              ? [
                  [selectedRow.project.city, selectedRow.project.country].filter(Boolean).join(', '),
                  selectedRow.project.storeConcept || selectedRow.project.projectType,
                  selectedRow.project.storeSizeSqm ? `${selectedRow.project.storeSizeSqm} m²` : null,
                ].filter(Boolean).join(' · ') || 'Project metadata not set'
              : `${projects.length} projects · portfolio health, reporting and operational attention`}
          </div>
        </div>
        {selectedRow && <span className="dashboard-lifecycle-badge">{selectedRow.project.projectStatus || 'Status not set'}</span>}
      </div>
      {selectedRow && (
        <div className="dashboard-detail-actions">
          <a className="btn btn-primary" href={`/site-visit/${selectedRow.project.id}`} target="_blank" rel="noreferrer">Site Visit</a>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/contractor-report/${selectedRow.project.id}`).catch(() => {})}
          >
            Copy report link
          </button>
        </div>
      )}
    </header>
  );

  const detailTabs = (
    <div className="detail-pane-tabs" role="tablist" aria-label="Dashboard detail views">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          id={`dashboard-tab-${id}`}
          type="button"
          role="tab"
          aria-selected={activeView === id}
          aria-controls="dashboard-detail-tabpanel"
          tabIndex={activeView === id ? 0 : -1}
          onClick={() => setActiveView(id)}
          className={activeView === id ? 'detail-tab is-active' : 'detail-tab'}
        >
          {label}
        </button>
      ))}
    </div>
  );

  let detailContent;
  if (activeView === "overview") {
    detailContent = selectedRow ? (
      <DashboardProjectOverview row={selectedRow} siteVisits={selectedSiteVisits} />
    ) : (
      <PortfolioOverview
        kpis={kpis}
        spiRows={spiRows}
        allRows={allRows}
        reportsTotal={reports.length}
        svKpis={svKpis}
        lastVisitDate={lastVisitDate}
        spiAlerts={spiAlerts}
        onDismissAlert={(id) => setDismissedAlertIds((current) => new Set([...current, id]))}
        snapshotWeek={snapshotWeek}
        snapshotLoading={snapshotLoading}
        snapshotData={snapshotData}
        onSnapshotWeekChange={handleSnapshotWeekChange}
        rows={defaultSorted}
        alerts={alerts}
        selectedProjectId={selectedProjectId}
        onSelectProject={selectProject}
      />
    );
  } else if (activeView === "workpackages") {
    detailContent = <ProjectHeatmap rows={detailRows} onRowClick={selectProject} />;
  } else if (activeView === "progress") {
    detailContent = <ProgressTab rows={detailRows} onSelect={selectProject} ganttMetrics={ganttMetrics} />;
  } else if (activeView === "contractors") {
    detailContent = <ContractorsTab contractorPerf={detailContractorPerf} />;
  } else {
    detailContent = (
      <div className="dashboard-summary-card">
        <div className="dashboard-content-heading">Report Activity Heatmap</div>
        <div className="dashboard-content-subtitle">Last 16 weeks · cell = reports submitted · color = schedule status</div>
        <ActivityHeatmap projectRows={detailHeatmapRows} weekCount={16} />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-page-header">
        <div>
          <h1>Project Dashboard</h1>
          <p>Select a project, understand its operational state, and act in context.</p>
        </div>
        <div className="dashboard-current-date">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <MasterDetailLayout
        className="dashboard-master-detail"
        mobileView={mobileView}
        master={(
          <DashboardMasterList
            rows={allRows}
            filteredRows={defaultSorted}
            selectedProjectId={selectedProjectId}
            searchQuery={searchQuery}
            onSearchChange={changeSearch}
            filterStatus={filterStatus}
            onFilterChange={changeFilter}
            onSelectPortfolio={selectPortfolio}
            onSelectProject={selectProject}
          />
        )}
        detailHeader={detailHeader}
        detailTabs={detailTabs}
        detail={(
          <div
            id="dashboard-detail-tabpanel"
            role="tabpanel"
            aria-labelledby={`dashboard-tab-${activeView}`}
            className="dashboard-detail-tabpanel"
          >
            {detailContent}
          </div>
        )}
      />
    </div>
  );
}

export default Dashboard;
