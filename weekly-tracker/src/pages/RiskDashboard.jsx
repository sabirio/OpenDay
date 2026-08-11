import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRiskRows } from '../hooks/useRiskRows';
import { loadProjectTrend } from '../hooks/useProjectTrend';
import { useGanttMetrics } from '../hooks/useGanttMetrics';
import { loadContractorReliability } from '../hooks/useContractorReliability';
import { loadDiscrepancyHistory } from '../hooks/useDiscrepancyHistory';
import {
  computeRiskDashboardContractorScores,
  computeRiskDashboardSummaryStats,
} from '../hooks/useRiskDashboardCalculations';
import MasterDetailLayout from '../components/shared/MasterDetailLayout';
import Icon from '../components/shared/Icon';
import RiskDashboardMasterList from '../components/risk/RiskDashboardMasterList';
import RiskDetailTabs from '../components/risk/RiskDetailTabs';
import { RiskSelectedDrivers, RiskSelectedOverview } from '../components/risk/RiskSelectedDetail';
import RiskSummaryKpis, { SupportingRiskKpis } from '../components/risk/RiskSummaryKpis';
import CriticalWarnings from '../components/risk/CriticalWarnings';
import Glyph from '../components/risk/Glyph';
import OverviewTab from '../components/risk/OverviewTab';
import HeatmapTab from '../components/risk/HeatmapTab';
import EscalationsTab from '../components/risk/EscalationsTab';
import ContractorsTab from '../components/risk/ContractorsTab';
import PmAlignmentTab from '../components/risk/PmAlignmentTab';
import GanttSpiTab from '../components/risk/GanttSpiTab';
import { RISK_COLORS } from '../config/riskConfig';
import { riskLevelToTone } from '../config/statusColors';
import { RISK_LEVELS } from '../hooks/useRiskLevelPresentation';
import StatusBadge from '../components/shared/StatusBadge.jsx';
import { useAuth } from '../auth/AuthContext';
import PrintHeader from '../components/print/PrintHeader';
import ExportButton from '../components/print/ExportButton';

