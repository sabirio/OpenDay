import { WORK_PACKAGES, WP_STATUS_SCORES, computePackageProgress } from '../config/workPackages';
import { getStatusScore } from '../utils/reportUtils';
import { constructionWeights, testingWeights, handoverWeights } from '../config/reportWeights';

// ── Constants ────────────────────────────────────────────────────────────────

export const PROJECT_COLORS = [
  "#2f855a","#2563eb","#d97706","#dc2626","#7c3aed",
  "#0891b2","#be185d","#059669","#92400e","#1d4ed8",
];

// WP_COLS: one column per work package for the heatmap tab
export const WP_COLS = WORK_PACKAGES.map((wp) => ({
  label:  wp.name.replace('Pre-construction', 'Pre-Con').replace('Demolition & Preparation', 'Demo').replace('Construction', 'Struct.').replace('MEP Rough-in', 'MEP').replace('Finishes & Final Installation', 'Finishes').replace('Fixtures & Equipment', 'Equipment').replace('Testing, Commissioning & Integration', 'T&C').replace('Snagging & Handover', 'Handover'),
  wpId:   wp.id,
  color:  wp.color,
  phase:  wp.id === 'demolition' ? 'demolition' : wp.id === 'commissioning' ? 'testing' : wp.id === 'handover' ? 'handover' : 'construction',
  key:    wp.id === 'demolition' ? null : wp.id === 'commissioning' ? 'Sprinkler system testing and commissioning' : wp.id === 'handover' ? 'Snag list resolution' : null,
}));

export const CONSTRUCTION_ITEMS = [
  "Flooring installation","Drywall partition installation","Electrical systems installation",
  "HVAC systems installation","Fire safety systems installation","Low current systems installation",
  "Ceiling installation","Lighting installation","Furniture installation",
];
export const TESTING_ITEMS = [
  "Sprinkler system testing and commissioning","Smoke detection system testing and commissioning",
  "Emergency announcement system testing and commissioning","HVAC system testing and commissioning",
  "Electrical system testing and commissioning","Low current testing and commissioning",
];
export const HANDOVER_ITEMS = [
  "Staff training","Manuals, certificates, test reports","Final cleaning","Snag list resolution",
];

export function svCompare(pm, gc) {
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
export const SV_OLD_TO_WP = {
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
export function getGCStatusForTask(gcReport, wpId, taskName) {
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

export function computePhaseCompletions(statuses) {
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

export function computeRiskLevel(latestReport, progress, daysToOpening, missingReport) {
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

export function computePriorityScore(riskLevel, daysToOpening, missingReport) {
  if (riskLevel === "CRITICAL") return 0;
  if (riskLevel === "HIGH")     return 1;
  if (missingReport)            return 2;
  if (daysToOpening !== null && daysToOpening < 60) return 3;
  if (riskLevel === "MEDIUM")   return 4;
  return 5;
}

export function getWpStatus(cs, wpCs, col) {
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

export function getWpProgress(wpCs, col) {
  if (!wpCs?.workPackageStatuses) return null;
  return computePackageProgress(wpCs.workPackageStatuses, col.wpId);
}

export function wpStyle(status) {
  if (!status) return { bg:"#1e293b", text:"#475569", lbl:"–" };
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("ready"))   return { bg:"#052e16", text:"#86efac", lbl:"✓" };
  if (s.includes("progress") || s.includes("started")) return { bg:"#1e3a5f", text:"#93c5fd", lbl:"▶" };
  if (s.includes("planned") || s.includes("scheduled")) return { bg:"#422006", text:"#fcd34d", lbl:"S" };
  if (s.includes("not start"))                          return { bg:"#1e293b", text:"#475569", lbl:"·" };
  return { bg:"#1e293b", text:"#64748b", lbl:"?" };
}
