import { RISK_LEVEL_COLORS } from '../../config/statusColors';

export function KpiCard({ label, value, sub, color="#4ade80" }) {
  return (
    <div data-testid="kpi-card" style={{ background:"#1e293b", borderRadius:12, border:"1px solid #334155", padding:"12px 16px", flex:1, minWidth:110, boxShadow:"0 1px 3px rgba(0,0,0,0.2)", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"#94a3b8", marginBottom:7 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#64748b", marginTop:5 }}>{sub}</div>}
    </div>
  );
}

export function LineChart({ points=[], width=480, height=120, color="#2f855a" }) {
  const valid = points.filter(p=>p.date&&!isNaN(new Date(p.date)));
  if (valid.length < 2) return <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center", color:"#64748b", fontSize:13 }}>Not enough data</div>;
  const pad={top:10,right:14,bottom:28,left:34};
  const W=width-pad.left-pad.right, H=height-pad.top-pad.bottom;
  const xs=valid.map(p=>new Date(p.date).getTime());
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const sx=x=>pad.left+((x-minX)/Math.max(1,maxX-minX))*W;
  const sy=y=>pad.top+H-(y/100)*H;
  const poly=valid.map(p=>`${sx(new Date(p.date).getTime())},${sy(p.value)}`).join(" ");
  const yT=[0,50,100]; const step=Math.max(1,Math.floor(valid.length/4));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display:"block", overflow:"visible" }}>
      {yT.map(v=><line key={v} x1={pad.left} y1={sy(v)} x2={pad.left+W} y2={sy(v)} stroke="#334155" strokeWidth={0.5}/>)}
      {yT.map(v=><text key={v} x={pad.left-5} y={sy(v)+4} textAnchor="end" fontSize={10} fill="#9ca3af">{v}%</text>)}
      <polygon points={`${sx(xs[0])},${sy(0)} ${poly} ${sx(xs[xs.length-1])},${sy(0)}`} fill={color+"18"}/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
      {valid.map((p,i)=><circle key={i} cx={sx(new Date(p.date).getTime())} cy={sy(p.value)} r={2} fill="#1e293b" stroke={color} strokeWidth={1.5}/>)}
      {valid.filter((_,i)=>i%step===0||i===valid.length-1).map((p,i)=>
        <text key={i} x={sx(new Date(p.date).getTime())} y={height-4} textAnchor="middle" fontSize={10} fill="#9ca3af">
          {new Date(p.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}
        </text>
      )}
    </svg>
  );
}

export function ActivityHeatmap({ projectRows, weekCount=16 }) {
  const now=new Date();
  const weeks=Array.from({length:weekCount},(_,i)=>{
    const s=new Date(now); s.setDate(s.getDate()-(weekCount-1-i)*7); s.setHours(0,0,0,0);
    const e=new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999);
    return {start:s,end:e,label:s.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})};
  });
  const CW=36,CH=28,LW=100,G=3;
  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ display:"inline-block", minWidth:LW+weeks.length*(CW+G) }}>
        <div style={{ display:"flex", marginLeft:LW, marginBottom:5 }}>
          {weeks.map((w,i)=><div key={i} style={{ width:CW, marginRight:G, textAlign:"center", fontSize:8, color:"#64748b", flexShrink:0 }}>{i%2===0?w.label:""}</div>)}
        </div>
        {projectRows.map(({project,cells})=>(
          <div key={project.id} style={{ display:"flex", alignItems:"center", marginBottom:G }}>
            <div style={{ width:LW, fontSize:11, fontWeight:600, color:"#e2e8f0", paddingRight:8, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{project.storeCode}</div>
            {cells.map((cell,i)=>{
              const bg=cell.count>0?(cell.status==="On Track"?"#22c55e":cell.status==="Critical"?"#7f1d1d":cell.status==="Delayed"?"#dc2626":cell.status==="At Risk"?"#f59e0b":"#94a3b8"):"#1e293b";
              return <div key={i} title={`${weeks[i].label} · ${cell.count>0?cell.count+" report(s) · "+(cell.status||"submitted"):"No report"}`} style={{ width:CW, height:CH, borderRadius:4, background:bg, marginRight:G, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:cell.count>0?"white":"transparent" }}>{cell.count>0?String(cell.count):""}</div>;
            })}
          </div>
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:16, marginTop:12, marginLeft:LW, fontSize:11, color:"#94a3b8" }}>
          {[{color:"#1e293b",t:"No report"},{color:"#22c55e",t:"On Track"},{color:"#f59e0b",t:"At Risk"},{color:"#dc2626",t:"Delayed"},{color:"#7f1d1d",t:"Critical"},{color:"#94a3b8",t:"Submitted"}].map(({color,t})=>(
            <div key={t} style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:12,height:12,borderRadius:3,background:color,border:"1px solid #334155" }}/>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TextBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8", marginBottom:5 }}>{label}</div>
      <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#cbd5e1", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{value}</div>
    </div>
  );
}

export function SchedBadge({ status }) {
  const c = status==="On Track"?"#22c55e":status==="Critical"?"#ef4444":status==="Delayed"?"#ef4444":status==="At Risk"?"#f59e0b":"#94a3b8";
  return <span style={{ display:"inline-block",padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:700,background:c+"22",color:c,border:`1px solid ${c}44` }}>{status||"—"}</span>;
}

export function RiskBadge({ level }) {
  const RL = RISK_LEVEL_COLORS;
  const c = RL[level]||RL.UNKNOWN;
  return <span style={{ display:"inline-block",padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:700,background:c.bg,color:c.text,border:`1px solid ${c.border}` }}>{level}</span>;
}
