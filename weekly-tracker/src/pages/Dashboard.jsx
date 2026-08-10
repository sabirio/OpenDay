import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES } from "../auth/rolePermissions";
import { isContractorManaged } from "../hooks/useScheduleOwnershipMode";
import { useDashboardModel } from "../hooks/useDashboardModel";
import { getProgressSnapshot } from "../hooks/useDashboardOrchestration";
import { ActivityHeatmap } from "../components/dashboard/DashboardWidgets";
import { PortfolioSummaryPanel } from "../components/dashboard/SummaryPanel";
import DashboardAttentionStrip from "../components/dashboard/DashboardAttentionStrip";
import StatusMatrix from "../components/dashboard/StatusMatrix";
import ProjectHeatmap from "../components/dashboard/ProjectHeatmap";
import ProgressTab from "../components/dashboard/ProgressTab";
import ContractorsTab from "../components/dashboard/ContractorsTab";
import DashboardMasterList from "../components/dashboard/DashboardMasterList";
import DashboardProjectOverview from "../components/dashboard/DashboardProjectOverview";
import MasterDetailLayout from "../components/shared/MasterDetailLayout";
import StatusBadge from "../components/shared/StatusBadge.jsx";
import { useGanttMetrics } from "../hooks/useGanttMetrics";
import { useAllRows } from "../hooks/useAllRows";
import { SPI_STATUS } from "../config/statusColors";
import { formatDate, SCHEDULE_STATUS } from "../utils/reportUtils";
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
      {/* LEVEL 1 — decision signals: is anything wrong, what needs attention */}
      <DashboardAttentionStrip kpis={kpis} />
      <PortfolioAlerts alerts={spiAlerts} onDismiss={onDismissAlert} />

      {snapshotWeek && (
        <div className="dashboard-snapshot-banner" role="status">
          <strong>{snapshotLoading ? 'Loading snapshot...' : `Viewing ${isoWeekLabel(snapshotWeek)}`}</strong>
          <span>Read-only · progress values from history</span>
          <button type="button" className="btn-icon" aria-label="Return to live dashboard" onClick={() => onSnapshotWeekChange(null)}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <PortfolioSummaryPanel
        rows={spiRows}
        allRows={allRows}
        kpis={kpis}
        reportsTotal={reportsTotal}
        svKpis={svKpis}
        lastVisitDate={lastVisitDate}
      />

      <StatusMatrix
        rows={rows}
        alerts={alerts}
        drawerProjectId={selectedProjectId}
        onSelect={onSelectProject}
        snapshotData={snapshotData}
        snapshotMode={Boolean(snapshotWeek)}
      />

      {/* Snapshot remains available as read-only context after the operational
          panel and Matrix instead of interrupting their decision flow. */}
      <details className="dashboard-snapshot-disclosure" open={Boolean(snapshotWeek)}>
        <summary>Snapshot — view a past week&apos;s progress</summary>
        <div className="dashboard-snapshot-control">
          <p>Snapshot values are read-only.</p>
          <div>
            <input
              id="dashboard-snapshot-week"
              aria-label="Snapshot week"
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
      </details>

    </div>
  );
}

