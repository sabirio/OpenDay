import { computePmAlignmentItems } from "./pmAlignmentEngine";
import { DIM_LEVEL_ORDER } from "./riskEngine";
import { DAY_MS } from "../utils/reportUtils";

export function computeEscalations(sortedReports, projSiteVisits) {
  const results = [];

  // A. Risk repeated across reports
  const riskMap = {};
  sortedReports.forEach(r => {
    (r.risks || []).filter(Boolean).forEach(risk => {
      if (!riskMap[risk]) riskMap[risk] = [];
      riskMap[risk].push({ date: r.reportingDate || r.submittedAt, owner: (r.riskOwners || []).filter(Boolean).join(", ") });
    });
  });
  Object.entries(riskMap).forEach(([risk, appearances]) => {
    if (appearances.length < 2) return;
    results.push({
      type: "risk", label: risk, weeks: appearances.length,
      latestOwner: appearances[appearances.length - 1].owner,
      firstSeen: appearances[0].date, lastSeen: appearances[appearances.length - 1].date,
      severity: appearances.length >= 4 ? "CRITICAL" : appearances.length >= 3 ? "HIGH" : "MEDIUM",
      description: `Reported ${appearances.length} times without resolution`,
    });
  });

  // B. Blocker persisting 2+ reports
  const blockerReports = sortedReports.filter(r => r.activitiesBlocked === "Yes");
  if (blockerReports.length >= 2) {
    results.push({
      type: "blocker", label: "Repeated blocked activity", weeks: blockerReports.length,
      latestOwner: "General Contractor",
      firstSeen: blockerReports[0].reportingDate || blockerReports[0].submittedAt,
      lastSeen: blockerReports[blockerReports.length - 1].reportingDate || blockerReports[blockerReports.length - 1].submittedAt,
      severity: blockerReports.length >= 3 ? "CRITICAL" : "HIGH",
      description: `Activities blocked for ${blockerReports.length} consecutive reports`,
    });
  }

  // C. Support request open 14+ days
  const latestSupportR = [...sortedReports].reverse().find(r => r.supportRequired === "Yes");
  if (latestSupportR) {
    const daysSince = Math.floor((Date.now() - new Date(latestSupportR.reportingDate || latestSupportR.submittedAt).getTime()) / DAY_MS);
    if (daysSince >= 14) {
      results.push({
        type: "support", label: "Support request unresolved", weeks: Math.ceil(daysSince / 7),
        latestOwner: "Client / PM",
        firstSeen: latestSupportR.reportingDate || latestSupportR.submittedAt,
        lastSeen: latestSupportR.reportingDate || latestSupportR.submittedAt,
        severity: daysSince >= 21 ? "HIGH" : "MEDIUM",
        description: `Support requested ${daysSince}d ago without confirmed resolution`,
      });
    }
  }

  // D. PM site visit mismatch
  if (projSiteVisits && projSiteVisits.length > 0) {
    const latestVisit = [...projSiteVisits].sort((a, b) => new Date(b.visitDate || b.submittedAt) - new Date(a.visitDate || a.submittedAt))[0];
    const visitDate = new Date(latestVisit.visitDate || latestVisit.submittedAt);
    const gcAtVisit = sortedReports.filter(r => new Date(r.reportingDate || r.submittedAt) <= visitDate).slice(-1)[0] || sortedReports[sortedReports.length - 1];
    if (gcAtVisit) {
      const items = computePmAlignmentItems(gcAtVisit, latestVisit);
      const overstatements = items.filter(i => i.overstate).length;
      if (overstatements >= 2) {
        results.push({
          type: "mismatch", label: "PM Site Visit mismatch", weeks: 1,
          latestOwner: "General Contractor",
          firstSeen: latestVisit.visitDate || latestVisit.submittedAt,
          lastSeen: latestVisit.visitDate || latestVisit.submittedAt,
          severity: overstatements >= 4 ? "CRITICAL" : "HIGH",
          description: `GC overstated ${overstatements} work items vs PM site visit`,
        });
      }
    }
  }

  return results.sort((a, b) => DIM_LEVEL_ORDER.indexOf(b.severity) - DIM_LEVEL_ORDER.indexOf(a.severity));
}
