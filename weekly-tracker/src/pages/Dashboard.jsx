import { useEffect, useMemo, useState } from "react";
import {
  estimateProgressFromStatuses,
  computeCumulativeStatuses, computeWPCumulativeStatuses,
  computeGanttWPProgress, progressAtIndex,
  daysSince, isMissingReport, daysUntil,
} from "../utils/reportUtils";
import { PROJECT_COLORS, computePriorityScore } from "../config/dashboardConstants";
import { computeProjectRiskScore } from "../engines/riskEngine";
import {
  computePortfolioAlerts, computeContractorPerf,
  computePortfolioKpis, computeSiteVisitData, computeSiteVisitKpis,
} from "../engines/portfolioEngine";
import { ActivityHeatmap } from "../components/dashboard/DashboardWidgets";
import SummaryPanel from "../components/dashboard/SummaryPanel";
import StatusMatrix from "../components/dashboard/StatusMatrix";
import OverviewTab from "../components/dashboard/OverviewTab";
import ProjectHeatmap from "../components/dashboard/ProjectHeatmap";
import ProgressTab from "../components/dashboard/ProgressTab";
import ContractorsTab from "../components/dashboard/ContractorsTab";
import SiteVisitsTab from "../components/dashboard/SiteVisitsTab";
import ProjectDetailDrawer from "../components/dashboard/ProjectDetailDrawer";
import { loadAllGanttMetrics } from "../services/ganttService";
import { SPI_STATUS } from "../config/statusColors";

