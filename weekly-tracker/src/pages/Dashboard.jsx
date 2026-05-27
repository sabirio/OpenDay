import { useEffect, useMemo, useState } from "react";
import { constructionWeights, testingWeights, handoverWeights } from "../reportWeights";
import { computeProjectSummary } from "../engines/projectSummaryEngine";
import {
  formatDate, getStatusScore, estimateProgressFromStatuses, computeCumulativeStatuses,
  computeWPCumulativeStatuses, estimateProgressAuto,
} from "../reportUtils";
import { WORK_PACKAGES, WP_STATUS_SCORES, computePackageProgress } from "../config/workPackages";

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECT_COLORS = [
  "#2f855a","#2563eb","#d97706","#dc2626","#7c3aed",
  "#0891b2","#be185d","#059669","#92400e","#1d4ed8",
];


const RL = {
  CRITICAL:{ text:"#fca5a5", bg:"#450a0a", border:"#7f1d1d" },
  HIGH:    { text:"#fdba74", bg:"#431407", border:"#c2410c" },
  MEDIUM:  { text:"#fcd34d", bg:"#422006", border:"#b45309" },
  LOW:     { text:"#86efac", bg:"#052e16", border:"#166534" },
  UNKNOWN: { text:"#94a3b8", bg:"#1e293b", border:"#334155" },
};

// WP_COLS: one column per work package for the heatmap tab
const WP_COLS = WORK_PACKAGES.map((wp) => ({
  label:  wp.name.replace('Pre-construction', 'Pre-Con').replace('Demolition & Preparation', 'Demo').replace('Construction', 'Struct.').replace('MEP Rough-in', 'MEP').replace('Finishes & Final Installation', 'Finishes').replace('Fixtures & Equipment', 'Equipment').replace('Testing, Commissioning & Integration', 'T&C').replace('Snagging & Handover', 'Handover'),
  wpId:   wp.id,
  color:  wp.color,
  // Old-format fallback mappings (used when report has no workPackageStatuses)
  phase:  wp.id === 'demolition' ? 'demolition' : wp.id === 'commissioning' ? 'testing' : wp.id === 'handover' ? 'handover' : 'construction',
  key:    wp.id === 'demolition' ? null : wp.id === 'commissioning' ? 'Sprinkler system testing and commissioning' : wp.id === 'handover' ? 'Snag list resolution' : null,
}));

const CONSTRUCTION_ITEMS = [
  "Flooring installation","Drywall partition installation","Electrical systems installation",
  "HVAC systems installation","Fire safety systems installation","Low current systems installation",
  "Ceiling installation","Lighting installation","Furniture installation",
];
const TESTING_ITEMS = [
  "Sprinkler system testing and commissioning","Smoke detection system testing and commissioning",
  "Emergency announcement system testing and commissioning","HVAC system testing and commissioning",
  "Electrical system testing and commissioning","Low current testing and commissioning",
];
const HANDOVER_ITEMS = [
  "Staff training","Manuals, certificates, test reports","Final cleaning","Snag list resolution",
];

function svCompare(pm, gc) {
  if (!pm && !gc) return null;
  if (!pm) return { type:"not-assessed", badge:"Not assessed", color:"#94a3b8", bg:"#1e293b", border:"#334155" };
  if (!gc) return { type:"no-gc", badge:"No GC data", color:"#94a3b8", bg:"#0f172a", border:"#334155" };
  // WP_STATUS_SCORES has exact keys — avoids "Not Started".includes("started") false-positive in getStatusScore
  const psExact=WP_STATUS_SCORES[pm], gsExact=WP_STATUS_SCORES[gc];
  if (psExact===null||gsExact===null) return { type:"no-gc", badge:"N/A", color:"#94a3b8", bg:"#0f172a", border:"#334155" };
  const ps=psExact!==undefined?psExact:getStatusScore(pm);
  const gs=gsExact!==undefined?gsExact:getStatusScore(gc);
  if (ps===gs) return { type:"match",       badge:"✓ Match",       color:"#86efac", bg:"#052e16", border:"#166534" };
  if (ps<gs)   return { type:"discrepancy", badge:"⚠ Discrepancy", color:"#fca5a5", bg:"#450a0a", border:"#7f1d1d" };
  return       { type:"pm-higher",  badge:"↑ PM ahead",    color:"#fcd34d", bg:"#422006", border:"#b45309" };
}

