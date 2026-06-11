import { formatDate } from '../../utils/reportUtils';
import { KpiCard } from './DashboardWidgets';

export default function SiteVisitsTab({ svData, svFiltered, svKpis, svStoreFilter, onFilterChange, expandedVisitId, onExpandedChange, svStoreOptions }) {
  return (
    <div style={{ display:"grid",gap:16 }}>
      {/* Filter bar */}
      {svData.length>0&&(
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <select value={svStoreFilter} onChange={e=>{onFilterChange(e.target.value);onExpandedChange(null);}}
            style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #e5e7eb",fontSize:13,color:"#111827",background:"#ffffff",cursor:"pointer",outline:"none" }}>
            <option value="all">All stores</option>
            {svStoreOptions.map(code=><option key={code} value={code}>{code}</option>)}
          </select>
          {svStoreFilter!=="all"&&(
            <button type="button" onClick={()=>onFilterChange("all")} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear ×</button>
          )}
          <div style={{ marginLeft:"auto",fontSize:12,color:"#6b7280" }}>{svFiltered.length} / {svData.length} visits</div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
        <KpiCard label="Total Visits"    value={svKpis.totalVisits} color="#0891b2"/>
        <KpiCard label="Match Rate"      value={svKpis.overallMatchRate!==null?`${svKpis.overallMatchRate}%`:"—"} color={svKpis.overallMatchRate===null?"#9ca3af":svKpis.overallMatchRate>=80?"#22c55e":svKpis.overallMatchRate>=60?"#d97706":"#dc2626"} sub="PM vs GC agreement"/>
        <KpiCard label="Discrepancies"   value={svKpis.totalDiscrepancies} color={svKpis.totalDiscrepancies>0?"#dc2626":"#22c55e"} sub="GC overclaiming"/>
        <KpiCard label="PM Ahead"        value={svKpis.totalPmAhead}       color={svKpis.totalPmAhead>0?"#d97706":"#22c55e"}      sub="PM sees more progress"/>
        <KpiCard label="Matched Items"   value={svKpis.totalMatches}       color="#22c55e" sub={`of ${svKpis.totalAssessed} assessed`}/>
      </div>

      {svData.length===0?(
        <div className="dashboard-summary-card" style={{ textAlign:"center",padding:"48px 24px",color:"#9ca3af",fontSize:14 }}>
          No site visits recorded yet.<br/>
          <span style={{ fontSize:12 }}>Open a project from the Projects page and click "Site Visit" to start an assessment.</span>
        </div>
      ):(
        <div className="dashboard-summary-card">
          <div style={{ fontWeight:700,fontSize:15,color:"#111827",marginBottom:4 }}>Site Visit Comparison</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>PM observed statuses vs GC weekly reports · click row to expand detail</div>
          <div style={{ display:"grid",gap:8 }}>
            {svFiltered.map(({visit,project,gcReport,items,matches,discrepancies,pmAhead,matchRate})=>{
              const toggleId=visit.id||visit.submittedAt;
              const isExpanded=expandedVisitId===toggleId;
              const matchColor=matchRate===null?"#9ca3af":matchRate>=80?"#22c55e":matchRate>=60?"#d97706":"#dc2626";
              const phaseOrder=[...new Set(items.map(i=>i.phase))];
              const byPhase=phaseOrder.map(ph=>({phase:ph,items:items.filter(i=>i.phase===ph)})).filter(g=>g.items.length>0);
              return (
                <div key={toggleId} style={{ border:"1px solid #e5e7eb",borderRadius:10,overflow:"hidden" }}>
                  {/* Summary row */}
                  <div onClick={()=>onExpandedChange(isExpanded?null:toggleId)} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer",background:isExpanded?"#f0fdf4":"#ffffff",transition:"background 0.15s" }}>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                        <strong style={{ fontSize:13,color:"#111827" }}>{project?.storeCode||"Unknown"}</strong>
                        <span style={{ fontSize:11,color:"#9ca3af" }}>{project?.shoppingMallName}</span>
                        <span style={{ fontSize:11,color:"#e5e7eb" }}>·</span>
                        <span style={{ fontSize:12,color:"#374151",fontWeight:600 }}>Visit: {formatDate(visit.visitDate||visit.submittedAt)}</span>
                        {gcReport&&<span style={{ fontSize:11,color:"#6b7280" }}>GC ref: {formatDate(gcReport.reportingDate||gcReport.submittedAt)}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
                      {matchRate!==null&&<span style={{ fontSize:13,fontWeight:800,color:matchColor }}>{matchRate}%</span>}
                      {discrepancies>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca" }}>⚠ {discrepancies}</span>}
                      {pmAhead>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#fffbeb",color:"#d97706",border:"1px solid #fde68a" }}>↑ {pmAhead}</span>}
                      {matches>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0" }}>✓ {matches}</span>}
                      <span style={{ color:"#6b7280",fontSize:14,fontWeight:700 }}>{isExpanded?"▲":"▼"}</span>
                    </div>
                  </div>
                  {/* Expanded detail */}
                  {isExpanded&&(
                    <div style={{ padding:"16px",borderTop:"1px solid #e5e7eb",background:"#f9fafb" }}>
                      {visit.pmScheduleStatus&&(
                        <div style={{ marginBottom:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                          <span style={{ fontSize:10,color:"#9ca3af",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em" }}>PM Assessment:</span>
                          <span style={{ padding:"2px 9px",borderRadius:8,fontSize:12,fontWeight:700,
                            background:visit.pmScheduleStatus==="On Track"?"#f0fdf4":visit.pmScheduleStatus==="Delayed"?"#fef2f2":visit.pmScheduleStatus==="At Risk"?"#fffbeb":"#fef2f2",
                            color:visit.pmScheduleStatus==="On Track"?"#16a34a":visit.pmScheduleStatus==="Delayed"?"#dc2626":visit.pmScheduleStatus==="At Risk"?"#d97706":"#dc2626" }}>
                            {visit.pmScheduleStatus}
                          </span>
                          {visit.observations&&<span style={{ fontSize:12,color:"#6b7280" }}>{visit.observations}</span>}
                        </div>
                      )}
                      {byPhase.map(({phase,items:phItems})=>(
                        <div key={phase} style={{ marginBottom:14 }}>
                          <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#9ca3af",marginBottom:7 }}>{phase}</div>
                          <table style={{ width:"100%",borderCollapse:"collapse",background:"#ffffff",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
                            <thead>
                              <tr style={{ background:"#f9fafb" }}>
                                {["Item","GC Report","PM Observed","Result"].map(h=>(
                                  <th key={h} style={{ textAlign:"left",padding:"7px 12px",fontSize:11,color:"#6b7280",fontWeight:600,borderBottom:"1px solid #e5e7eb" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {phItems.map((item,idx)=>(
                                <tr key={idx} style={{ background:idx%2===0?"#ffffff":"#f9fafb",borderBottom:"1px solid #f3f4f6" }}>
                                  <td style={{ padding:"7px 12px",fontSize:12,color:"#374151" }}>{item.label}</td>
                                  <td style={{ padding:"7px 12px",fontSize:12,color:"#6b7280" }}>{item.gc||<span style={{ color:"#9ca3af" }}>—</span>}</td>
                                  <td style={{ padding:"7px 12px",fontSize:12,color:"#374151",fontWeight:600 }}>{item.pm||<span style={{ color:"#9ca3af" }}>—</span>}</td>
                                  <td style={{ padding:"7px 12px" }}>
                                    {item.result&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:item.result.bg,color:item.result.color,border:`1px solid ${item.result.border}` }}>{item.result.badge}</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
