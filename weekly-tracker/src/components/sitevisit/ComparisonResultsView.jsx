import { WORK_PACKAGES } from "../../config/workPackages";
import PhotoGallery from "../shared/PhotoGallery";
import StatusPill from "./StatusPill";
import { getGCTaskEntry, comparisonResult } from "./gcReferenceHelpers";

const ACCENT = "#0891b2";

// TODO wave7: this is a THIRD independent comparison formula (comparisonResult()
// in gcReferenceHelpers.js, status-score based) — distinct from both siteVisitService's
// per-visit discrepancy calc and pmAlignmentEngine's cross-time drift formula. This is
// the legacy (non-Gantt) fallback path (old workPackages.js WP list), kept per the
// established dual-format pattern (TEMPLATE_MODEL.md). Do not add new comparison
// logic here. See src/engines/COMPARISON_MODEL.md.
function ComparisonResultsView({ project, projectReports, savedVisit, onNewVisit }) {
  const refRep = projectReports.find((r) => String(r.id) === String(savedVisit.referenceReportId));

  let totalItems = 0, matches = 0, discrepancies = 0, pmHigher = 0;
  const wpComparisons = WORK_PACKAGES.map((wp) => {
    const tasks = wp.tasks.map((task) => {
      const pmEntry = savedVisit.pmWorkPackageStatuses?.[wp.id]?.[task.name];
      const pmStatus = pmEntry?.observedStatus || null;
      const gcEntry = getGCTaskEntry(refRep, wp.id, task.name);
      const gcStatus = gcEntry?.status || null;
      if (!pmStatus && !gcStatus) return null;
      const r = comparisonResult(pmStatus, gcStatus);
      // Only count toward metrics when PM has actually assessed the task
      if (r && r.type !== "not-assessed") {
        totalItems++;
        if (r.type === "match") matches++;
        else if (r.type === "discrepancy") discrepancies++;
        else if (r.type === "pm-higher") pmHigher++;
      }
      return { taskName: task.name, pmStatus, pmProgress: pmEntry?.progress, gcStatus, gcProgress: gcEntry?.progress, result: r };
    }).filter(Boolean);
    return tasks.length ? { wp, tasks } : null;
  }).filter(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7fa", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Result header */}
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e5e7eb", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#e0f2fe", border: "2px solid #7dd3fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>✓</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0c4a6e" }}>Site Visit Recorded</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{project.storeCode} · {project.shoppingMallName} · {savedVisit.visitDate}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "Items Assessed",  value: totalItems,     color: ACCENT,    bg: "#e0f2fe", testId: "summary-items-assessed" },
              { label: "Matches",          value: matches,        color: "#166534", bg: "#dcfce7", testId: "summary-matches" },
              { label: "Discrepancies",    value: discrepancies,  color: discrepancies > 0 ? "#991b1b" : "#166534", bg: discrepancies > 0 ? "#fee2e2" : "#dcfce7", testId: "summary-discrepancies" },
              { label: "PM Ahead",         value: pmHigher,       color: "#92400e", bg: "#fef3c7", testId: "summary-pm-ahead" },
            ].map(({ label, value, color, bg, testId }) => (
              <div key={label} data-testid={testId} style={{ textAlign: "center", background: bg, borderRadius: 10, padding: "14px 8px" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison by WP */}
        <div data-testid="comparison-table" style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "22px 24px", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 4 }}>Comparison by Work Package</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18 }}>
            {refRep
              ? <>Reference: <strong style={{ color: "#374151" }}>GC Report — {refRep.reportingDate || new Date(refRep.submittedAt).toLocaleDateString("en-GB")}</strong></>
              : "No reference GC report — standalone site visit."
            }
          </div>

          {wpComparisons.map(({ wp, tasks }) => {
            const wpDisc = tasks.filter((t) => t.result?.type === "discrepancy").length;
            return (
              <div key={wp.id} data-testid={`comparison-row-${wp.id}`} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280" }}>{wp.name}</div>
                  {wpDisc > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
                      {wpDisc} discrepanc{wpDisc === 1 ? "y" : "ies"}
                    </span>
                  )}
                </div>
                <div className="field-form-scroll-x">
                  <div style={{ minWidth: 480 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 110px", gap: 8, padding: "6px 10px", background: "#f8fafc", borderRadius: 8, marginBottom: 4 }}>
                      {["Task", "GC Report", "PM Observed", "Result"].map((h, i) => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: i === 2 ? ACCENT : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</div>
                      ))}
                    </div>
                    {tasks.map(({ taskName, pmStatus, pmProgress, gcStatus, gcProgress, result: r }) => (
                      <div key={taskName} style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 110px", gap: 8, padding: "8px 10px", borderRadius: 8, background: r?.bg || "white", border: `1px solid ${r?.border || "#f3f4f6"}`, marginBottom: 3, alignItems: "center" }}>
                        <div style={{ fontSize: 12, color: "#374151" }}>{taskName}</div>
                        <div style={{ fontSize: 12 }}>
                          <StatusPill status={gcStatus} />
                          {gcProgress > 0 && <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>{gcProgress}%</span>}
                        </div>
                        <div style={{ fontSize: 12 }}>
                          <StatusPill status={pmStatus} />
                          {pmProgress > 0 && <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>{pmProgress}%</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: r?.color }}>{r?.badge}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Schedule assessment */}
          {(savedVisit.pmScheduleAssessment || refRep?.projectScheduleStatus) && (
            <div style={{ marginTop: 4, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>Schedule Assessment</div>
              <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                {refRep?.projectScheduleStatus && (
                  <div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 4 }}>GC Reported</div>
                    <StatusPill status={refRep.projectScheduleStatus} />
                  </div>
                )}
                {savedVisit.pmScheduleAssessment && (
                  <div>
                    <div style={{ fontSize: 10, color: ACCENT, fontWeight: 700, marginBottom: 4 }}>PM Assessment</div>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: savedVisit.pmScheduleAssessment === "On Track" ? "#dcfce7" : savedVisit.pmScheduleAssessment === "Critical" ? "#fff1f2" : "#fef3c7",
                      color: savedVisit.pmScheduleAssessment === "On Track" ? "#166534" : savedVisit.pmScheduleAssessment === "Critical" ? "#7f1d1d" : "#92400e",
                    }}>
                      {savedVisit.pmScheduleAssessment}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {savedVisit.observations && (
          <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 22px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>PM Observations</div>
            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, whiteSpace: "pre-wrap", background: "#f8fafc", borderRadius: 8, padding: "12px 16px" }}>{savedVisit.observations}</div>
          </div>
        )}

        <PhotoGallery paths={refRep?.photos} title="GC Report Photos" />
        <PhotoGallery paths={savedVisit.photos || savedVisit.photoUrls} title="PM Site Visit Photos" />

        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={onNewVisit}
            style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${ACCENT} 0%, #06b6d4 100%)`, color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            New Site Visit
          </button>
          <button type="button" onClick={() => window.history.back()}
            style={{ padding: "14px 28px", borderRadius: 12, border: "1px solid #d1d5db", background: "white", color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Back
          </button>
        </div>

      </div>
    </div>
  );
}

export default ComparisonResultsView;
