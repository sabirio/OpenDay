import { OPENING_STATUS_COLORS } from '../../config/statusColors';
import { formatDate } from '../../utils/reportUtils';

/** @param {{ opening: { daysToOpening: number|null, status: string, targetDate: string, blockerCount: number } }} props */
export default function TimelineFlag({ opening }) {
  const OPEN_COLOR = OPENING_STATUS_COLORS;
  return (
    <div data-testid="opening-readiness-status" style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"14px 16px" }}>
      <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b",marginBottom:10 }}>Opening Readiness</div>
      {opening.daysToOpening===null ? (
        <div style={{ color:"#64748b",fontSize:13,fontStyle:"italic",marginTop:22,textAlign:"center" }}>No target date set</div>
      ) : (
        <>
          <div style={{ textAlign:"center",marginBottom:12 }}>
            <div style={{ fontSize:46,fontWeight:800,color:OPEN_COLOR[opening.status]||"#94a3b8",lineHeight:1 }}>
              {opening.daysToOpening<0?`${Math.abs(opening.daysToOpening)}d`:opening.daysToOpening===0?"Today":`${opening.daysToOpening}d`}
            </div>
            <div style={{ fontSize:11,color:"#64748b",marginTop:3 }}>{opening.daysToOpening<0?"OVERDUE":opening.daysToOpening===0?"Opens today":"to opening"}</div>
          </div>
          <div style={{ display:"grid",gap:7 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12 }}>
              <span style={{ color:"#64748b" }}>Status</span>
              <span data-testid="opening-risk-badge" style={{ padding:"2px 9px",borderRadius:7,fontSize:11,fontWeight:700,background:(OPEN_COLOR[opening.status]||"#94a3b8")+"22",color:OPEN_COLOR[opening.status]||"#94a3b8",border:`1px solid ${(OPEN_COLOR[opening.status]||"#94a3b8")}44` }}>{opening.status}</span>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:12 }}>
              <span style={{ color:"#64748b" }}>Target date</span>
              <span style={{ color:"#e2e8f0",fontWeight:600 }}>{formatDate(opening.targetDate)}</span>
            </div>
            {opening.blockerCount>0&&(
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:12 }}>
                <span style={{ color:"#64748b" }}>Active blockers</span>
                <span style={{ color:"#fca5a5",fontWeight:700 }}>{opening.blockerCount}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