// Mapping from old GC report field names → new WP task names (for GC old-format fallback)
const SV_OLD_TO_WP = {
  "Flooring installation":                                   { wpId:"finishes",      task:"Floor finishes" },
  "Drywall partition installation":                          { wpId:"construction",  task:"Partitions & drywall" },
  "Electrical systems installation":                        { wpId:"mep",           task:"Electrical conduits & cabling" },
  "HVAC systems installation":                              { wpId:"mep",           task:"HVAC ducts" },
  "Fire safety systems installation":                       { wpId:"mep",           task:"Fire suppression pipes" },
  "Low current systems installation":                       { wpId:"mep",           task:"Low current systems" },
  "Ceiling installation":                                    { wpId:"construction",  task:"Ceiling structures" },
  "Lighting installation":                                   { wpId:"finishes",      task:"Lighting fixtures" },
  "Furniture installation":                                  { wpId:"equipment",     task:"Furniture & loose items" },
  "Sprinkler system testing and commissioning":             { wpId:"commissioning", task:"Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":       { wpId:"commissioning", task:"Fire alarm testing" },
  "Emergency announcement system testing and commissioning":{ wpId:"commissioning", task:"Integrated systems testing" },
  "HVAC system testing and commissioning":                  { wpId:"commissioning", task:"HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":            { wpId:"commissioning", task:"Electrical testing & certification" },
  "Low current testing and commissioning":                  { wpId:"commissioning", task:"Security & access control testing" },
  "Staff training":                                          { wpId:"handover",      task:"Staff training" },
  "Manuals, certificates, test reports":                     { wpId:"handover",      task:"O&M manuals" },
  "Final cleaning":                                          { wpId:"handover",      task:"Final cleaning" },
  "Snag list resolution":                                    { wpId:"handover",      task:"Defects & snagging resolution" },
};

// Get the GC-reported status for a WP task — handles both new (workPackageStatuses) and old format
function getGCStatusForTask(gcReport, wpId, taskName) {
  if (!gcReport) return null;
  // New WP format
  const newEntry = gcReport.workPackageStatuses?.[wpId]?.[taskName];
  if (newEntry != null) return newEntry.status || null;
  // Old format reverse-lookup
  for (const [oldKey, mapping] of Object.entries(SV_OLD_TO_WP)) {
    if (mapping.wpId === wpId && mapping.task === taskName) {
      const s = gcReport.constructionStatuses?.[oldKey]
             || gcReport.testingStatuses?.[oldKey]
             || gcReport.handoverStatuses?.[oldKey]
             || null;
      return s;
    }
  }
  return null;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function computePhaseCompletions(statuses) {
  if (!statuses) return null;
  const demoScore = statuses.demolitionStatus ? Math.round(getStatusScore(statuses.demolitionStatus) * 100) : null;
  let cs=0,cw=0;
  Object.keys(constructionWeights||{}).forEach(k=>{const w=constructionWeights[k],st=statuses.constructionStatuses?.[k];if(st!==undefined){cs+=getStatusScore(st)*w;cw+=w;}});
  let ts=0,tw=0;
  Object.keys(testingWeights||{}).forEach(k=>{const w=testingWeights[k],st=statuses.testingStatuses?.[k];if(st!==undefined){ts+=getStatusScore(st)*w;tw+=w;}});
  let hs=0,hw=0;
  Object.keys(handoverWeights||{}).forEach(k=>{const w=handoverWeights[k],st=statuses.handoverStatuses?.[k];if(st!==undefined){hs+=getStatusScore(st)*w;hw+=w;}});
  return [
    { label:"Demolition",           pct:demoScore,                              color:"#8b5cf6" },
    { label:"Construction",         pct:cw>0?Math.round(cs/cw*100):null,        color:"#3b82f6" },
    { label:"Testing & Commissioning", pct:tw>0?Math.round(ts/tw*100):null,    color:"#f59e0b" },
    { label:"Handover",             pct:hw>0?Math.round(hs/hw*100):null,        color:"#22c55e" },
  ];
}

function computeRiskLevel(latestReport, progress, daysToOpening, missingReport) {
  if (!latestReport) return "UNKNOWN";
  const blocked  = latestReport.activitiesBlocked === "Yes";
  const atRisk   = latestReport.projectScheduleStatus === "At Risk" || latestReport.projectScheduleStatus === "Delayed" || latestReport.projectScheduleStatus === "Critical";
  const highScale= latestReport.riskScale === "High";
  if (blocked && atRisk) return "CRITICAL";
  if (daysToOpening !== null && daysToOpening < 30 && progress < 70) return "CRITICAL";
  if (blocked || (atRisk && highScale)) return "HIGH";
  if (atRisk || missingReport) return "MEDIUM";
  return "LOW";
}

function computePriorityScore(riskLevel, daysToOpening, missingReport) {
  if (riskLevel === "CRITICAL") return 0;
  if (riskLevel === "HIGH")     return 1;
  if (missingReport)            return 2;
  if (daysToOpening !== null && daysToOpening < 60) return 3;
  if (riskLevel === "MEDIUM")   return 4;
  return 5;
}

function getWpStatus(cs, wpCs, col) {
  // New WP format: return progress % as pseudo-status
  if (wpCs?.workPackageStatuses) {
    const pct = computePackageProgress(wpCs.workPackageStatuses, col.wpId);
    if (pct >= 100) return "Completed";
    if (pct >= 50)  return "In Progress";
    if (pct > 0)    return "In Progress";
    return null;
  }
  // Old format fallback
  if (col.phase === "demolition")   return cs?.demolitionStatus || null;
  if (col.key && col.phase === "construction") return cs?.constructionStatuses?.[col.key] || null;
  if (col.key && col.phase === "testing")      return cs?.testingStatuses?.[col.key] || null;
  if (col.key && col.phase === "handover")     return cs?.handoverStatuses?.[col.key] || null;
  return null;
}

function getWpProgress(wpCs, col) {
  if (!wpCs?.workPackageStatuses) return null;
  return computePackageProgress(wpCs.workPackageStatuses, col.wpId);
}

function wpStyle(status) {
  if (!status) return { bg:"#1e293b", text:"#475569", lbl:"–" };
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("ready"))   return { bg:"#052e16", text:"#86efac", lbl:"✓" };
  if (s.includes("progress") || s.includes("started")) return { bg:"#1e3a5f", text:"#93c5fd", lbl:"▶" };
  if (s.includes("planned") || s.includes("scheduled")) return { bg:"#422006", text:"#fcd34d", lbl:"S" };
  if (s.includes("not start"))                          return { bg:"#1e293b", text:"#475569", lbl:"·" };
  return { bg:"#1e293b", text:"#64748b", lbl:"?" };
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color="#4ade80" }) {
  return (
    <div data-testid="kpi-card" style={{ background:"#1e293b", borderRadius:12, border:"1px solid #334155", padding:"12px 16px", flex:1, minWidth:110, boxShadow:"0 1px 3px rgba(0,0,0,0.2)", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:"#94a3b8", marginBottom:7 }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#64748b", marginTop:5 }}>{sub}</div>}
    </div>
  );
}

function LineChart({ points=[], width=480, height=120, color="#2f855a" }) {
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


function ActivityHeatmap({ projectRows, weekCount=16 }) {
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

function TextBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:"#94a3b8", marginBottom:5 }}>{label}</div>
      <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:8, padding:"10px 12px", fontSize:13, color:"#cbd5e1", lineHeight:1.65, whiteSpace:"pre-wrap" }}>{value}</div>
    </div>
  );
}

// ── Project Detail Drawer ────────────────────────────────────────────────────

// Sub-components used only by the drawer

function ReportAgeBadge({ daysSince }) {
  if (daysSince === null) return <span style={{ fontSize:11,fontWeight:700,color:"#ef4444" }}>Never reported</span>;
  if (daysSince === 0)    return <span style={{ fontSize:11,color:"#22c55e" }}>Today</span>;
  if (daysSince <= 7)     return <span style={{ fontSize:11,color:"#22c55e" }}>{daysSince}d ago</span>;
  if (daysSince <= 14)    return <span style={{ fontSize:11,color:"#f59e0b" }}>{daysSince}d ago</span>;
  return <span style={{ fontSize:11,fontWeight:700,color:"#ef4444" }}>Overdue {daysSince}d</span>;
}

function SchedBadge({ status }) {
  const c = status==="On Track"?"#22c55e":status==="Critical"?"#ef4444":status==="Delayed"?"#ef4444":status==="At Risk"?"#f59e0b":"#94a3b8";
  return <span style={{ padding:"3px 9px",borderRadius:8,fontSize:11,fontWeight:700,background:c+"22",color:c,border:`1px solid ${c}44` }}>{status||"—"}</span>;
}

function StatusDot({ ok, critical }) {
  const c = ok ? "#22c55e" : critical ? "#ef4444" : "#f59e0b";
  return <span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:c,flexShrink:0 }}/>;
}

