import { useMemo, useState, useCallback } from "react";
import { regenerateGantt } from "../hooks/useGanttOrchestration";
import { useDashboardModel } from "../hooks/useDashboardModel";
import { getProgressSnapshot } from "../hooks/useDashboardOrchestration";
import { ActivityHeatmap } from "../components/dashboard/DashboardWidgets";
import SummaryPanel from "../components/dashboard/SummaryPanel";
import StatusMatrix from "../components/dashboard/StatusMatrix";
import OverviewTab from "../components/dashboard/OverviewTab";
import ProjectHeatmap from "../components/dashboard/ProjectHeatmap";
import ProgressTab from "../components/dashboard/ProgressTab";
import ContractorsTab from "../components/dashboard/ContractorsTab";
import ProjectDetailDrawer from "../components/dashboard/ProjectDetailDrawer";
import { useGanttMetrics } from "../hooks/useGanttMetrics";
import { useAllRows } from "../hooks/useAllRows";
import { SPI_STATUS } from "../config/statusColors";
import { SCHEDULE_STATUS } from "../utils/reportUtils";
import { isoWeekToMonday, currentISOWeek } from "../utils/scheduleUtils";
import Icon from "../components/shared/Icon";

function isoWeekLabel(isoWeekStr) {
  const week = parseInt(isoWeekStr.split('-W')[1], 10);
  const monday = isoWeekToMonday(isoWeekStr);
  return `Week ${week} — ${monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

function Dashboard({ projects, reports, siteVisits = [], templatesById = {}, activeTemplateFallback = null }) {
  const [activeView, setActiveView]               = useState("overview");
  const [drawerProjectId, setDrawerProjectId]     = useState(null);
  const [filterStatus, setFilterStatus]           = useState("all");
  const [searchQuery, setSearchQuery]             = useState("");
  const [dismissedAlertIds, setDismissedAlertIds] = useState(new Set());
  const [snapshotWeek, setSnapshotWeek]           = useState(null);
  const [snapshotData, setSnapshotData]           = useState({});
  const [snapshotLoading, setSnapshotLoading]     = useState(false);

  const handleSnapshotWeekChange = useCallback(async (weekStr) => {
    if (!weekStr) { setSnapshotWeek(null); setSnapshotData({}); return; }
    setSnapshotWeek(weekStr);
    setSnapshotLoading(true);
    try {
      const data = await getProgressSnapshot(weekStr);
      setSnapshotData(data);
    } catch (err) {
      console.warn('[snapshot] fetch failed:', err);
      setSnapshotData({});
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const ganttMetrics = useGanttMetrics(projects);

  const allRows = useAllRows(projects, reports, siteVisits, templatesById, activeTemplateFallback);

  const filteredRows = useMemo(()=>allRows.filter(({project,latestReport,missingReport})=>{
    if (searchQuery) {
      const q=searchQuery.toLowerCase();
      if (!(project.storeCode||"").toLowerCase().includes(q)&&!(project.shoppingMallName||"").toLowerCase().includes(q)&&!(project.city||"").toLowerCase().includes(q)) return false;
    }
    if (filterStatus==="on-track"&&latestReport?.projectScheduleStatus!==SCHEDULE_STATUS.ON_TRACK) return false;
    if (filterStatus==="at-risk"&&latestReport?.projectScheduleStatus!==SCHEDULE_STATUS.AT_RISK) return false;
    if (filterStatus==="delayed"&&latestReport?.projectScheduleStatus!==SCHEDULE_STATUS.DELAYED) return false;
    if (filterStatus==="critical"&&latestReport?.projectScheduleStatus!==SCHEDULE_STATUS.CRITICAL) return false;
    if (filterStatus==="no-report"&&latestReport) return false;
    if (filterStatus==="missing"&&!missingReport) return false;
    return true;
  }),[allRows,searchQuery,filterStatus]);

  const defaultSorted = useMemo(()=>[...filteredRows].sort((a,b)=>a.priorityScore-b.priorityScore||a.progress-b.progress),[filteredRows]);

  // Single dashboard read-model — kpis, gantt-enriched rows (composed
  // internally into alerts + SPI banner/SummaryPanel rows), contractor
  // perf, and site visit data/kpis all derived from the same inputs.
  const { kpis, spiRows, alerts, contractorPerf, svData, svKpis } =
    useDashboardModel({ projects, reports, siteVisits, allRows, ganttMetrics });

  // SPI banner items: pulled from unified alerts, undismissed, worst SPI first.
  const spiAlerts = useMemo(() =>
    alerts
      .filter(a => a.type === 'spi' && !dismissedAlertIds.has(a.pid))
      .sort((x, y) => (x.spi ?? 1) - (y.spi ?? 1))
  , [alerts, dismissedAlertIds]);

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

  const lastVisitDate = useMemo(() => {
    const dates = svData.map(d => d.visit?.visitDate || d.visit?.submittedAt).filter(Boolean);
    return dates.length ? dates.sort().at(-1) : null;
  }, [svData]);

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
  ];

  const sel=(id)=>setDrawerProjectId(id===drawerProjectId?null:id);

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1>Project Dashboard</h1>
          <p>PM Command Center — portfolio health, risks, blockers, actions, and opening readiness.</p>
        </div>
        <div style={{ fontSize:13,color:"var(--text-secondary)",alignSelf:"center" }}>
          {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
        </div>
      </div>

      {/* ── SPI Alert Banner ── */}
      {spiAlerts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {spiAlerts.slice(0, 5).map(a => {
            const st = SPI_STATUS[a.spiStatus];
            return (
              <div key={a.pid} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
                background: a.spiStatus === 'critical' ? 'var(--status-alert-bg)' : 'var(--status-warn-bg)',
                border: `1.5px solid ${st.color}`, borderRadius: 9, marginBottom: 5, fontSize: 12,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: st.color }}>
                  <Icon name={a.spiStatus === 'critical' ? 'block' : 'warning'} size={14} /> {st.label}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{a.code}</span>
                <span style={{ color: 'var(--text-muted)' }}>{a.mall}</span>
                <span style={{ color: st.color, fontWeight: 700 }}>SPI {a.spi?.toFixed(2) ?? '—'}</span>
                {a.criticalTasksBehind > 0 && (
                  <span style={{ color: 'var(--status-alert)' }}>{a.criticalTasksBehind} critical tasks behind</span>
                )}
                <button
                  type="button"
                  aria-label={`Dismiss ${a.code} schedule alert`}
                  onClick={() => setDismissedAlertIds(prev => new Set([...prev, a.pid]))}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                ><Icon name="close" size={14} /></button>
              </div>
            );
          })}
          {spiAlerts.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 6 }}>
              +{spiAlerts.length - 5} more schedule issues
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <SummaryPanel kpis={kpis} reportsTotal={reports.length} rows={spiRows} allRows={allRows} svKpis={svKpis} lastVisitDate={lastVisitDate} />

      {/* ── Filters + Snapshot toolbar ── */}
      <div className="dashboard-control-panel">
        <div className="dashboard-search-field">
          <span><Icon name="search" size={15} /></span>
          <input aria-label="Search projects" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search projects…" />
        </div>
        <select aria-label="Filter projects by status" className="dashboard-status-select" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          {[["all","All statuses"],["on-track","On Track"],["at-risk","At Risk"],["critical","Critical"],["no-report","No Report"],["missing","Missing/Overdue"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {filtersActive&&<button type="button" onClick={clearFilters} style={{ display:"inline-flex",alignItems:"center",gap:5,height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid var(--border)",background:"var(--status-alert-bg)",color:"var(--status-alert)",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear <Icon name="close" size={13} /></button>}
        <div style={{ width:1,height:24,background:"var(--border)",margin:"0 2px" }} />
        <label htmlFor="dashboard-snapshot-week" style={{ fontSize:12,color:"var(--text-muted)",fontWeight:600,whiteSpace:"nowrap" }}>View snapshot for week:</label>
        <input
          id="dashboard-snapshot-week"
          type="week"
          max={currentISOWeek()}
          value={snapshotWeek || ''}
          onChange={e=>handleSnapshotWeekChange(e.target.value)}
          style={{ height:36,padding:"0 10px",borderRadius:9,border:"1.5px solid var(--border)",fontSize:12,color:"var(--text-primary)",background:"var(--bg-input)",outline:"none",cursor:"pointer" }}
        />
        {snapshotWeek&&(
          <button type="button" onClick={()=>handleSnapshotWeekChange(null)} style={{ display:"inline-flex",alignItems:"center",gap:5,height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid var(--border)",background:"var(--bg-elevated)",color:"var(--text-muted)",fontSize:12,cursor:"pointer" }}>
            <Icon name="close" size={13} /> Live view
          </button>
        )}
        <div style={{ marginLeft:"auto",fontSize:12,color:"var(--text-muted)" }}>{filteredRows.length} / {projects.length} projects</div>
      </div>

      {/* ── Snapshot banner ── */}
      {snapshotWeek && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--accent-subtle)', border: '1.5px solid var(--accent)', borderRadius: 9,
          padding: '8px 14px', marginBottom: 12, fontSize: 13,
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
            {snapshotLoading ? 'Loading snapshot…' : `Viewing snapshot: ${isoWeekLabel(snapshotWeek)}`}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Read-only · progress values from history</span>
          <button type="button" aria-label="Return to live dashboard" onClick={() => handleSnapshotWeekChange(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Icon name="close" size={15} /></button>
        </div>
      )}

      {/* ── Status Matrix ── */}
      <StatusMatrix rows={defaultSorted} alerts={alerts} drawerProjectId={drawerProjectId} onSelect={sel} snapshotData={snapshotData} snapshotMode={!!snapshotWeek}/>

      {/* ── View tabs ── */}
      <div className="dashboard-tabs" role="group" aria-label="Dashboard view">
        {VIEWS.map(({id,label})=>(
          <button key={id} type="button" aria-pressed={activeView===id} onClick={()=>setActiveView(id)} className={`dashboard-tab${activeView===id ? ' is-active' : ''}`}>
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
          <div style={{ fontWeight:700,fontSize:15,color:"var(--text-primary)",marginBottom:4 }}>Report Activity Heatmap</div>
          <div style={{ fontSize:12,color:"var(--text-muted)",marginBottom:18 }}>Last 16 weeks · cell = reports submitted · color = schedule status</div>
          <ActivityHeatmap projectRows={heatmapRows.filter(({project})=>filteredRows.some(({project:p})=>p.id===project.id))} weekCount={16}/>
        </div>
      )}

      {/* ── Project Detail Drawer ── */}
      <ProjectDetailDrawer row={drawerRow} projSiteVisits={drawerSiteVisits} onClose={()=>setDrawerProjectId(null)} onRegenerateGantt={regenerateGantt}/>
    </div>
  );
}

export default Dashboard;
