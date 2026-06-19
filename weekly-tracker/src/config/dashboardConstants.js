import { WORK_PACKAGES, WP_STATUS_SCORES, computePackageProgress } from '../config/workPackages';
import { getStatusScore } from '../utils/reportUtils';
import { constructionWeights, testingWeights, handoverWeights } from '../config/reportWeights';
import { getPhasesInOrder } from '../config/masterTaskLibrary';
import { calculatePhaseProgress } from '../engines/progressEngine';

// ── Constants ────────────────────────────────────────────────────────────────

export const PROJECT_COLORS = [
  "var(--accent)", "var(--text-secondary)", "var(--accent)", "var(--status-warn)",
  "var(--accent)", "var(--text-secondary)", "var(--accent)", "var(--status-alert)",
  "var(--accent)", "var(--text-muted)",
];

// WP_COLS: one column per masterTaskLibrary phase for the heatmap tab
const PHASE_SHORT = {
  demolition:    'Demo',
  floor_prep:    'Floor Prep',
  rough_in:      'Rough-In',
  floor_tiling:  'Tiling',
  testing:       'Sys. Test',
  wall_closing:  'Wall Close',
  finishes:      'Finishes',
  end_devices:   'End Dev.',
  commissioning: 'Commission',
  pre_opening:   'Pre-Open',
  handover:      'Handover',
};
export const WP_COLS = getPhasesInOrder().map(p => ({
  label: PHASE_SHORT[p.id] || p.label,
  wpId:  p.id,
  color: 'var(--text-muted)',
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
  if (!pm) return { type:"not-assessed", badge:"Not assessed", color:"var(--text-muted)",   bg:"var(--bg-elevated)",     border:"var(--border)" };
  if (!gc) return { type:"no-gc",        badge:"No GC data",  color:"var(--text-muted)",   bg:"var(--bg-elevated)",     border:"var(--border)" };
  // WP_STATUS_SCORES has exact keys — avoids "Not Started".includes("started") false-positive in getStatusScore
  const psExact=WP_STATUS_SCORES[pm], gsExact=WP_STATUS_SCORES[gc];
  if (psExact===null||gsExact===null) return { type:"no-gc", badge:"N/A", color:"var(--text-muted)", bg:"var(--bg-elevated)", border:"var(--border)" };
  const ps=psExact!==undefined?psExact:getStatusScore(pm);
  const gs=gsExact!==undefined?gsExact:getStatusScore(gc);
  if (ps===gs) return { type:"match",       badge:"✓ Match",       color:"var(--status-done)",  bg:"var(--status-done-bg)",  border:"var(--border)" };
  if (ps<gs)   return { type:"discrepancy", badge:"⚠ Discrepancy", color:"var(--status-alert)", bg:"var(--status-alert-bg)", border:"var(--border)" };
  return       { type:"pm-higher",  badge:"↑ PM ahead",    color:"var(--status-warn)",  bg:"var(--status-warn-bg)",  border:"var(--border)" };
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
    { label:"Demolition",           pct:demoScore,                              color:"var(--text-secondary)" },
    { label:"Construction",         pct:cw>0?Math.round(cs/cw*100):null,        color:"var(--accent)"          },
    { label:"Testing & Commissioning", pct:tw>0?Math.round(ts/tw*100):null,    color:"var(--status-warn)"     },
    { label:"Handover",             pct:hw>0?Math.round(hs/hw*100):null,        color:"var(--status-done)"     },
  ];
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
  if (wpCs?.workPackageStatuses) {
    const taskMap = wpCs.workPackageStatuses[col.wpId];
    if (!taskMap || Object.keys(taskMap).length === 0) return null;
    const { pct, count } = calculatePhaseProgress(col.wpId, taskMap);
    if (count === 0) return null;
    if (pct >= 100) return "Completed";
    if (pct > 0)    return "In Progress";
    return "Not Started";
  }
  return null;
}

export function getWpProgress(wpCs, col) {
  if (!wpCs?.workPackageStatuses) return null;
  const taskMap = wpCs.workPackageStatuses[col.wpId];
  if (!taskMap || Object.keys(taskMap).length === 0) return null;
  const { pct, count } = calculatePhaseProgress(col.wpId, taskMap);
  return count > 0 ? pct : null;
}

export function wpStyle(status) {
  if (!status) return { bg:"var(--bg-elevated)", text:"var(--text-muted)", lbl:"–" };
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("ready"))     return { bg:"var(--status-done-bg)",  text:"var(--status-done)",  lbl:"✓" };
  if (s.includes("progress") || s.includes("started"))  return { bg:"var(--accent-subtle)",   text:"var(--accent)",       lbl:"▶" };
  if (s.includes("planned") || s.includes("scheduled")) return { bg:"var(--status-warn-bg)",  text:"var(--status-warn)",  lbl:"S" };
  if (s.includes("not start"))                          return { bg:"var(--bg-elevated)",      text:"var(--text-muted)",   lbl:"·" };
  return { bg:"var(--bg-elevated)", text:"var(--text-muted)", lbl:"?" };
}
