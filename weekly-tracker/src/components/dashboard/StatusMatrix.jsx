import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

function currentPhaseLabel(row) {
  const {cumulativeStatuses,latestReport}=row;
  return cumulativeStatuses?.currentPhase||(Array.isArray(latestReport?.currentPhases)?latestReport.currentPhases.join(" + "):latestReport?.currentPhase);
}

function reportTag({latestReport,daysSinceReport}) {
  if (!latestReport) return <span style={{ fontSize:11,fontWeight:700,color:"#dc2626" }}>Missing</span>;
  if (daysSinceReport===0) return <span style={{ fontSize:11,color:"#22c55e" }}>Today</span>;
  if (daysSinceReport<=7) return <span style={{ fontSize:11,color:"#22c55e" }}>{daysSinceReport}d ago</span>;
  if (daysSinceReport<=14) return <span style={{ fontSize:11,color:"#d97706" }}>{daysSinceReport}d ago</span>;
  return <span style={{ fontSize:11,fontWeight:700,color:"#dc2626" }}>Overdue {daysSinceReport}d</span>;
}

export default function StatusMatrix({ rows, alerts, drawerProjectId, onSelect }) {
  return (
    <div className="dashboard-summary-card" style={{ marginBottom:16 }}>
      <div style={{ marginBottom:14 }}>
        <h2 style={{ fontSize:16,color:"#111827",margin:0 }}>Project Status Matrix</h2>
        <div style={{ fontSize:12,color:"#9ca3af",marginTop:2 }}>Sorted by priority · click row to open project</div>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table className="dashboard-table" style={{ width:"100%",tableLayout:"fixed" }}>
          <thead>
            <tr>
              <th>Store Code</th>
              <th>Current Phase</th><th>Progress</th><th>Schedule</th><th>Risk Level</th>
              <th>Blockers</th><th>Support Required</th><th>Alert</th>
              <th>Target Opening</th><th>Days Left</th><th>Latest Report</th><th>Report Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length===0?(
              <tr><td colSpan="12" style={{ color:"#9ca3af",textAlign:"center",padding:"24px 0" }}>No matching projects.</td></tr>
            ):rows.map((row)=>{
              const {project,latestReport,progress,color,daysToOpening,daysSinceReport,riskLevel,missingReport}=row;
              const phase=currentPhaseLabel(row);
              const schedStatus=latestReport?.projectScheduleStatus;
              const isOpen=drawerProjectId===String(project.id);
              const progColor=progress>=75?"#22c55e":progress>=40?"#3b82f6":"#f59e0b";
              const dToC=daysToOpening===null?"#9ca3af":daysToOpening<0?"#dc2626":daysToOpening<30?"#dc2626":daysToOpening<90?"#d97706":"#16a34a";
              return (
                <tr key={project.id} data-testid="dashboard-project-row" data-project-id={String(project.id)} onClick={()=>onSelect(String(project.id))} style={{ cursor:"pointer",background:isOpen?"#f0fdf4":undefined,transition:"background 0.15s" }}>
                  <td>
                    <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                      <div style={{ width:3,height:18,borderRadius:2,background:color,flexShrink:0 }}/>
                      {isOpen&&<span style={{ color:"#16a34a",fontSize:10 }}>▶</span>}
                      <strong style={{ color:"#111827" }}>{project.storeCode}</strong>
                    </div>
                  </td>
                  <td style={{ fontSize:12 }}>{phase||<span style={{ color:"#9ca3af" }}>No report</span>}</td>
                  <td>
                    <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                      <div style={{ width:48,background:"#e5e7eb",borderRadius:3,height:6,overflow:"hidden",flexShrink:0 }}>
                        <div style={{ width:`${progress}%`,height:"100%",background:progColor,borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:12,fontWeight:700,color:"#374151",minWidth:28 }}>{progress}%</span>
                    </div>
                  </td>
                  <td><SchedBadge status={schedStatus}/></td>
                  <td><RiskBadge level={riskLevel}/></td>
                  <td>{latestReport?.activitiesBlocked?<span style={{ fontSize:12,fontWeight:700,color:latestReport.activitiesBlocked==="Yes"?"#dc2626":"#22c55e" }}>{latestReport.activitiesBlocked}</span>:<span style={{ color:"#9ca3af" }}>—</span>}</td>
                  <td>{latestReport?.supportRequired?<span style={{ fontSize:12,fontWeight:700,color:latestReport.supportRequired==="Yes"?"#d97706":"#22c55e" }}>{latestReport.supportRequired}</span>:<span style={{ color:"#9ca3af" }}>—</span>}</td>
                  <td>{alerts.some(a=>String(a.pid)===String(project.id))?<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca" }}>Yes</span>:<span style={{ fontSize:12,color:"#22c55e",fontWeight:600 }}>No</span>}</td>
                  <td style={{ fontSize:12,fontWeight:600,color:dToC,whiteSpace:"nowrap" }}>{project.targetOpeningDate?formatDate(project.targetOpeningDate):<span style={{ color:"#9ca3af" }}>—</span>}</td>
                  <td style={{ fontWeight:700,fontSize:12,color:dToC,whiteSpace:"nowrap" }}>
                    {daysToOpening===null?"—":daysToOpening<0?`${Math.abs(daysToOpening)}d OVR`:daysToOpening===0?"Today":`${daysToOpening}d`}
                  </td>
                  <td style={{ fontSize:12,color:"#9ca3af",whiteSpace:"nowrap" }}>{latestReport?formatDate(latestReport.reportingDate||latestReport.submittedAt):<span style={{ color:"#9ca3af" }}>—</span>}</td>
                  <td>{reportTag({latestReport,daysSinceReport,missingReport})}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