function RiskDashboard({ projects, reports, siteVisits = [] }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedProjectId = searchParams.get('project');
  const [selectedRiskProjectId, setSelectedRiskProjectId] = useState(() => linkedProjectId);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileView, setMobileView] = useState(() => (linkedProjectId ? 'detail' : 'master'));
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [expandedRow, setExpandedRow] = useState(null);
  const [filterStore, setFilterStore] = useState('');
  const [filterContractor, setFilterContractor] = useState('');
  const [filterReport, setFilterReport] = useState('');
  const [useSCurve, setUseSCurve] = useState(false);

  const allRows = useRiskRows(projects, reports, siteVisits, useSCurve);
  const sortedByRisk = useMemo(
    () => [...allRows].sort((a, b) => b.riskScore.score - a.riskScore.score),
    [allRows],
  );
  const selectedRow = useMemo(
    () => selectedRiskProjectId === null
      ? null
      : sortedByRisk.find((row) => String(row.project.id) === selectedRiskProjectId) ?? null,
    [selectedRiskProjectId, sortedByRisk],
  );

  const filteredMasterRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedByRisk.filter((row) => {
      if (levelFilter !== 'all' && row.riskScore.level !== levelFilter) return false;
      if (!query) return true;
      const positiveFactors = row.riskScore.factors
        .filter((factor) => factor.pts > 0)
        .map((factor) => factor.name);
      return [
        row.project.storeCode,
        row.project.shoppingMallName,
        row.project.city,
        row.project.country,
        row.project.generalContractor,
        row.riskScore.level,
        ...positiveFactors,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    });
  }, [sortedByRisk, searchQuery, levelFilter]);

  const criticalRows = useMemo(
    () => sortedByRisk.filter((row) => row.riskScore.level === RISK_LEVELS.CRITICAL),
    [sortedByRisk],
  );
  const summaryStats = useMemo(() => computeRiskDashboardSummaryStats(allRows), [allRows]);
  const allEscalations = useMemo(
    () => allRows.flatMap(({ project, escalations }) => escalations.map((item) => ({ ...item, project }))),
    [allRows],
  );
  const selectedEscalations = useMemo(
    () => selectedRow
      ? selectedRow.escalations.map((item) => ({ ...item, project: selectedRow.project }))
      : allEscalations,
    [selectedRow, allEscalations],
  );

  const allStoreCodes = useMemo(
    () => [...new Set(allRows.map((row) => row.project.storeCode).filter(Boolean))].sort(),
    [allRows],
  );
  const allContractorNames = useMemo(
    () => [...new Set(allRows.map((row) => row.contractorName).filter(Boolean))].sort(),
    [allRows],
  );
  const contractorTabRows = useMemo(
    () => filterContractor ? allRows.filter((row) => row.contractorName === filterContractor) : allRows,
    [allRows, filterContractor],
  );
  const contractorTabScores = useMemo(
    () => computeRiskDashboardContractorScores(contractorTabRows),
    [contractorTabRows],
  );
  const pmAlignRows = useMemo(
    () => filterStore ? allRows.filter((row) => row.project.storeCode === filterStore) : allRows,
    [allRows, filterStore],
  );
  const evidenceRows = useMemo(() => selectedRow ? [selectedRow] : pmAlignRows, [selectedRow, pmAlignRows]);
  const pmAlignReportOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    evidenceRows.filter((row) => row.projSiteVisits.length > 0).forEach(({ sorted, projSiteVisits, project }) => {
      [...projSiteVisits]
        .sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))
        .forEach((visit) => {
          const visitDate = new Date(visit.visitDate || visit.submittedAt);
          const report = sorted.filter((item) => new Date(item.reportingDate || item.submittedAt) <= visitDate).slice(-1)[0]
            || sorted[sorted.length - 1];
          if (report && !seen.has(String(report.id))) {
            seen.add(String(report.id));
            const date = new Date(report.reportingDate || report.submittedAt);
            options.push({
              id: String(report.id),
              label: `${project.storeCode} — ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
              date: report.reportingDate || report.submittedAt,
            });
          }
        });
    });
    return options.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [evidenceRows]);

  const ganttMetricsMap = useGanttMetrics(projects, activeTab === 'trend');
  const [trendResult, setTrendResult] = useState({
    idsKey: null,
    projectTrends: {},
    discHistory: {},
    reliabilityMap: new Map(),
  });

  useEffect(() => {
    if (activeTab !== 'trend' || projects.length === 0) return;
    const ids = projects.map((project) => project.id);
    let alive = true;
    Promise.all([
      loadContractorReliability(ids),
      Promise.all(ids.map((id) => loadProjectTrend(id, 8).then((trend) => [id, trend]))),
      Promise.all(ids.map((id) => loadDiscrepancyHistory(id, 10).then((history) => [id, history]))),
    ]).then(([reliability, trends, discrepancies]) => {
      if (!alive) return;
      setTrendResult({
        idsKey: ids.join(','),
        reliabilityMap: reliability,
        projectTrends: Object.fromEntries(trends),
        discHistory: Object.fromEntries(discrepancies),
      });
    }).catch((error) => console.error('[risk] trend load error:', error));
    return () => { alive = false; };
  }, [activeTab, projects]);

  const trendIdsKey = projects.map((project) => project.id).join(',');
  const trendLoading = activeTab === 'trend' && projects.length > 0 && trendResult.idsKey !== trendIdsKey;
  const trendRows = selectedRow ? [selectedRow] : allRows;

  const detailTitle = selectedRow
    ? `${selectedRow.project.storeCode || 'Project'}${selectedRow.project.shoppingMallName ? ` — ${selectedRow.project.shoppingMallName}` : ''}`
    : 'All Risks';
  const detailLocation = selectedRow
    ? [selectedRow.project.city, selectedRow.project.country].filter(Boolean).join(', ')
    : `${allRows.length} projects · Portfolio risk overview`;

  return (
    <div className="risk-dashboard-page">
      <PrintHeader
        title="Risk & Readiness Dashboard"
        projectLabel={selectedRow ? detailTitle : undefined}
        exportedBy={user?.email}
      />

      <MasterDetailLayout
        className="risk-master-detail"
        mobileView={mobileView}
        master={(
          <RiskDashboardMasterList
            rows={sortedByRisk}
            filteredRows={filteredMasterRows}
            selectedRiskProjectId={selectedRow ? selectedRiskProjectId : null}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            levelFilter={levelFilter}
            onLevelFilterChange={setLevelFilter}
            onSelect={(projectId) => {
              setSelectedRiskProjectId(projectId);
              // Phase 4 cross-page consistency fix: previously forced the
              // detail tab back to Overview on every selection change,
              // unlike Portfolio/Dashboard/Weekly Reports, which all
              // preserve whichever tab the user had open across a master
              // selection change. Overview/Drivers/Evidence/Trend are all
              // meaningful for any selected project, so the tab now
              // persists too. filterReport IS reset — it's a report-scoped
              // filter value tied to the previous project's own reports and
              // wouldn't carry meaning for a newly selected project.
              setFilterReport('');
              setMobileView('detail');
            }}
            useSCurve={useSCurve}
            onForecastModelChange={setUseSCurve}
            summaryStats={summaryStats}
          />
        )}
        detailHeader={(
          <header className="detail-pane-header risk-detail-header">
            <button type="button" className="btn btn-ghost-sm risk-back-to-master" onClick={() => setMobileView('master')}>
              <Icon name="arrowRight" size={14} />
              Back
            </button>
            <div className="risk-detail-identity">
              <div className="risk-detail-title-row">
                <h2>{detailTitle}</h2>
                {selectedRow && (
                  <StatusBadge tone={riskLevelToTone(selectedRow.riskScore.level)}>
                    {selectedRow.riskScore.level}
                  </StatusBadge>
                )}
              </div>
              <div className="risk-detail-meta">
                <span>{detailLocation}</span>
                {selectedRow && <span>Risk Score {selectedRow.riskScore.score}</span>}
                {selectedRow?.schedDev?.predictedDelayDays > 0 && (
                  <span>Predicted delay +{selectedRow.schedDev.predictedDelayDays} days</span>
                )}
                {!selectedRow && <span>{summaryStats.CRITICAL} critical · {summaryStats.HIGH} high</span>}
              </div>
            </div>
            <div className="risk-detail-actions">
              <ExportButton label="Export Risk Report PDF" />
            </div>
          </header>
        )}
        detailTabs={<RiskDetailTabs activeTab={activeTab} onChange={setActiveTab} />}
        detail={(
          <div
            id="risk-detail-tabpanel"
            className="risk-detail-tabpanel canonical-detail-content"
            role="tabpanel"
            aria-labelledby={`risk-tab-${activeTab}`}
          >
            {activeTab === 'overview' && (
              selectedRow ? (
                <RiskSelectedOverview row={selectedRow} />
              ) : (
                <div className="risk-portfolio-overview">
                  <section className="risk-portfolio-summary">
                    <div>
                      <h3>Portfolio risk</h3>
                      <RiskSummaryKpis summaryStats={summaryStats} riskColors={RISK_COLORS} />
                    </div>
                    <div>
                      <h3>Supporting metrics</h3>
                      <SupportingRiskKpis summaryStats={summaryStats} />
                    </div>
                  </section>
                  <CriticalWarnings rows={criticalRows} Glyph={Glyph} />
                  <OverviewTab sortedByRisk={sortedByRisk} expandedRow={expandedRow} setExpandedRow={setExpandedRow} />
                </div>
              )
            )}

            {activeTab === 'drivers' && (
              selectedRow ? (
                <RiskSelectedDrivers row={selectedRow} />
              ) : (
                <div className="risk-portfolio-stack">
                  <HeatmapTab sortedByRisk={sortedByRisk} />
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
                </div>
              )
            )}

            {activeTab === 'evidence' && (
              <div className="risk-portfolio-stack">
                <EscalationsTab allEscalations={selectedEscalations} />
                <PmAlignmentTab
                  allStoreCodes={selectedRow ? [selectedRow.project.storeCode].filter(Boolean) : allStoreCodes}
                  allContractorNames={selectedRow ? [selectedRow.contractorName].filter(Boolean) : allContractorNames}
                  filterStore={selectedRow ? '' : filterStore}
                  setFilterStore={setFilterStore}
                  filterContractor={selectedRow ? '' : filterContractor}
                  setFilterContractor={setFilterContractor}
                  filterReport={filterReport}
                  setFilterReport={setFilterReport}
                  pmAlignReportOptions={pmAlignReportOptions}
                  pmAlignRows={evidenceRows}
                  allRows={selectedRow ? [selectedRow] : allRows}
                  showFilters={!selectedRow}
                />
              </div>
            )}

            {activeTab === 'trend' && (
              <GanttSpiTab
                ganttSpiLoading={trendLoading}
                ganttMetricsMap={ganttMetricsMap}
                allRows={trendRows}
                projectTrends={trendResult.projectTrends}
                discHistory={trendResult.discHistory}
                reliabilityMap={trendResult.reliabilityMap}
              />
            )}
          </div>
        )}
      />
    </div>
  );
}

export default RiskDashboard;
