import { daysSince as daysSinceFn, daysUntil } from '../utils/reportUtils';

export function computeRecommendedActions(riskScore, contScore, schedDev, latestReport, projSiteVisits, project) {
  const actions = [];
  if (!latestReport) {
    return [{ priority: "HIGH", action: "Request first weekly report from contractor", reason: "No data — risk assessment cannot be performed" }];
  }
  const dTo = project.targetOpeningDate ? daysUntil(project.targetOpeningDate) : null;
  const daysSince = daysSinceFn(latestReport.reportingDate || latestReport.submittedAt);

  if (dTo !== null && dTo < 0)
    actions.push({ priority: "HIGH", action: `Review opening date — project is ${Math.abs(dTo)}d past target`, reason: "Opening date has passed" });

  if (riskScore.level === "CRITICAL")
    actions.push({ priority: "HIGH", action: "Escalate to contractor director — request emergency meeting", reason: `Risk score ${riskScore.score}/100 (CRITICAL)` });

  if (latestReport.activitiesBlocked === "Yes")
    actions.push({ priority: "HIGH", action: "Resolve site blocker — assign owner and set resolution deadline", reason: "Activities currently blocked on site" });

  if (daysSince > 14)
    actions.push({ priority: "HIGH", action: "Request overdue weekly report immediately", reason: `No report submitted for ${daysSince} days` });

  if (riskScore.factors.some(f => f.name === "PM Site Visit mismatch" || f.name === "Hidden risk (PM vs GC)"))
    actions.push({ priority: "HIGH", action: "Joint PM-contractor site walkthrough to align on progress status", reason: "PM site visit found status discrepancies" });

  if (dTo !== null && dTo >= 0 && dTo < 30)
    actions.push({ priority: "HIGH", action: "Switch to daily status updates", reason: `${dTo} days to target opening` });

  if (contScore.pmAlignmentScore < 60)
    actions.push({ priority: "MEDIUM", action: "Increase PM site visit frequency — GC reports unreliable", reason: `PM alignment score ${contScore.pmAlignmentScore}/100` });
  else if (projSiteVisits.length === 0)
    actions.push({ priority: "MEDIUM", action: "Schedule first PM site visit to verify reported progress", reason: "No PM verification recorded yet" });

  if (schedDev && schedDev.deviationPct > 20)
    actions.push({ priority: "HIGH", action: "Agree recovery plan with contractor — revised milestones required", reason: `${schedDev.deviationPct}% behind expected progress` });

  if (latestReport.supportRequired === "Yes")
    actions.push({ priority: "MEDIUM", action: "Escalate support request to CLIENT decision makers", reason: `Support needed: ${(latestReport.supportTypes || []).join(", ") || "unspecified"}` });

  return actions.slice(0, 3);
}