function Dashboard({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const { role } = useAuth();
  // Simplification Phase 4B.2 Section I: the smallest appropriate PM Review
  // entry point — PM/Admin only (Contractor never lands on Dashboard;
  // Viewer must not reach Schedule Review at all, see rolePermissions.js),
  // shown only for CONTRACTOR_MANAGED projects. Deliberately unconditional
  // on whether a submission is actually pending — computing that live for
  // every row here would duplicate the canonical lifecycle status check
  // (contractor_schedule_lifecycle_status) outside its one source of truth;
  // PMScheduleReview.jsx itself shows an honest empty state when nothing
  // has been submitted yet.
  const canReviewSchedules = role === ROLES.PM || role === ROLES.ADMIN;

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
  const [tabOverflowState, setTabOverflowState] = useState({ hasOverflow: false, atEnd: true });
  const detailTabsRef = useRef(null);

  const updateTabOverflow = useCallback(() => {
    const tabs = detailTabsRef.current;
    if (!tabs) return;
    const hasOverflow = tabs.scrollWidth > tabs.clientWidth + 1;
    const atEnd = !hasOverflow || tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
    setTabOverflowState((current) => (
      current.hasOverflow === hasOverflow && current.atEnd === atEnd
        ? current
        : { hasOverflow, atEnd }
    ));
  }, []);

  useEffect(() => {
    const tabs = detailTabsRef.current;
    if (!tabs) return undefined;
    updateTabOverflow();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateTabOverflow);
    observer?.observe(tabs);
    window.addEventListener('resize', updateTabOverflow);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateTabOverflow);
    };
  }, [updateTabOverflow]);

  useEffect(() => {
    const tabs = detailTabsRef.current;
    const activeTab = tabs?.querySelector(`#dashboard-tab-${activeView}`);
    if (!tabs || !activeTab) return;
    const left = activeTab.offsetLeft;
    const right = left + activeTab.offsetWidth;
    if (left < tabs.scrollLeft) tabs.scrollTo({ left, behavior: 'smooth' });
    if (right > tabs.scrollLeft + tabs.clientWidth) {
      tabs.scrollTo({ left: right - tabs.clientWidth, behavior: 'smooth' });
    }
    window.requestAnimationFrame(updateTabOverflow);
  }, [activeView, updateTabOverflow]);

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

  // Phase 4 cross-page consistency fix: filtering/searching the master list
  // used to unconditionally clear the open detail (setSelectedProjectId(null)
  // on every keystroke/filter click), even when the selected project still
  // existed. selectedRow is already derived from the full, unfiltered
  // allRows (see above) — same pattern Weekly Reports/Risk Dashboard use —
  // so the open project now stays open through filtering/search, matching
  // the established Site Snag "filtering never silently swaps or clears the
  // selected detail" contract. Only the master list's visible rows change.
  function changeFilter(value) {
    setFilterStatus(value);
  }

  function changeSearch(value) {
    setSearchQuery(value);
  }

  const detailHeader = (
    <header className="detail-pane-header dashboard-detail-header">
      <button type="button" className="btn btn-ghost-sm dashboard-back-to-master" onClick={() => setMobileView("master")}>
        <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} /> Back to Projects
      </button>
      <div className="dashboard-detail-identity">
        <div className="dashboard-detail-copy">
          {selectedRow && <div className="dashboard-detail-code">{selectedRow.project.storeCode || 'Project code not set'}</div>}
          <h1 className="dashboard-detail-title">
            {selectedRow
              ? selectedRow.project.shoppingMallName || 'Name not set'
              : 'Portfolio Overview'}
          </h1>
          <div className="dashboard-detail-meta">
            {selectedRow
              ? [
                  [selectedRow.project.city, selectedRow.project.country].filter(Boolean).join(', '),
                  selectedRow.project.storeConcept || selectedRow.project.projectType,
                ].filter(Boolean).join(' · ') || 'Project metadata not set'
              : `${projects.length} projects · portfolio health, reporting and operational attention`}
          </div>
          {selectedRow && (
            <div className="dashboard-detail-context">
              {[
                selectedRow.project.storeSizeSqm ? `${selectedRow.project.storeSizeSqm} m²` : null,
                selectedRow.project.targetOpeningDate ? `Target opening ${formatDate(selectedRow.project.targetOpeningDate)}` : null,
              ].filter(Boolean).join(' · ') || 'Area and opening context not set'}
            </div>
          )}
        </div>
      </div>
      {selectedRow && (
        <div className="dashboard-detail-status-actions">
          <StatusBadge tone="info">{selectedRow.project.projectStatus || 'Status not set'}</StatusBadge>
          {canReviewSchedules && isContractorManaged(selectedRow.project.scheduleOwnershipMode) && (
            <div className="dashboard-detail-actions">
              <Link className="btn btn-secondary" to={`/projects/${selectedRow.project.id}/schedule-review`}>
                Schedule Review
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );

  // Phase 4 cross-page consistency fix: Dashboard's tab bar was the one
  // .detail-pane-tabs implementation without arrow-key roving-tabindex
  // support — Portfolio (ProjectDetailTabs.jsx), Weekly Reports
  // (WeeklyReportTabs.jsx) and Risk Dashboard (RiskDetailTabs.jsx) already
  // support Left/Right/Home/End, so a keyboard user tabbing into any other
  // detail-pane tablist could reach every tab, but not here. Same handler
  // shape as those three (kept local rather than extracted, to avoid
  // touching three already-working files for one gap).
  function handleViewTabKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? VIEWS.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length;
    setActiveView(VIEWS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  const detailTabs = (
    <div className="dashboard-detail-tabs-shell">
      <div
        ref={detailTabsRef}
        className="detail-pane-tabs dashboard-detail-tabs"
        role="tablist"
        aria-label="Dashboard detail views"
        onScroll={updateTabOverflow}
      >
        {VIEWS.map(({ id, label }, index) => (
          <button
            key={id}
            id={`dashboard-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeView === id}
            aria-controls="dashboard-detail-tabpanel"
            tabIndex={activeView === id ? 0 : -1}
            onClick={() => setActiveView(id)}
            onKeyDown={(event) => handleViewTabKeyDown(event, index)}
            className={activeView === id ? 'detail-tab is-active' : 'detail-tab'}
          >
            {label}
          </button>
        ))}
      </div>
      {tabOverflowState.hasOverflow && !tabOverflowState.atEnd && (
        <>
          <span className="dashboard-tabs-overflow-cue" aria-hidden="true">›</span>
          <span className="sr-only">More dashboard views are available to the right.</span>
        </>
      )}
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
    <div className={`dashboard-page is-mobile-${mobileView}`}>
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
            className="dashboard-detail-tabpanel canonical-detail-content"
          >
            {detailContent}
          </div>
        )}
      />
    </div>
  );
}

export default Dashboard;