function ProjectDetailDrawer({ row, projSiteVisits, onClose }) {
  useEffect(()=>{
    const h=(e)=>{if(e.key==="Escape") onClose();};
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[onClose]);

  const { project, progress, projReports, wpCumulativeStatuses, color } = row || {};

  const summary = useMemo(()=>{
    if (!row) return null;
    return computeProjectSummary(project, projReports, projSiteVisits, progress, wpCumulativeStatuses);
  }, [row, project, projReports, projSiteVisits, progress, wpCumulativeStatuses]);

  if (!row || !summary) return null;

  const { contractor, pmVisit, risk, opening } = summary;

  const riskStyle = RL[risk.level] || RL.UNKNOWN;

  const SCHED_COLOR = { OK:"#22c55e", AT_RISK:"#f59e0b", HIGH:"#ef4444", CRITICAL:"#ef4444" };
  const OPEN_COLOR  = { Ready:"#22c55e", "No Date":"#64748b", "At Risk":"#f59e0b", Critical:"#ef4444", Overdue:"#ef4444" };

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:1000 }}/>
      <div style={{ position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:920,maxWidth:"97vw",maxHeight:"90vh",background:"#1e293b",zIndex:1001,overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.7)",borderRadius:16,display:"flex",flexDirection:"column" }}>

        {/* Header */}
        <div style={{ padding:"16px 22px 12px",borderBottom:"1px solid #334155",borderTop:`4px solid ${color}`,flexShrink:0 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:20,fontWeight:800,color:"#f1f5f9" }}>{project.storeCode}</div>
              <div style={{ fontSize:13,color:"#94a3b8",marginTop:2 }}>{project.shoppingMallName}</div>
              {(project.city||project.country)&&<div style={{ fontSize:11,color:"#64748b",marginTop:1 }}>{[project.city,project.country].filter(Boolean).join(", ")}</div>}
            </div>
            <div style={{ display:"flex",gap:8,flexShrink:0 }}>
              <button type="button" onClick={()=>navigator.clipboard.writeText(window.location.origin+"/contractor-report/"+project.id).catch(()=>{})}
                style={{ padding:"5px 11px",borderRadius:8,border:"1.5px solid #475569",background:"#0f172a",color:"#e2e8f0",fontSize:11,fontWeight:600,cursor:"pointer" }}
                title="Copy contractor report link">Copy link</button>
              <button type="button" onClick={onClose}
                style={{ padding:"5px 13px",borderRadius:8,border:"none",background:"#334155",color:"#f1f5f9",fontSize:12,fontWeight:700,cursor:"pointer" }}>
                Close ×
              </button>
            </div>
          </div>
          <div style={{ display:"flex",gap:14,marginTop:10,flexWrap:"wrap" }}>
            {[{l:"PM",v:project.projectManager},{l:"GC",v:project.generalContractor},{l:"Type",v:project.projectType},{l:"Status",v:project.projectStatus}].filter(x=>x.v).map(({l,v})=>(
              <div key={l}><span style={{ fontSize:9,color:"#64748b",fontWeight:700,textTransform:"uppercase" }}>{l} </span><span style={{ fontSize:12,color:"#e2e8f0",fontWeight:600 }}>{v}</span></div>
            ))}
          </div>
        </div>

        <div style={{ padding:"18px 22px",overflowY:"auto",flex:1 }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14 }}>

            {/* Block 1 — Contractor Report */}
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b",marginBottom:10 }}>Contractor Report</div>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:10 }}>
                <div style={{ fontSize:38,fontWeight:800,color,lineHeight:1 }}>{contractor.overallProgress}%</div>
                <div style={{ flex:1 }}>
                  <div style={{ background:"#334155",borderRadius:4,height:6,overflow:"hidden",marginBottom:6 }}>
                    <div style={{ width:`${contractor.overallProgress}%`,height:"100%",background:color,borderRadius:4 }}/>
                  </div>
                  {contractor.scheduleStatus&&<SchedBadge status={contractor.scheduleStatus}/>}
                </div>
              </div>
              <div style={{ display:"grid",gap:6 }}>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:12 }}>
                  <span style={{ color:"#64748b" }}>Last report</span>
                  <ReportAgeBadge daysSince={contractor.daysSinceReport}/>
                </div>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:12 }}>
                  <span style={{ color:"#64748b" }}>Total reports</span>
                  <span style={{ color:"#e2e8f0",fontWeight:600 }}>{contractor.reportCount}</span>
                </div>
                {contractor.blocked&&(
                  <div style={{ marginTop:4,padding:"5px 10px",background:"#450a0a",border:"1px solid #7f1d1d",borderRadius:7,fontSize:12,fontWeight:700,color:"#fca5a5" }}>⛔ Activities Blocked</div>
                )}
              </div>
            </div>

            {/* Block 2 — PM Site Visit */}
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b",marginBottom:10 }}>PM Site Visit</div>
              {!pmVisit.hasVisit?(
                <div style={{ color:"#64748b",fontSize:13,fontStyle:"italic",marginTop:22,textAlign:"center" }}>No site visits recorded</div>
              ):(
                <>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:10 }}>
                    <span style={{ color:"#64748b" }}>Latest visit</span>
                    <span style={{ color:"#e2e8f0",fontWeight:600 }}>{formatDate(pmVisit.latestVisitDate)}</span>
                  </div>
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10 }}>
                    {[
                      { l:"Matches",       v:pmVisit.matches,       c:"#22c55e" },
                      { l:"Discrepancies", v:pmVisit.discrepancies,  c:pmVisit.discrepancies>0?"#ef4444":"#22c55e" },
                      { l:"PM Ahead",      v:pmVisit.pmAhead,        c:"#f59e0b" },
                      { l:"Not Assessed",  v:pmVisit.notAssessed,    c:"#94a3b8" },
                    ].map(({l,v,c})=>(
                      <div key={l} style={{ background:"#1e293b",borderRadius:8,padding:"7px 10px",textAlign:"center" }}>
                        <div style={{ fontSize:20,fontWeight:800,color:c,lineHeight:1 }}>{v}</div>
                        <div style={{ fontSize:9,color:"#64748b",marginTop:3,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em" }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  {pmVisit.matchRate!==null&&(
                    <div>
                      <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3 }}>
                        <span style={{ color:"#64748b" }}>Match rate</span>
                        <span style={{ fontWeight:700,color:pmVisit.matchRate>=80?"#22c55e":pmVisit.matchRate>=50?"#f59e0b":"#ef4444" }}>{pmVisit.matchRate}%</span>
                      </div>
                      <div style={{ background:"#334155",borderRadius:3,height:5,overflow:"hidden" }}>
                        <div style={{ width:`${pmVisit.matchRate}%`,height:"100%",background:pmVisit.matchRate>=80?"#22c55e":pmVisit.matchRate>=50?"#f59e0b":"#ef4444",borderRadius:3 }}/>
                      </div>
                    </div>
                  )}
                  {pmVisit.pmScheduleAssessment&&(
                    <div style={{ marginTop:8,fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ color:"#64748b" }}>PM schedule</span>
                      <SchedBadge status={pmVisit.pmScheduleAssessment}/>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Block 3 — Risk Summary */}
            <div style={{ background:"#0f172a",border:`1px solid ${riskStyle.border}`,borderRadius:12,padding:"14px 16px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b" }}>Risk Summary</div>
                <span style={{ padding:"3px 10px",borderRadius:8,fontSize:12,fontWeight:700,background:riskStyle.bg,color:riskStyle.text,border:`1px solid ${riskStyle.border}` }}>{risk.level}</span>
              </div>
              <div style={{ display:"grid",gap:7 }}>
                {[
                  { l:"Schedule",    ok:risk.scheduleRisk==="OK",    crit:risk.scheduleRisk==="CRITICAL"||risk.scheduleRisk==="HIGH",  v:risk.scheduleRisk==="OK"?"On Track":risk.scheduleRisk==="AT_RISK"?"At Risk":risk.scheduleRisk==="HIGH"?"Delayed":"Critical" },
                  { l:"Opening",     ok:risk.openingStatus==="Ready", crit:risk.openingStatus==="Critical"||risk.openingStatus==="Overdue", v:risk.openingStatus },
                  { l:"PM vs GC",    ok:risk.discrepancyStatus==="OK", crit:risk.discrepancyStatus==="HAS_DISCREPANCIES", v:risk.discrepancyStatus==="OK"?"Match":risk.discrepancyStatus==="HAS_DISCREPANCIES"?"Discrepancies":risk.discrepancyStatus==="NO_VISIT"?"No Visit":"—" },
                  { l:"Reports",     ok:!risk.missingReport,    crit:risk.missingReport,   v:risk.missingReport?"Missing/Overdue":"Up to date" },
                  { l:"Blocked",     ok:!risk.blocked,          crit:risk.blocked,         v:risk.blocked?"Yes":"No" },
                  { l:"Support",     ok:!risk.supportRequired,  crit:false,                v:risk.supportRequired?"Required":"None" },
                  { l:"Add. Works",  ok:!risk.additionalWorks,  crit:false,                v:risk.additionalWorks?"Yes":"No" },
                ].map(({l,ok,crit,v})=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12 }}>
                    <span style={{ color:"#64748b" }}>{l}</span>
                    <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                      <StatusDot ok={ok} critical={crit}/>
                      <span style={{ color:ok?"#e2e8f0":crit?"#fca5a5":"#fcd34d",fontWeight:ok?400:600 }}>{v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Block 4 — Opening Readiness */}
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b",marginBottom:10 }}>Opening Readiness</div>
              {opening.daysToOpening===null?(
                <div style={{ color:"#64748b",fontSize:13,fontStyle:"italic",marginTop:22,textAlign:"center" }}>No target date set</div>
              ):(
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
                      <span style={{ padding:"2px 9px",borderRadius:7,fontSize:11,fontWeight:700,background:(OPEN_COLOR[opening.status]||"#94a3b8")+"22",color:OPEN_COLOR[opening.status]||"#94a3b8",border:`1px solid ${(OPEN_COLOR[opening.status]||"#94a3b8")}44` }}>{opening.status}</span>
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
          </div>

          {/* WP Phase progress bars */}
          {contractor.phaseProgress.length>0&&(
            <div style={{ background:"#0f172a",border:"1px solid #334155",borderRadius:12,padding:"14px 16px" }}>
              <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#64748b",marginBottom:10 }}>Work Package Progress</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 24px" }}>
                {contractor.phaseProgress.map(({wpId,name,color:wpColor,pct})=>(
                  <div key={wpId}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                      <span style={{ fontSize:11,color:"#94a3b8" }}>{name}</span>
                      <span style={{ fontSize:11,fontWeight:700,color:pct>0?wpColor:"#475569" }}>{pct}%</span>
                    </div>
                    <div style={{ background:"#334155",borderRadius:3,height:5,overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`,height:"100%",background:wpColor,borderRadius:3 }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard({ projects, reports, siteVisits = [] }) {
  const [activeView, setActiveView]           = useState("overview");
  const [drawerProjectId, setDrawerProjectId] = useState(null);
  const [filterStatus, setFilterStatus]       = useState("all");
  const [searchQuery, setSearchQuery]         = useState("");
  const [expandedVisitId, setExpandedVisitId] = useState(null);
  const [svStoreFilter, setSvStoreFilter]     = useState("all");

  // ── allRows ──
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

  // ── KPIs ──
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

  // ── Alerts ──
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

  // ── Heatmap rows ──
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

  // ── Contractor performance ──
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

  // ── PM Actions ──
  const pmActions = useMemo(()=>{
    const acts=[];
    allRows.forEach(({project,latestReport,daysSinceReport,missingReport})=>{
      if (latestReport?.supportRequired==="Yes") {
        const types=(latestReport.supportTypes||[]).filter(Boolean);
        (types.length?types:["Support"]).forEach(type=>{
          acts.push({pid:project.id,code:project.storeCode,mall:project.shoppingMallName,type,desc:latestReport.supportDescription||"—",owner:"Client / PM",age:daysSinceReport,priority:"HIGH"});
        });
      }
      if (latestReport?.activitiesBlocked==="Yes")
        acts.push({pid:project.id,code:project.storeCode,mall:project.shoppingMallName,type:"Contractor Escalation",desc:latestReport.delayReason||"Activities blocked",owner:"Client / PM",age:daysSinceReport,priority:"HIGH"});
      if (latestReport?.riskScale==="High")
        acts.push({pid:project.id,code:project.storeCode,mall:project.shoppingMallName,type:"Risk Escalation",desc:latestReport.riskDescription||"High risk scale",owner:(latestReport.riskOwners||[]).filter(Boolean).join(", ")||"PM",age:daysSinceReport,priority:"HIGH"});
      if (missingReport)
        acts.push({pid:project.id,code:project.storeCode,mall:project.shoppingMallName,type:"Missing Report Follow-up",desc:latestReport?`Last report ${daysSinceReport}d ago`:"No reports submitted",owner:"PM → Contractor",age:daysSinceReport,priority:"MEDIUM"});
    });
    const ord={HIGH:0,MEDIUM:1,LOW:2};
    return acts.sort((a,b)=>ord[a.priority]-ord[b.priority]);
  },[allRows]);

  // ── Risk themes ──
  const riskThemes = useMemo(()=>{
    const map={};
    allRows.forEach(({latestReport})=>{
      (latestReport?.risks||[]).filter(Boolean).forEach(r=>{map[r]=(map[r]||0)+1;});
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[allRows]);

  const riskOwners = useMemo(()=>{
    const map={};
    allRows.forEach(({latestReport})=>{
      (latestReport?.riskOwners||[]).filter(Boolean).forEach(o=>{map[o]=(map[o]||0)+1;});
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[allRows]);

  const svData = useMemo(()=>{
    return siteVisits.map(visit=>{
      const project=projects.find(p=>String(p.id)===String(visit.projectId));
      const projectReports=reports.filter(r=>String(r.projectId)===String(visit.projectId));
      const sortedReports=[...projectReports].sort((a,b)=>new Date(b.reportingDate||b.submittedAt)-new Date(a.reportingDate||a.submittedAt));
      // Prefer the GC report the PM explicitly referenced; fall back to latest
      const gcReport=(visit.referenceReportId
        ? projectReports.find(r=>String(r.id)===String(visit.referenceReportId))
        : null) || sortedReports[0] || null;

      const items=[];

      if (visit.pmWorkPackageStatuses) {
        // New WP format — iterate all work packages
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
        // Old format fallback
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

  // ── Helpers ──
  const currentPhaseLabel=(row)=>{
    const {cumulativeStatuses,latestReport}=row;
    return cumulativeStatuses?.currentPhase||(Array.isArray(latestReport?.currentPhases)?latestReport.currentPhases.join(" + "):latestReport?.currentPhase);
  };

  const schedBadge=(status)=>{
    const c=status==="On Track"?"#22c55e":status==="Critical"?"#7f1d1d":status==="Delayed"?"#dc2626":status==="At Risk"?"#f59e0b":"#94a3b8";
    return <span style={{ display:"inline-block",padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:700,background:c+"20",color:c,border:`1px solid ${c}44` }}>{status||"—"}</span>;
  };

  const riskBadge=(level)=>{
    const c=RL[level]||RL.UNKNOWN;
    return <span style={{ display:"inline-block",padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:700,background:c.bg,color:c.text,border:`1px solid ${c.border}` }}>{level}</span>;
  };

  const reportTag=({latestReport,daysSinceReport})=>{
    if (!latestReport) return <span style={{ fontSize:11,fontWeight:700,color:"#dc2626" }}>Missing</span>;
    if (daysSinceReport===0) return <span style={{ fontSize:11,color:"#22c55e" }}>Today</span>;
    if (daysSinceReport<=7) return <span style={{ fontSize:11,color:"#22c55e" }}>{daysSinceReport}d ago</span>;
    if (daysSinceReport<=14) return <span style={{ fontSize:11,color:"#d97706" }}>{daysSinceReport}d ago</span>;
    return <span style={{ fontSize:11,fontWeight:700,color:"#dc2626" }}>Overdue {daysSinceReport}d</span>;
  };

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

      {/* ── KPI Cards ── */}
      <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:16 }}>
        <KpiCard label="Total Projects"       value={kpis.total}         color="#475569"/>
        <KpiCard label="Active"               value={kpis.active}        color="#2f855a"  sub={`${kpis.total-kpis.active} closed`}/>
        <KpiCard label="At Risk"              value={kpis.atRisk}        color={kpis.atRisk>0?"#d97706":"#22c55e"}  sub="schedule issues"/>
        <KpiCard label="Critical"             value={kpis.critical}      color={kpis.critical>0?"#dc2626":"#22c55e"} sub="immediate action"/>
        <KpiCard label="Reports This Week"    value={kpis.reportsThisWeek} color="#0891b2" sub={`${reports.length} total`}/>
        <KpiCard label="Opening <30 Days"     value={kpis.openingSoon}   color={kpis.openingSoon>0?"#ea580c":"#22c55e"} sub="proximity alert"/>
      </div>


      {/* ── Filters ── */}
      <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center" }}>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:"#9ca3af",fontSize:13 }}>🔍</span>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingLeft:32,paddingRight:12,height:36,borderRadius:9,border:"1.5px solid #334155",fontSize:13,color:"#e2e8f0",background:"#1e293b",outline:"none",minWidth:180 }}/>
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #334155",fontSize:13,color:"#e2e8f0",background:"#1e293b",cursor:"pointer",outline:"none" }}>
          {[["all","All statuses"],["on-track","On Track"],["at-risk","At Risk"],["delayed","Delayed"],["critical","Critical"],["no-report","No Report"],["missing","Missing/Overdue"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}
        </select>
        {filtersActive&&<button type="button" onClick={clearFilters} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"#450a0a",color:"#fca5a5",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear ×</button>}
        <div style={{ marginLeft:"auto",fontSize:12,color:"#64748b" }}>{filteredRows.length} / {projects.length} projects</div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PROJECT STATUS MATRIX — always visible
          ══════════════════════════════════════════════════════════════════ */}
      <div className="dashboard-summary-card" style={{ marginBottom:16 }}>
        <div style={{ marginBottom:14 }}>
          <h2 style={{ fontSize:16,color:"#f1f5f9",margin:0 }}>Project Status Matrix</h2>
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
              {defaultSorted.length===0?(
                <tr><td colSpan="12" style={{ color:"#94a3b8",textAlign:"center",padding:"24px 0" }}>No matching projects.</td></tr>
              ):defaultSorted.map((row)=>{
                const {project,latestReport,progress,color,daysToOpening,daysSinceReport,riskLevel,missingReport}=row;
                const phase=currentPhaseLabel(row);
                const schedStatus=latestReport?.projectScheduleStatus;
                const isOpen=drawerProjectId===String(project.id);
                const progColor=progress>=75?"#22c55e":progress>=40?"#3b82f6":"#f59e0b";
                const dToC=daysToOpening===null?"#94a3b8":daysToOpening<0?"#dc2626":daysToOpening<30?"#dc2626":daysToOpening<90?"#d97706":"#16a34a";
                return (
                  <tr key={project.id} data-testid="dashboard-project-row" data-project-id={String(project.id)} onClick={()=>sel(String(project.id))} style={{ cursor:"pointer",background:isOpen?"#0d2d1e":undefined,transition:"background 0.15s" }}>
                    <td>
                      <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                        <div style={{ width:3,height:18,borderRadius:2,background:color,flexShrink:0 }}/>
                        {isOpen&&<span style={{ color:"#2f855a",fontSize:10 }}>▶</span>}
                        <strong style={{ color:"#f1f5f9" }}>{project.storeCode}</strong>
                      </div>
                    </td>
                    <td style={{ fontSize:12 }}>{phase||<span style={{ color:"#94a3b8" }}>No report</span>}</td>
                    <td>
                      <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                        <div style={{ width:48,background:"#334155",borderRadius:3,height:6,overflow:"hidden",flexShrink:0 }}>
                          <div style={{ width:`${progress}%`,height:"100%",background:progColor,borderRadius:3 }}/>
                        </div>
                        <span style={{ fontSize:12,fontWeight:700,color:"#e2e8f0",minWidth:28 }}>{progress}%</span>
                      </div>
                    </td>
                    <td>{schedBadge(schedStatus)}</td>
                    <td>{riskBadge(riskLevel)}</td>
                    <td>{latestReport?.activitiesBlocked?<span style={{ fontSize:12,fontWeight:700,color:latestReport.activitiesBlocked==="Yes"?"#dc2626":"#22c55e" }}>{latestReport.activitiesBlocked}</span>:<span style={{ color:"#94a3b8" }}>—</span>}</td>
                    <td>{latestReport?.supportRequired?<span style={{ fontSize:12,fontWeight:700,color:latestReport.supportRequired==="Yes"?"#d97706":"#22c55e" }}>{latestReport.supportRequired}</span>:<span style={{ color:"#94a3b8" }}>—</span>}</td>
                    <td>{alerts.some(a=>String(a.pid)===String(project.id))?<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#450a0a",color:"#fca5a5",border:"1px solid #7f1d1d" }}>Yes</span>:<span style={{ fontSize:12,color:"#22c55e",fontWeight:600 }}>No</span>}</td>
                    <td style={{ fontSize:12,fontWeight:600,color:dToC,whiteSpace:"nowrap" }}>{project.targetOpeningDate?formatDate(project.targetOpeningDate):<span style={{ color:"#94a3b8" }}>—</span>}</td>
                    <td style={{ fontWeight:700,fontSize:12,color:dToC,whiteSpace:"nowrap" }}>
                      {daysToOpening===null?"—":daysToOpening<0?`${Math.abs(daysToOpening)}d OVR`:daysToOpening===0?"Today":`${daysToOpening}d`}
                    </td>
                    <td style={{ fontSize:12,color:"#94a3b8",whiteSpace:"nowrap" }}>{latestReport?formatDate(latestReport.reportingDate||latestReport.submittedAt):<span style={{ color:"#94a3b8" }}>—</span>}</td>
                    <td>{reportTag({latestReport,daysSinceReport,missingReport})}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div style={{ display:"flex",gap:3,marginBottom:16,background:"#1e293b",borderRadius:12,padding:4,border:"1px solid #334155",width:"fit-content" }}>
        {VIEWS.map(({id,label})=>(
          <button key={id} type="button" onClick={()=>setActiveView(id)} style={{ padding:"7px 18px",borderRadius:9,border:"none",background:activeView===id?"#f1f5f9":"transparent",color:activeView===id?"#0f172a":"#94a3b8",fontSize:13,fontWeight:activeView===id?700:500,cursor:"pointer",transition:"all 0.15s",whiteSpace:"nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          OVERVIEW TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="overview"&&(
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
                        <tr key={project.id} onClick={()=>sel(String(project.id))} style={{ cursor:"pointer",background:isCritical?"#450a0a":isWarn?"#422006":undefined }}>
                          <td><div style={{ fontWeight:700,color:"#f1f5f9" }}>{project.storeCode}</div><div style={{ fontSize:11,color:"#9ca3af" }}>{project.shoppingMallName}</div></td>
                          <td style={{ fontSize:13,color:dToC,fontWeight:600 }}>{formatDate(project.targetOpeningDate)}</td>
                          <td style={{ fontSize:14,fontWeight:800,color:dToC }}>{daysToOpening<0?`${Math.abs(daysToOpening)}d OVR`:daysToOpening===0?"Today":`${daysToOpening}d`}</td>
                          <td>
                            <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                              <div style={{ width:52,background:"#334155",borderRadius:3,height:6,overflow:"hidden" }}><div style={{ width:`${progress}%`,height:"100%",background:progress>=75?"#22c55e":progress>=40?"#3b82f6":"#f59e0b",borderRadius:3 }}/></div>
                              <span style={{ fontSize:12,fontWeight:700 }}>{progress}%</span>
                            </div>
                          </td>
                          <td>{schedBadge(latestReport?.projectScheduleStatus)}</td>
                          <td>{riskBadge(riskLevel)}</td>
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
      )}

      {/* ══════════════════════════════════════════════════════════════════
          WORK PACKAGES TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="workpackages"&&(
        <div className="dashboard-summary-card">
          <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Work Package Status Heatmap</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Cumulative status of each work package per project · click row to open project details</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"separate",borderSpacing:"3px 3px",minWidth:900 }}>
              <thead>
                <tr>
                  <th style={{ textAlign:"left",padding:"4px 8px",fontSize:11,fontWeight:700,color:"#94a3b8",minWidth:110 }}>Project</th>
                  {WP_COLS.map(c=><th key={c.wpId} style={{ textAlign:"center",padding:"4px 3px",fontSize:9,fontWeight:700,color:c.color||"#94a3b8",minWidth:48,whiteSpace:"nowrap" }}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {defaultSorted.map(({project,cumulativeStatuses,wpCumulativeStatuses})=>(
                  <tr key={project.id} onClick={()=>sel(String(project.id))} style={{ cursor:"pointer" }}>
                    <td style={{ padding:"4px 8px",fontSize:12,fontWeight:700,color:"#f1f5f9",whiteSpace:"nowrap" }}>{project.storeCode}</td>
                    {WP_COLS.map(col=>{
                      const st=getWpStatus(cumulativeStatuses,wpCumulativeStatuses,col);
                      const pct=getWpProgress(wpCumulativeStatuses,col);
                      const s=wpStyle(st);
                      const cellLabel=pct!==null?`${pct}%`:s.lbl;
                      const title=pct!==null?`${col.wpId}: ${pct}%`:(st||"No data");
                      return <td key={col.wpId} style={{ textAlign:"center",padding:"3px" }}><div title={title} style={{ width:44,height:28,borderRadius:6,background:s.bg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:pct!==null?10:13,fontWeight:800,color:s.text,border:"1px solid #334155" }}>{cellLabel}</div></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex",gap:16,marginTop:16,flexWrap:"wrap",fontSize:11,paddingTop:12,borderTop:"1px solid #334155" }}>
            {[{s:"Completed",bg:"#052e16",t:"#86efac",l:"✓"},{s:"In Progress",bg:"#1e3a5f",t:"#93c5fd",l:"▶"},{s:"Scheduled",bg:"#422006",t:"#fcd34d",l:"S"},{s:"Not Started",bg:"#1e293b",t:"#475569",l:"·"},{s:"No Data",bg:"#1e293b",t:"#64748b",l:"–"}].map(({s,bg,t,l})=>(
              <div key={s} style={{ display:"flex",alignItems:"center",gap:6 }}>
                <div style={{ width:22,height:20,borderRadius:5,background:bg,border:"1px solid #334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:t }}>{l}</div>
                <span style={{ color:"#94a3b8" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          PROGRESS TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="progress"&&(
        <>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14 }}>
            {filteredRows.map(({project,latestReport,progress,color,progressPoints,projReports})=>(
              <div key={project.id} onClick={()=>sel(String(project.id))} style={{ background:"#1e293b",borderRadius:12,border:"1px solid #334155",padding:"18px 20px",borderTop:`3px solid ${color}`,boxShadow:"0 1px 6px rgba(0,0,0,0.25)",cursor:"pointer" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                  <div><div style={{ fontSize:14,fontWeight:800,color:"#f1f5f9" }}>{project.storeCode}</div><div style={{ fontSize:11,color:"#94a3b8",marginTop:1 }}>{project.shoppingMallName}</div></div>
                  <div style={{ textAlign:"right" }}><div style={{ fontSize:26,fontWeight:800,color,lineHeight:1 }}>{progress}%</div><div style={{ marginTop:3 }}>{schedBadge(latestReport?.projectScheduleStatus)}</div></div>
                </div>
                <div style={{ background:"#334155",borderRadius:3,height:5,overflow:"hidden",marginBottom:12 }}><div style={{ width:`${progress}%`,height:"100%",background:color,borderRadius:3 }}/></div>
                <LineChart points={progressPoints} width={280} height={70} color={color}/>
                <div style={{ fontSize:11,color:"#64748b",marginTop:6 }}>{projReports.length} report{projReports.length!==1?"s":""} · latest {latestReport?formatDate(latestReport.reportingDate||latestReport.submittedAt):"none"}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CONTRACTORS TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="contractors"&&(
        <div className="dashboard-summary-card">
          <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Contractor Performance</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>Grouped by general contractor · sorted by risk indicators</div>
          {contractorPerf.length===0?<div style={{ textAlign:"center",color:"#94a3b8",padding:"48px 0" }}>No contractor data.</div>:(
            <div style={{ overflowX:"auto" }}>
              <table className="dashboard-table" style={{ minWidth:760 }}>
                <thead><tr><th>Contractor</th><th>Projects</th><th>Avg Progress</th><th>At Risk</th><th>Blockers</th><th>Support</th><th>Missing Reports</th><th>Total Reports</th></tr></thead>
                <tbody>{contractorPerf.map(c=>{
                  const hasIssue=c.atRisk>0||c.blockers>0;
                  return (
                    <tr key={c.name} style={{ background:hasIssue?"#422006":undefined }}>
                      <td><div style={{ fontWeight:700,color:"#f1f5f9" }}>{c.name}</div><div style={{ fontSize:11,color:"#9ca3af" }}>{c.projects.join(", ")}</div></td>
                      <td style={{ fontSize:13,fontWeight:700 }}>{c.n}</td>
                      <td>
                        <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                          <div style={{ width:48,background:"#334155",borderRadius:3,height:6,overflow:"hidden" }}><div style={{ width:`${c.avgProg}%`,height:"100%",background:c.avgProg>=75?"#22c55e":c.avgProg>=40?"#3b82f6":"#f59e0b",borderRadius:3 }}/></div>
                          <span style={{ fontSize:12,fontWeight:700 }}>{c.avgProg}%</span>
                        </div>
                      </td>
                      <td style={{ fontSize:13,fontWeight:700,color:c.atRisk>0?"#d97706":"#22c55e" }}>{c.atRisk}/{c.n}</td>
                      <td style={{ fontSize:13,fontWeight:700,color:c.blockers>0?"#dc2626":"#22c55e" }}>{c.blockers}/{c.n}</td>
                      <td style={{ fontSize:13,fontWeight:700,color:c.support>0?"#7c3aed":"#22c55e" }}>{c.support}/{c.n}</td>
                      <td style={{ fontSize:13,fontWeight:700,color:c.missing>0?"#dc2626":"#22c55e" }}>{c.missing}/{c.n}</td>
                      <td style={{ fontSize:13,color:"#e2e8f0" }}>{c.reportCount}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ACTIVITY TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="activity"&&(
        <div className="dashboard-summary-card">
          <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Report Activity Heatmap</div>
          <div style={{ fontSize:12,color:"#9ca3af",marginBottom:18 }}>Last 16 weeks · cell = reports submitted · color = schedule status</div>
          <ActivityHeatmap projectRows={heatmapRows.filter(({project})=>filteredRows.some(({project:p})=>p.id===project.id))} weekCount={16}/>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SITE VISITS TAB
          ══════════════════════════════════════════════════════════════════ */}
      {activeView==="sitevisits"&&(
        <div style={{ display:"grid",gap:16 }}>
          {/* Filter bar */}
          {svData.length>0&&(
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              <select value={svStoreFilter} onChange={e=>{setSvStoreFilter(e.target.value);setExpandedVisitId(null);}}
                style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #334155",fontSize:13,color:"#e2e8f0",background:"#1e293b",cursor:"pointer",outline:"none" }}>
                <option value="all">All stores</option>
                {svStoreOptions.map(code=><option key={code} value={code}>{code}</option>)}
              </select>
              {svStoreFilter!=="all"&&(
                <button type="button" onClick={()=>setSvStoreFilter("all")} style={{ height:36,padding:"0 12px",borderRadius:9,border:"1.5px solid #7f1d1d",background:"#450a0a",color:"#fca5a5",fontSize:13,fontWeight:600,cursor:"pointer" }}>Clear ×</button>
              )}
              <div style={{ marginLeft:"auto",fontSize:12,color:"#64748b" }}>{svFiltered.length} / {svData.length} visits</div>
            </div>
          )}

          {/* KPI row */}
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            <KpiCard label="Total Visits"    value={svKpis.totalVisits} color="#0891b2"/>
            <KpiCard label="Match Rate"      value={svKpis.overallMatchRate!==null?`${svKpis.overallMatchRate}%`:"—"} color={svKpis.overallMatchRate===null?"#94a3b8":svKpis.overallMatchRate>=80?"#22c55e":svKpis.overallMatchRate>=60?"#d97706":"#dc2626"} sub="PM vs GC agreement"/>
            <KpiCard label="Discrepancies"   value={svKpis.totalDiscrepancies} color={svKpis.totalDiscrepancies>0?"#dc2626":"#22c55e"} sub="GC overclaiming"/>
            <KpiCard label="PM Ahead"        value={svKpis.totalPmAhead}       color={svKpis.totalPmAhead>0?"#d97706":"#22c55e"}      sub="PM sees more progress"/>
            <KpiCard label="Matched Items"   value={svKpis.totalMatches}       color="#22c55e" sub={`of ${svKpis.totalAssessed} assessed`}/>
          </div>

          {svData.length===0?(
            <div className="dashboard-summary-card" style={{ textAlign:"center",padding:"48px 24px",color:"#94a3b8",fontSize:14 }}>
              No site visits recorded yet.<br/>
              <span style={{ fontSize:12 }}>Open a project from the Projects page and click "Site Visit" to start an assessment.</span>
            </div>
          ):(
            <div className="dashboard-summary-card">
              <div style={{ fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:4 }}>Site Visit Comparison</div>
              <div style={{ fontSize:12,color:"#9ca3af",marginBottom:16 }}>PM observed statuses vs GC weekly reports · click row to expand detail</div>
              <div style={{ display:"grid",gap:8 }}>
                {svFiltered.map(({visit,project,gcReport,items,matches,discrepancies,pmAhead,matchRate})=>{
                  const toggleId=visit.id||visit.submittedAt;
                  const isExpanded=expandedVisitId===toggleId;
                  const matchColor=matchRate===null?"#94a3b8":matchRate>=80?"#22c55e":matchRate>=60?"#d97706":"#dc2626";
                  const phaseOrder=[...new Set(items.map(i=>i.phase))];
                  const byPhase=phaseOrder.map(ph=>({phase:ph,items:items.filter(i=>i.phase===ph)})).filter(g=>g.items.length>0);
                  return (
                    <div key={toggleId} style={{ border:"1px solid #334155",borderRadius:10,overflow:"hidden" }}>
                      {/* Summary row */}
                      <div onClick={()=>setExpandedVisitId(isExpanded?null:toggleId)} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",cursor:"pointer",background:isExpanded?"#0d2d1e":"#1e293b",transition:"background 0.15s" }}>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                            <strong style={{ fontSize:13,color:"#f1f5f9" }}>{project?.storeCode||"Unknown"}</strong>
                            <span style={{ fontSize:11,color:"#94a3b8" }}>{project?.shoppingMallName}</span>
                            <span style={{ fontSize:11,color:"#475569" }}>·</span>
                            <span style={{ fontSize:12,color:"#e2e8f0",fontWeight:600 }}>Visit: {formatDate(visit.visitDate||visit.submittedAt)}</span>
                            {gcReport&&<span style={{ fontSize:11,color:"#64748b" }}>GC ref: {formatDate(gcReport.reportingDate||gcReport.submittedAt)}</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
                          {matchRate!==null&&<span style={{ fontSize:13,fontWeight:800,color:matchColor }}>{matchRate}%</span>}
                          {discrepancies>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#450a0a",color:"#fca5a5",border:"1px solid #7f1d1d" }}>⚠ {discrepancies}</span>}
                          {pmAhead>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#422006",color:"#fcd34d",border:"1px solid #b45309" }}>↑ {pmAhead}</span>}
                          {matches>0&&<span style={{ padding:"2px 8px",borderRadius:7,fontSize:11,fontWeight:700,background:"#052e16",color:"#86efac",border:"1px solid #166534" }}>✓ {matches}</span>}
                          <span style={{ color:"#64748b",fontSize:14,fontWeight:700 }}>{isExpanded?"▲":"▼"}</span>
                        </div>
                      </div>
                      {/* Expanded detail */}
                      {isExpanded&&(
                        <div style={{ padding:"16px",borderTop:"1px solid #334155",background:"#0f172a" }}>
                          {visit.pmScheduleStatus&&(
                            <div style={{ marginBottom:14,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
                              <span style={{ fontSize:10,color:"#94a3b8",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.06em" }}>PM Assessment:</span>
                              <span style={{ padding:"2px 9px",borderRadius:8,fontSize:12,fontWeight:700,
                                background:visit.pmScheduleStatus==="On Track"?"#052e16":visit.pmScheduleStatus==="Delayed"?"#450a0a":visit.pmScheduleStatus==="At Risk"?"#422006":"#450a0a",
                                color:visit.pmScheduleStatus==="On Track"?"#86efac":visit.pmScheduleStatus==="Delayed"?"#fca5a5":visit.pmScheduleStatus==="At Risk"?"#fcd34d":"#fca5a5" }}>
                                {visit.pmScheduleStatus}
                              </span>
                              {visit.observations&&<span style={{ fontSize:12,color:"#94a3b8" }}>{visit.observations}</span>}
                            </div>
                          )}
                          {byPhase.map(({phase,items:phItems})=>(
                            <div key={phase} style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:"#94a3b8",marginBottom:7 }}>{phase}</div>
                              <table style={{ width:"100%",borderCollapse:"collapse",background:"#1e293b",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                                <thead>
                                  <tr style={{ background:"#0f172a" }}>
                                    {["Item","GC Report","PM Observed","Result"].map(h=>(
                                      <th key={h} style={{ textAlign:"left",padding:"7px 12px",fontSize:11,color:"#94a3b8",fontWeight:600,borderBottom:"1px solid #334155" }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {phItems.map((item,idx)=>(
                                    <tr key={idx} style={{ background:idx%2===0?"#1e293b":"#0f172a",borderBottom:"1px solid #334155" }}>
                                      <td style={{ padding:"7px 12px",fontSize:12,color:"#e2e8f0" }}>{item.label}</td>
                                      <td style={{ padding:"7px 12px",fontSize:12,color:"#94a3b8" }}>{item.gc||<span style={{ color:"#475569" }}>—</span>}</td>
                                      <td style={{ padding:"7px 12px",fontSize:12,color:"#e2e8f0",fontWeight:600 }}>{item.pm||<span style={{ color:"#475569" }}>—</span>}</td>
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
      )}

      {/* ── Project Detail Drawer ── */}
      <ProjectDetailDrawer row={drawerRow} projSiteVisits={drawerSiteVisits} onClose={()=>setDrawerProjectId(null)}/>
    </div>
  );
}

export default Dashboard;
