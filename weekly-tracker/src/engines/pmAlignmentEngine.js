import { getStatusScore } from "../reportUtils";
import { constructionWeights, testingWeights, handoverWeights } from "../reportWeights";

export const CONS_KEYS = Object.keys(constructionWeights || {});
export const TEST_KEYS = Object.keys(testingWeights || {});
export const HAND_KEYS = Object.keys(handoverWeights || {});

export function computePmAlignmentItems(gcReport, pmVisit) {
  if (!gcReport || !pmVisit) return [];
  const items = [];

  const push = (name, gcS, pmS) => {
    if (!gcS && !pmS) return;
    const diff = getStatusScore(gcS) - getStatusScore(pmS);
    const overstate = diff > 0.4;
    const match = Math.abs(diff) <= 0.15;
    const mismatchType = diff > 0.75 ? "Overstatement"
      : diff > 0.4  ? "Overstatement"
      : diff > 0.15 ? "Minor overstatement"
      : diff < -0.15 ? "PM ahead"
      : "Match";
    const severity = diff > 0.75 ? "CRITICAL"
      : diff > 0.4  ? "HIGH"
      : diff > 0.15 ? "MEDIUM"
      : null;
    items.push({ name, gcStatus: gcS || "—", pmStatus: pmS || "—", overstate, match, mismatchType, severity, diff });
  };

  push("Demolition", gcReport.demolitionStatus || "", pmVisit.demolitionStatus || "");
  CONS_KEYS.forEach(k => push(k, gcReport.constructionStatuses?.[k] || "", pmVisit.constructionStatuses?.[k] || ""));
  TEST_KEYS.forEach(k => push(k, gcReport.testingStatuses?.[k] || "", pmVisit.testingStatuses?.[k] || ""));
  HAND_KEYS.forEach(k => push(k, gcReport.handoverStatuses?.[k] || "", pmVisit.handoverStatuses?.[k] || ""));

  return items;
}

export function computeConfidenceLevel(projReports, projSiteVisits, latestReport) {
  let pts = 0;
  if (projReports.length >= 8) pts += 3;
  else if (projReports.length >= 4) pts += 2;
  else if (projReports.length >= 1) pts += 1;
  if (projSiteVisits.length >= 2) pts += 3;
  else if (projSiteVisits.length === 1) pts += 2;
  if (latestReport) {
    const daysSince = Math.floor((new Date() - new Date(latestReport.reportingDate || latestReport.submittedAt)) / 86400000);
    if (daysSince <= 7) pts += 2;
    else if (daysSince <= 14) pts += 1;
  }
  const level = pts >= 6 ? "HIGH" : pts >= 3 ? "MEDIUM" : "LOW";
  const color = level === "HIGH" ? "#22c55e" : level === "MEDIUM" ? "#f59e0b" : "#94a3b8";
  return { level, color };
}
