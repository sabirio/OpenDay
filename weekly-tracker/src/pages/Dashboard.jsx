import { useEffect, useMemo, useState } from "react";
import {
  estimateProgressFromStatuses, estimateProgressAuto,
  computeCumulativeStatuses, computeWPCumulativeStatuses,
} from "../utils/reportUtils";
import { WORK_PACKAGES } from "../config/workPackages";
import {
  PROJECT_COLORS, CONSTRUCTION_ITEMS, TESTING_ITEMS, HANDOVER_ITEMS,
  computeRiskLevel, computePriorityScore, svCompare, getGCStatusForTask,
} from "../config/dashboardConstants";
import { ActivityHeatmap } from "../components/dashboard/DashboardWidgets";
import SummaryPanel from "../components/dashboard/SummaryPanel";
import StatusMatrix from "../components/dashboard/StatusMatrix";
import OverviewTab from "../components/dashboard/OverviewTab";
import ProjectHeatmap from "../components/dashboard/ProjectHeatmap";
import ProgressTab from "../components/dashboard/ProgressTab";
import ContractorsTab from "../components/dashboard/ContractorsTab";
import SiteVisitsTab from "../components/dashboard/SiteVisitsTab";
import ProjectDetailDrawer from "../components/dashboard/ProjectDetailDrawer";
import { loadAllGanttMetrics } from "../services/dashboardService";
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
    const sorted = [...projReports].sort((a,b)=>new Date(a.reportingDate||a.submittedAt)-new Date(b.reportingDate||b.submittedAt));
    const cumulativeStatuses = computeCumulativeStatuses(projReports)||{};
    const wpCumulativeStatuses = computeWPCumulativeStatuses(projReports)||null;
    const latestReport = sorted[sorted.length-1]||null;
    const progress = wpCumulativeStatuses
      ? estimateProgressAuto(latestReport)
      : estimateProgressFromStatuses(cumulativeStatuses);
    const color = PROJECT_COLORS[idx%PROJECT_COLORS.length];
    const progressPoints = sorted.map((r,i)=>({ date:r.reportingDate||r.submittedAt, value:estimateProgressFromStatuses(computeCumulativeStatuses(sorted.slice(0,i+1))) }));
    const now = new Date();
    const daysSinceReport = latestReport ? Math.floor((now-new Date(latestReport.reportingDate||latestReport.submittedAt))/86400000) : null;
    const missingReport = !latestReport||(daysSinceReport!==null&&daysSinceReport>7);
    const daysToOpening = project.targetOpeningDate ? Math.ceil((new Date(project.targetOpeningDate)-now)/86400000) : null;
    const riskLevel = computeRiskLevel(latestReport,progress,daysToOpening,missingReport);
    const priorityScore = computePriorityScore(riskLevel,daysToOpening,missingReport);
    return { project,latestReport,cumulativeStatuses,wpCumulativeStatuses,progress,projReports,sorted,color,progressPoints,daysSinceReport,missingReport,daysToOpening,riskLevel,priorityScore };
  }), [projects,reports]);

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

  const kpis = useMemo(()=>{
    const active=projects.filter(p=>p.projectStatus==="Active").length;
    const atRisk=allRows.filter(({latestReport})=>latestReport?.projectScheduleStatus==="At Risk"||latestReport?.projectScheduleStatus==="Delayed").length;
    const critical=allRows.filter(({riskLevel})=>riskLevel==="CRITICAL").length;
    const missing=allRows.filter(({missingReport})=>missingReport).length;
    const blocked=allRows.filter(({latestReport})=>latestReport?.activitiesBlocked==="Yes").length;
    const support=allRows.filter(({latestReport})=>latestReport?.supportRequired==="Yes").length;
    const avgProgress=allRows.length?Math.round(allRows.reduce((s,{progress})=>s+progress,0)/allRows.length):0;
    const weekAgo=new Date(); weekAgo.setDate(weekAgo.getDate()-7);
    const reportsThisWeek=reports.filter(r=>new Date(r.reportingDate||r.submittedAt)>=weekAgo).length;
    const openingSoon=allRows.filter(({daysToOpening})=>daysToOpening!==null&&daysToOpening>=0&&daysToOpening<30).length;
    return {active,total:projects.length,atRisk,critical,missing,blocked,support,avgProgress,reportsThisWeek,openingSoon};
  },[projects,reports,allRows]);

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

  const alerts = useMemo(()=>{
    const list=[];
    allRows.forEach(({project,latestReport,progress,daysToOpening,daysSinceReport,riskLevel})=>{
      if (daysToOpening!==null&&daysToOpening<30&&progress<80)
        list.push({sev:"CRITICAL",pid:project.id,code:project.storeCode,mall:project.shoppingMallName,reason:"Opening approaching — low progress",detail:`${daysToOpening<0?"OVERDUE":daysToOpening+"d to open"} · Progress ${progress}%`,action:"Immediate escalation required"});
      if (latestReport?.activitiesBlocked==="Yes")
        list.push({sev:"HIGH",pid:project.id,code:project.storeCode,mall:project.shoppingMallName,reason:"Activities blocked",detail:latestReport.delayReason||"Reason not specified",action:"PM intervention required"});
      if ((latestReport?.projectScheduleStatus==="At Risk"||latestReport?.projectScheduleStatus==="Delayed")&&latestReport?.riskScale==="High")
        list.push({sev:"HIGH",pid:project.id,code:project.storeCode,mall:project.shoppingMallName,reason:`${latestReport.projectScheduleStatus} + High risk scale`,detail:latestReport.riskDescription||"Review risk report",action:"Review mitigation plan"});
      if (latestReport?.projectScheduleStatus==="Delayed")
        list.push({sev:"HIGH",pid:project.id,code:project.storeCode,mall:project.shoppingMallName,reason:"Project delayed",detail:latestReport.riskDescription||"Schedule confirmed delayed",action:"Review recovery plan"});
      if (riskLevel==="CRITICAL"&&latestReport&&!list.some(a=>a.pid===project.id&&a.sev==="CRITICAL"))
        list.push({sev:"CRITICAL",pid:project.id,code:project.storeCode,mall:project.shoppingMallName,reason:"Project classified CRITICAL",detail:`Risk Level: CRITICAL`,action:"Immediate PM review required"});
    });
    const ord={CRITICAL:0,HIGH:1,MEDIUM:2};
    return list.sort((a,b)=>ord[a.sev]-ord[b.sev]);
  },[allRows]);

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

  const contractorPerf = useMemo(()=>{
    const map={};
    allRows.forEach(({project,latestReport,progress,projReports,missingReport})=>{
      const name=project.generalContractor||latestReport?.contractor||"Unknown";
      if (!map[name]) map[name]={projects:[],totalProg:0,atRisk:0,blockers:0,support:0,missing:0,reportCount:0};
      const c=map[name];
      c.projects.push(project.storeCode);
      c.totalProg+=progress;
      if (latestReport?.projectScheduleStatus==="At Risk"||latestReport?.projectScheduleStatus==="Delayed") c.atRisk++;
      if (latestReport?.activitiesBlocked==="Yes") c.blockers++;
      if (latestReport?.supportRequired==="Yes") c.support++;
      if (missingReport) c.missing++;
      c.reportCount+=projReports.length;
    });
    return Object.entries(map).map(([name,d])=>({
      name,n:d.projects.length,projects:d.projects,
      avgProg:d.projects.length?Math.round(d.totalProg/d.projects.length):0,
      atRisk:d.atRisk,blockers:d.blockers,support:d.support,missing:d.missing,reportCount:d.reportCount,
    })).sort((a,b)=>b.atRisk-a.atRisk||b.blockers-a.blockers||a.avgProg-b.avgProg);
  },[allRows]);

  const svData = useMemo(()=>{
    return siteVisits.map(visit=>{
      const project=projects.find(p=>String(p.id)===String(visit.projectId));
      const projectReports=reports.filter(r=>String(r.projectId)===String(visit.projectId));
      const sortedReports=[...projectReports].sort((a,b)=>new Date(b.reportingDate||b.submittedAt)-new Date(a.reportingDate||a.submittedAt));
      const gcReport=(visit.referenceReportId
        ? projectReports.find(r=>String(r.id)===String(visit.referenceReportId))
        : null) || sortedReports[0] || null;

      const items=[];

      if (visit.pmWorkPackageStatuses) {
        for (const wp of WORK_PACKAGES) {
          for (const task of wp.tasks) {
            const pmEntry=visit.pmWorkPackageStatuses[wp.id]?.[task.name];
            const pmStatus=pmEntry?.observedStatus||null;
            const gcStatus=getGCStatusForTask(gcReport,wp.id,task.name);
            if (pmStatus||gcStatus) {
              items.push({phase:wp.name,label:task.name,pm:pmStatus,gc:gcStatus,result:svCompare(pmStatus,gcStatus)});
            }
          }
        }
      } else {
        const demoResult=svCompare(visit.demolitionStatus,gcReport?.demolitionStatus);
        if (visit.demolitionStatus||gcReport?.demolitionStatus)
          items.push({phase:"Demolition",label:"Demolition",pm:visit.demolitionStatus,gc:gcReport?.demolitionStatus,result:demoResult});
        CONSTRUCTION_ITEMS.forEach(key=>{
          const pm=visit.constructionStatuses?.[key],gc=gcReport?.constructionStatuses?.[key];
          if (pm||gc) items.push({phase:"Construction",label:key,pm,gc,result:svCompare(pm,gc)});
        });
        TESTING_ITEMS.forEach(key=>{
          const pm=visit.testingStatuses?.[key],gc=gcReport?.testingStatuses?.[key];
          if (pm||gc) items.push({phase:"Testing",label:key,pm,gc,result:svCompare(pm,gc)});
        });
        HANDOVER_ITEMS.forEach(key=>{
          const pm=visit.handoverStatuses?.[key],gc=gcReport?.handoverStatuses?.[key];
          if (pm||gc) items.push({phase:"Handover",label:key,pm,gc,result:svCompare(pm,gc)});
        });
      }

      const assessed=items.filter(i=>i.result&&i.result.type!=="not-assessed"&&i.result.type!=="no-gc");
      const matches=assessed.filter(i=>i.result?.type==="match").length;
      const discrepancies=assessed.filter(i=>i.result?.type==="discrepancy").length;
      const pmAhead=assessed.filter(i=>i.result?.type==="pm-higher").length;
      const matchRate=assessed.length>0?Math.round(matches/assessed.length*100):null;
      return {visit,project,gcReport,items,assessed:assessed.length,matches,discrepancies,pmAhead,matchRate};
    }).sort((a,b)=>new Date(b.visit.visitDate||b.visit.submittedAt)-new Date(a.visit.visitDate||a.visit.submittedAt));
  },[siteVisits,projects,reports]);

  const svFiltered = useMemo(()=>
    svStoreFilter==="all" ? svData : svData.filter(d=>d.project?.storeCode===svStoreFilter)
  ,[svData,svStoreFilter]);

  const svStoreOptions = useMemo(()=>
    Array.from(new Set(svData.map(d=>d.project?.storeCode).filter(Boolean))).sort()
  ,[svData]);

  const svKpis = useMemo(()=>{
    const src=svFiltered;
    const totalAssessed=src.reduce((s,d)=>s+d.assessed,0);
    const totalMatches=src.reduce((s,d)=>s+d.matches,0);
    const totalDiscrepancies=src.reduce((s,d)=>s+d.discrepancies,0);
    const totalPmAhead=src.reduce((s,d)=>s+d.pmAhead,0);
    const overallMatchRate=totalAssessed>0?Math.round(totalMatches/totalAssessed*100):null;
    return {totalVisits:src.length,totalAssessed,totalMatches,totalDiscrepancies,totalPmAhead,overallMatchRate};
  },[svFiltered]);

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
        <div style={{ fontSize:13,color:"#64748b",alignSelf:"center" }}>
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
                background: row.gantt.spiStatus === 'critical' ? '#450a0a' : '#422006',
                border: `1.5px solid ${st.color}40`, borderRadius: 9, marginBottom: 5, fontSize: 12,
              }}>
                <span style={{ fontWeight: 700, color: st.color }}>
                  {row.gantt.spiStatus === 'critical' ? '⛔' : '⚠'} {st.label}
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.project.storeCode}</span>
                <span style={{ color: '#94a3b8' }}>{row.project.shoppingMallName}</span>
                <span style={{ color: st.color, fontWeight: 700 }}>SPI {row.gantt.spi?.toFixed(2) ?? '—'}</span>
                {row.gantt.criticalHealth?.behind > 0 && (
                  <span style={{ color: '#fca5a5' }}>{row.gantt.criticalHealth.behind} critical tasks behind</span>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedAlertIds(prev => new Set([...prev, row.project.id]))}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >✕</button>
              </div>
            );
          })}
          {spiAlerts.length > 5 && (
            <div style={{ fontSize: 11, color: '#64748b', paddingLeft: 6 }}>
              +{spiAlerts.length - 5} more schedule issues
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <SummaryPanel kpis={kpis} reportsTotal={reports.length} rows={spiRows} />

      {/* ── Upcoming Openings ── */}
      {upcomingOpenings.length > 0 && (
        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9', marginBottom: 10 }}>
            🏁 Opening in ≤45 Days ({upcomingOpenings.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {upcomingOpenings.map(row => {
              const st = row.gantt ? SPI_STATUS[row.gantt.spiStatus] : SPI_STATUS.no_schedule;
              return (
                <div key={row.project.id} style={{
                  background: '#0f172a', border: `1.5px solid ${st.color}50`,
                  borderRadius: 9, padding: '7px 12px', minWidth: 180,
                  display: 'flex', flexDirection: 'column', gap: 3,
                  cursor: 'pointer',
                }} onClick={() => sel(String(row.project.id))}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>{row.project.storeCode}</span>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 5, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                      {row.gantt?.spi != null ? `SPI ${row.gantt.spi.toFixed(2)}` : 'No Gantt'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.project.shoppingMallName}</div>
                  <div style={{ fontSize: 11, color: row.daysToOpening < 14 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
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
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingLeft:32,paddingRight:12,height:36,borderRadius:9,border:"1.5px solid #334155",fontSize:13,color:"#e2e8f0",background:"#1e293b",outline:"none",minWidth:180 }}/>
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #334155",fontSize:13,color:"#e2e8f0",background:"#1e293b",cursor:"pointer",outline:"none" }}>
          {[["all","All statuses"],["on-track","On Track"],["at-risk","At Risk"],["critical","Critical"],["no-report","No Report"],["missing","Missing/Overdue"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {filtersActive&&<button type="button" onClick={clearFilters} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"#450a0a",color:"#fca5a5",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear ×</button>}
        <div style={{ marginLeft:"auto",fontSize:12,color:"#64748b" }}>{filteredRows.length} / {projects.length} projects</div>
      </div>

      {/* ── Status Matrix ── */}
      <StatusMatrix rows={defaultSorted} alerts={alerts} drawerProjectId={drawerProjectId} onSelect={sel}/>

      {/* ── View tabs ── */}
      <div style={{ display:"flex",gap:3,marginBottom:16,background:"#1e293b",borderRadius:12,padding:4,border:"1px solid #334155",width:"fit-content" }}>
        {VIEWS.map(({id,label})=>(
          <button key={id} type="button" onClick={()=>setActiveView(id)} style={{ padding:"7px 18px",borderRadius:9,border:"none",background:activeView===id?"#f1f5f9":"transparent",color:activeView===id?"#0f172a":"#94a3b8",fontSize:13,fontWeight:activeView===id?700:500,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap" }}>
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
          <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Report Activity Heatmap</div>
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
