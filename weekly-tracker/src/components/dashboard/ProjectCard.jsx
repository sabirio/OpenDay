import { LineChart, SchedBadge } from './DashboardWidgets';
import { formatDate } from '../../utils/reportUtils';

/** @param {{ project, latestReport, progress, color, progressPoints, projReports, onSelect }} props */
export default function ProjectCard({ project, latestReport, progress, color, progressPoints, projReports, onSelect }) {
  return (
    <div onClick={()=>onSelect(String(project.id))} style={{ background:"#1e293b",borderRadius:12,border:"1px solid #334155",padding:"18px 20px",borderTop:`3px solid ${color}`,boxShadow:"0 1px 6px rgba(0,0,0,0.25)",cursor:"pointer" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
        <div>
          <div style={{ fontSize:14,fontWeight:800,color:"#f1f5f9" }}>{project.storeCode}</div>
          <div style={{ fontSize:11,color:"#94a3b8",marginTop:1 }}>{project.shoppingMallName}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:26,fontWeight:800,color,lineHeight:1 }}>{progress}%</div>
          <div style={{ marginTop:3 }}><SchedBadge status={latestReport?.projectScheduleStatus}/></div>
        </div>
      </div>
      <div style={{ background:"#334155",borderRadius:3,height:5,overflow:"hidden",marginBottom:12 }}>
        <div style={{ width:`${progress}%`,height:"100%",background:color,borderRadius:3 }}/>
      </div>
      <LineChart points={progressPoints} width={280} height={70} color={color}/>
      <div style={{ fontSize:11,color:"#64748b",marginTop:6 }}>
        {projReports.length} report{projReports.length!==1?"s":""} · latest {latestReport?formatDate(latestReport.reportingDate||latestReport.submittedAt):"none"}
      </div>
    </div>
  );
}
