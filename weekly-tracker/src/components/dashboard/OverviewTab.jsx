import { formatDate } from '../../utils/reportUtils';
import { SchedBadge, RiskBadge } from './DashboardWidgets';

export default function OverviewTab({ allRows, projects, kpis, onSelect }) {
  return (
    <div style={{ display:"grid",gap:16 }}>

      {/* Portfolio Health */}
      <div className="dashboard-summary-card" style={{ margin:0 }}>
        <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Portfolio Health</div>
        <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Schedule status distribution</div>
        {(()=>{
          const onTrack=allRows.filter(({latestReport})=>latestReport?.projectScheduleStatus==="On Track").length;
          const atRisk=allRows.filter(({latestReport})=>latestReport?.projectScheduleStatus==="At Risk").length;
          const delayed=allRows.filter(({latestReport})=>latestReport?.projectScheduleStatus==="Delayed").length;
          const critical=allRows.filter(({latestReport})=>latestReport?.projectScheduleStatus==="Critical").length;
          const noReport=allRows.filter(({latestReport})=>!latestReport).length;
          const total=projects.length||1;
          return [{l:"On Track",n:onTrack,c:"#22c55e",b:"#052e16"},{l:"At Risk",n:atRisk,c:"#f59e0b",b:"#422006"},{l:"Delayed",n:delayed,c:"#dc2626",b:"#450a0a"},{l:"Critical",n:critical,c:"#fca5a5",b:"#7f1d1d"},{l:"No Report",n:noReport,c:"#94a3b8",b:"#334155"}].map(({l,n,c,b})=>(
            <div key={l} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
              <div style={{ fontSize:12,color:"#cbd5e1",width:76,flexShrink:0 }}>{l}</div>
              <div style={{ flex:1,background:"#334155",borderRadius:5,height:22,overflow:"hidden" }}><div style={{ width:`${(n/total)*100}%`,height:"100%",background:b,border:`1px solid ${c}44`,borderRadius:5,transition:"width 0.4s ease" }}/></div>
              <div style={{ fontSize:13,fontWeight:700,color:c,width:20,textAlign:"right" }}>{n}</div>
            </div>
          ));
        })()}
        <div style={{ display:"flex",gap:10,marginTop:14,paddingTop:12,borderTop:"1px solid #334155" }}>
          {[{l:"Blockers",v:kpis.blocked,c:"#dc2626"},{l:"Support",v:kpis.support,c:"#d97706"},{l:"Critical",v:kpis.critical,c:"#ea580c"}].map(({l,v,c})=>(
            <div key={l} style={{ flex:1,textAlign:"center",background:v>0?c+"18":"#0f172a",borderRadius:9,padding:"10px 6px",border:`1px solid ${v>0?c+"40":"#334155"}` }}>
              <div style={{ fontSize:24,fontWeight:800,color:v>0?c:"#64748b" }}>{v}</div>
              <div style={{ fontSize:10,color:"#94a3b8",marginTop:2,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Opening Countdown */}
      {(()=>{
        const withOpening=[...allRows.filter(r=>r.daysToOpening!==null)].sort((a,b)=>a.daysToOpening-b.daysToOpening);
        if (withOpening.length===0) return null;
        return (
          <div className="dashboard-summary-card" style={{ margin:0 }}>
            <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Opening Countdown</div>
            <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Projects sorted by nearest target opening date</div>
            <div style={{ overflowX:"auto" }}>
              <table className="dashboard-table" style={{ minWidth:680 }}>
                <thead><tr><th>Project</th><th>Target Opening</th><th>Days Left</th><th>Progress</th><th>Schedule</th><th>Risk</th><th>Flag</th></tr></thead>
                <tbody>{withOpening.map(({project,latestReport,progress,daysToOpening,riskLevel})=>{
                  const dToC=daysToOpening<0?"#dc2626":daysToOpening<30?"#dc2626":daysToOpening<90?"#d97706":"#16a34a";
                  const isCritical=daysToOpening<30&&progress<80;
                  const isWarn=!isCritical&&daysToOpening<60&&progress<60;
                  return (
                    <tr key={project.id} onClick={()=>onSelect(String(project.id))} style={{ cursor:"pointer",background:isCritical?"#450a0a":isWarn?"#422006":undefined }}>
                      <td><div style={{ fontWeight:700,color:"#f1f5f9" }}>{project.storeCode}</div><div style={{ fontSize:11,color:"#9ca3af" }}>{project.shoppingMallName}</div></td>
                      <td style={{ fontSize:13,color:dToC,fontWeight:600 }}>{formatDate(project.targetOpeningDate)}</td>
                      <td style={{ fontSize:14,fontWeight:800,color:dToC }}>{daysToOpening<0?`${Math.abs(daysToOpening)}d OVR`:daysToOpening===0?"Today":`${daysToOpening}d`}</td>
                      <td>
                        <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                          <div style={{ width:52,background:"#334155",borderRadius:3,height:6,overflow:"hidden" }}><div style={{ width:`${progress}%`,height:"100%",background:progress>=75?"#22c55e":progress>=40?"#3b82f6":"#f59e0b",borderRadius:3 }}/></div>
                          <span style={{ fontSize:12,fontWeight:700 }}>{progress}%</span>
                        </div>
                      </td>
                      <td><SchedBadge status={latestReport?.projectScheduleStatus}/></td>
                      <td><RiskBadge level={riskLevel}/></td>
                      <td>{isCritical?<span style={{ fontSize:11,fontWeight:700,color:"#fca5a5",padding:"2px 7px",borderRadius:6,background:"#450a0a",border:"1px solid #7f1d1d" }}>CRITICAL</span>:isWarn?<span style={{ fontSize:11,fontWeight:700,color:"#fcd34d",padding:"2px 7px",borderRadius:6,background:"#422006",border:"1px solid #b45309" }}>WARNING</span>:<span style={{ fontSize:11,color:"#22c55e",fontWeight:600 }}>OK</span>}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