function Dashboard({ projects, reports, siteVisits = [] }) {
  const [activeView, setActiveView]               = useState("overview");
  const [drawerProjectId, setDrawerProjectId]     = useState(null);
  const [filterStatus, setFilterStatus]           = useState("all");
  const [searchQuery, setSearchQuery]             = useState("");
  const [expandedVisitId, setExpandedVisitId]     = useState(null);
  const [svStoreFilter, setSvStoreFilter]         = useState("all");
  const [ganttMetrics, setGanttMetrics]           = useState(new Map());
  const [dismissedAlertIds, setDismissedAlertIds] = useState(new Set());

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    loadAllGanttMetrics(projects.map(p => p.id))
      .then(map => setGanttMetrics(map))
      .catch(err => console.error('[dashboard] gantt metrics error:', err));
  }, [projects]);

  const allRows = useMemo(() => projects.map((project, idx) => {
    const projReports = reports.filter(r=>r.projectId===project.id);
    const projSiteVisits = siteVisits.filter(sv=>String(sv.projectId)===String(project.id));
    const sorted = [...projReports].sort((a,b)=>new Date(a.reportingDate||a.submittedAt)-new Date(b.reportingDate||b.submittedAt));
    const cumulativeStatuses = computeCumulativeStatuses(projReports)||{};
    const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports)||null;
    const latestReport = sorted[sorted.length-1]||null;
    const progress = wpCumulativeStatuses
      ? computeGanttWPProgress(wpCumulativeStatuses.workPackageStatuses)
      : estimateProgressFromStatuses(cumulativeStatuses);
    const color = PROJECT_COLORS[idx%PROJECT_COLORS.length];
    const progressPoints = sorted.map((r,i)=>({ date:r.reportingDate||r.submittedAt, value:progressAtIndex(sorted,i) }));
    const daysSinceReport = latestReport ? daysSince(latestReport.reportingDate||latestReport.submittedAt) : null;
    const missingReport = isMissingReport(latestReport);
    const daysToOpening = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
    const riskLevel = computeProjectRiskScore(project, projReports, progress, projSiteVisits).level;
    const priorityScore = computePriorityScore(riskLevel,daysToOpening,missingReport);
    return { project,latestReport,cumulativeStatuses,wpCumulativeStatuses,progress,projReports,sorted,color,progressPoints,daysSinceReport,missingReport,daysToOpening,riskLevel,priorityScore };
  }), [projects,reports,siteVisits]);

  const filteredRows = useMemo(()=>allRows.filter(({project,latestReport,missingReport})=>{
    if (searchQuery) {
      const q=searchQuery.toLowerCase();
      if (!(project.storeCode||"").toLowerCase().includes(q)&&!(project.shoppingMallName||"").toLowerCase().includes(q)&&!(project.city||"").toLowerCase().includes(q)) return false;
    }
    if (filterStatus==="on-track"&&latestReport?.projectScheduleStatus!=="On Track") return false;
    if (filterStatus==="at-risk"&&latestReport?.projectScheduleStatus!=="At Risk") return false;
    if (filterStatus==="delayed"&&latestReport?.projectScheduleStatus!=="Delayed") return false;
    if (filterStatus==="critical"&&latestReport?.projectScheduleStatus!=="Critical") return false;
    if (filterStatus==="no-report"&&latestReport) return false;
    if (filterStatus==="missing"&&!missingReport) return false;
    return true;
  }),[allRows,searchQuery,filterStatus]);

  const defaultSorted = useMemo(()=>[...filteredRows].sort((a,b)=>a.priorityScore-b.priorityScore||a.progress-b.progress),[filteredRows]);

  const kpis = useMemo(() => computePortfolioKpis(projects, allRows, reports), [projects, allRows, reports]);

  // Rows enriched with gantt SPI — passed to SummaryPanel for avgSPI card
  const spiRows = useMemo(() => allRows.map(row => {
    const gm = ganttMetrics.get(row.project.id);
    return { evm: gm?.spi != null ? { SPI: gm.spi } : null, monteCarlo: null };
  }), [allRows, ganttMetrics]);

  // SPI alert list (critical first, then at_risk, undismissed)
  const spiAlerts = useMemo(() => allRows
    .map(row => ({ ...row, gantt: ganttMetrics.get(row.project.id) || null }))
    .filter(row => row.gantt?.spiStatus === 'critical' || row.gantt?.spiStatus === 'at_risk')
    .filter(row => !dismissedAlertIds.has(row.project.id))
    .sort((a, b) => (a.gantt?.spi ?? 1) - (b.gantt?.spi ?? 1))
  , [allRows, ganttMetrics, dismissedAlertIds]);

  // Projects opening within 45 days, sorted nearest first
  const upcomingOpenings = useMemo(() => allRows
    .filter(({ daysToOpening }) => daysToOpening !== null && daysToOpening >= 0 && daysToOpening <= 45)
    .sort((a, b) => a.daysToOpening - b.daysToOpening)
    .map(row => ({ ...row, gantt: ganttMetrics.get(row.project.id) || null }))
  , [allRows, ganttMetrics]);

  const alerts = useMemo(() => computePortfolioAlerts(allRows), [allRows]);

  const heatmapRows = useMemo(()=>{
    const WEEKS=16; const now=new Date();
    const weeks=Array.from({length:WEEKS},(_,i)=>{
      const s=new Date(now); s.setDate(s.getDate()-(WEEKS-1-i)*7); s.setHours(0,0,0,0);
      const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999);
      return {start:s,end:e};
    });
    return allRows.map(({project,projReports})=>({
      project,
      cells:weeks.map(({start,end})=>{
        const wr=projReports.filter(r=>{const d=new Date(r.reportingDate||r.submittedAt);return d>=start&&d<=end;});
        return {count:wr.length,status:wr[wr.length-1]?.projectScheduleStatus};
      }),
    }));
  },[allRows]);

  const contractorPerf = useMemo(() => computeContractorPerf(allRows), [allRows]);

  const svData = useMemo(() => computeSiteVisitData(siteVisits, projects, reports), [siteVisits, projects, reports]);

  const svFiltered = useMemo(()=>
    svStoreFilter==="all" ? svData : svData.filter(d=>d.project?.storeCode===svStoreFilter)
  ,[svData,svStoreFilter]);

  const svStoreOptions = useMemo(()=>
    Array.from(new Set(svData.map(d=>d.project?.storeCode).filter(Boolean))).sort()
  ,[svData]);

  const svKpis = useMemo(() => computeSiteVisitKpis(svFiltered), [svFiltered]);

  const drawerRow = useMemo(()=>drawerProjectId?allRows.find(({project})=>String(project.id)===drawerProjectId)||null:null,[allRows,drawerProjectId]);
  const drawerSiteVisits = useMemo(()=>drawerRow?siteVisits.filter(sv=>String(sv.projectId)===String(drawerRow.project.id)):[],[siteVisits,drawerRow]);

  const clearFilters=()=>{setFilterStatus("all");setSearchQuery("");};
  const filtersActive=filterStatus!=="all"||searchQuery;

  const VIEWS=[
    {id:"overview",label:"Overview"},
    {id:"workpackages",label:"Work Packages"},
    {id:"progress",label:"Progress"},
    {id:"contractors",label:"Contractors"},
    {id:"activity",label:"Activity"},
    {id:"sitevisits",label:"Site Visits"},
  ];

  const sel=(id)=>setDrawerProjectId(id===drawerProjectId?null:id);

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Construction Dashboard</h1>
          <p>PM Command Center — portfolio health, risks, blockers, actions, and opening readiness.</p>
        </div>
        <div style={{ fontSize:13,color:"#6b7280",alignSelf:"center" }}>
          {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </div>
      </div>

      {/* ── SPI Alert Banner ── */}
      {spiAlerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {spiAlerts.slice(0, 5).map(row => {
            const st = SPI_STATUS[row.gantt.spiStatus];
            return (
              <div key={row.project.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
                background: row.gantt.spiStatus === 'critical' ? '#fef2f2' : '#fffbeb',
                border: `1.5px solid ${st.color}40`, borderRadius: 9, marginBottom: 5, fontSize: 12,
                borderLeft: `4px solid ${st.color}`,
              }}>
                <span style={{ fontWeight: 700, color: st.color }}>
                  {row.gantt.spiStatus === 'critical' ? '⛔' : '⚠'} {st.label}
                </span>
                <span style={{ color: '#111827', fontWeight: 600 }}>{row.project.storeCode}</span>
                <span style={{ color: '#6b7280' }}>{row.project.shoppingMallName}</span>
                <span style={{ color: st.color, fontWeight: 700 }}>SPI {row.gantt.spi?.toFixed(2) ?? '—'}</span>
                {row.gantt.criticalHealth?.behind > 0 && (
                  <span style={{ color: '#dc2626' }}>{row.gantt.criticalHealth.behind} critical tasks behind</span>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedAlertIds(prev => new Set([...prev, row.project.id]))}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >✕</button>
              </div>
            );
          })}
          {spiAlerts.length > 5 && (
            <div style={{ fontSize: 11, color: '#6b7280', paddingLeft: 6 }}>
              +{spiAlerts.length - 5} more schedule issues
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <SummaryPanel kpis={kpis} reportsTotal={reports.length} rows={spiRows} />

      {/* ── Upcoming Openings ── */}
      {upcomingOpenings.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderLeft: '4px solid #f97316' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 10 }}>
            🏁 Opening in ≤45 Days ({upcomingOpenings.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {upcomingOpenings.map(row => {
              const st = row.gantt ? SPI_STATUS[row.gantt.spiStatus] : SPI_STATUS.no_schedule;
              return (
                <div key={row.project.id} style={{
                  background: '#f9fafb', border: `1.5px solid ${st.border || '#e5e7eb'}`,
                  borderRadius: 9, padding: '7px 12px', minWidth: 180,
                  display: 'flex', flexDirection: 'column', gap: 3,
                  cursor: 'pointer',
                }} onClick={() => sel(String(row.project.id))}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{row.project.storeCode}</span>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 5, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                      {row.gantt?.spi != null ? `SPI ${row.gantt.spi.toFixed(2)}` : 'No Gantt'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{row.project.shoppingMallName}</div>
                  <div style={{ fontSize: 11, color: row.daysToOpening < 14 ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                    {row.daysToOpening === 0 ? 'Opens today!' : `${row.daysToOpening}d to open`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#9ca3af",fontSize:13 }}>🔍</span>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingLeft:32,paddingRight:12,height:36,borderRadius:9,border:"1.5px solid #e5e7eb",fontSize:13,color:"#111827",background:"#ffffff",outline:"none",minWidth:180 }}/>
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #e5e7eb",fontSize:13,color:"#111827",background:"#ffffff",cursor:"pointer",outline:"none" }}>
          {[["all","All statuses"],["on-track","On Track"],["at-risk","At Risk"],["critical","Critical"],["no-report","No Report"],["missing","Missing/Overdue"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {filtersActive&&<button type="button" onClick={clearFilters} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear ×</button>}
        <div style={{ marginLeft:"auto",fontSize:12,color:"#6b7280" }}>{filteredRows.length} / {projects.length} projects</div>
      </div>

      {/* ── Status Matrix ── */}
      <StatusMatrix rows={defaultSorted} alerts={alerts} drawerProjectId={drawerProjectId} onSelect={sel}/>

      {/* ── View tabs ── */}
      <div style={{ display:"flex",gap:3,marginBottom:16,background:"#f3f4f6",borderRadius:12,padding:4,border:"1px solid #e5e7eb",width:"fit-content" }}>
        {VIEWS.map(({id,label})=>(
          <button key={id} type="button" onClick={()=>setActiveView(id)} style={{ padding:"7px 18px",borderRadius:9,border:"none",background:activeView===id?"#fff7ed":"transparent",color:activeView===id?"#f97316":"#6b7280",fontSize:13,fontWeight:activeView===id?700:500,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {activeView==="overview"&&<OverviewTab allRows={allRows} projects={projects} kpis={kpis} onSelect={sel}/>}

      {activeView==="workpackages"&&<ProjectHeatmap rows={defaultSorted} onRowClick={sel}/>}

      {activeView==="progress"&&<ProgressTab rows={filteredRows} drawerProjectId={drawerProjectId} onSelect={sel} ganttMetrics={ganttMetrics}/>}

      {activeView==="contractors"&&<ContractorsTab contractorPerf={contractorPerf}/>}

      {activeView==="activity"&&(
        <div className="dashboard-summary-card">
          <div style={{ fontWeight:700,fontSize:15,color:"#111827",marginBottom:4 }}>Report Activity Heatmap</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:18 }}>Last 16 weeks · cell = reports submitted · color = schedule status</div>
          <ActivityHeatmap projectRows={heatmapRows.filter(({project})=>filteredRows.some(({project:p})=>p.id===project.id))} weekCount={16}/>
        </div>
      )}

      {activeView==="sitevisits"&&(
        <SiteVisitsTab
          svData={svData}
          svFiltered={svFiltered}
          svKpis={svKpis}
          svStoreFilter={svStoreFilter}
          onFilterChange={setSvStoreFilter}
          expandedVisitId={expandedVisitId}
          onExpandedChange={setExpandedVisitId}
          svStoreOptions={svStoreOptions}
        />
      )}

      {/* ── Project Detail Drawer ── */}
      <ProjectDetailDrawer row={drawerRow} projSiteVisits={drawerSiteVisits} onClose={()=>setDrawerProjectId(null)}/>
    </div>
  );
}

export default Dashboard;
