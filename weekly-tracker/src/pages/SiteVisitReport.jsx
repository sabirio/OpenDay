import { useParams } from "react-router-dom";
import { useState } from "react";
import { getStatusScore } from "../reportUtils";

const constructionItems = [
  "Flooring installation",
  "Drywall partition installation",
  "Electrical systems installation",
  "HVAC systems installation",
  "Fire safety systems installation",
  "Low current systems installation",
  "Ceiling installation",
  "Lighting installation",
  "Furniture installation",
];

const testingItems = [
  "Sprinkler system testing and commissioning",
  "Smoke detection system testing and commissioning",
  "Emergency announcement system testing and commissioning",
  "HVAC system testing and commissioning",
  "Electrical system testing and commissioning",
  "Low current testing and commissioning",
];

const handoverItems = [
  "Staff training",
  "Manuals, certificates, test reports",
  "Final cleaning",
  "Snag list resolution",
];

const ACCENT = "#0891b2";

function gcPrefill(ref) {
  if (!ref) return { demolitionStatus: "", constructionStatuses: {}, testingStatuses: {}, handoverStatuses: {} };
  return {
    demolitionStatus: ref.demolitionStatus || "",
    constructionStatuses: Object.fromEntries(constructionItems.map(k => [k, ref.constructionStatuses?.[k] || ""])),
    testingStatuses:      Object.fromEntries(testingItems.map(k => [k, ref.testingStatuses?.[k] || ""])),
    handoverStatuses:     Object.fromEntries(handoverItems.map(k => [k, ref.handoverStatuses?.[k] || ""])),
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FormSection({ title, accentColor = ACCENT, note, children }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid #f3f4f6", borderLeft: `4px solid ${accentColor}`, background: "#fafafa" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
      </div>
      <div style={{ padding: "20px 22px" }}>
        {note && <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>{note}</div>}
        {children}
      </div>
    </div>
  );
}

function StatusSelector({ label, value, onChange, gcStatus }) {
  const opts = [
    { label: "N/A",         value: "Not applicable", activeBg: "#f3f4f6", activeColor: "#6b7280",  activeBorder: "#d1d5db" },
    { label: "Not started", value: "Not started",    activeBg: "#fee2e2", activeColor: "#dc2626",  activeBorder: "#fca5a5" },
    { label: "In progress", value: "In progress",    activeBg: "#fef3c7", activeColor: "#d97706",  activeBorder: "#fde68a" },
    { label: "Completed",   value: "Completed",      activeBg: "#dcfce7", activeColor: "#16a34a",  activeBorder: "#86efac" },
  ];
  const gcMatchesOpt = gcStatus && opts.some(o => o.value === gcStatus);
  const pmChanged = value && gcStatus && value !== gcStatus;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #f9fafb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, paddingRight: 16 }}>
          <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.4 }}>{label}</span>
          {pmChanged && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", whiteSpace: "nowrap" }}>PM changed</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {opts.map((opt) => {
            const sel = value === opt.value;
            const isGc = gcStatus === opt.value;
            return (
              <button key={opt.value} type="button" onClick={() => onChange(opt.value)} style={{
                position: "relative",
                padding: "4px 10px", borderRadius: 7,
                border: `1.5px solid ${sel ? opt.activeBorder : isGc ? "#7dd3fc" : "#e5e7eb"}`,
                background: sel ? opt.activeBg : isGc ? "#e0f2fe" : "white",
                color: sel ? opt.activeColor : isGc ? "#0369a1" : "#9ca3af",
                fontSize: 11, fontWeight: sel ? 700 : isGc ? 600 : 400,
                cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.1s",
              }}>
                {opt.label}
                {isGc && (
                  <span style={{ position: "absolute", top: -7, right: -5, fontSize: 7, fontWeight: 800, background: ACCENT, color: "white", borderRadius: 4, padding: "1px 4px", lineHeight: 1.4, letterSpacing: "0.02em", pointerEvents: "none" }}>GC</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {gcStatus && !gcMatchesOpt && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, paddingLeft: 2 }}>
          GC reported: <em style={{ color: "#6b7280" }}>{gcStatus}</em>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  if (!status) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
  const schedColor = status === "On Track" ? "#16a34a" : status === "Critical" ? "#7f1d1d" : status === "Delayed" ? "#dc2626" : status === "At Risk" ? "#d97706" : null;
  const schedBg    = status === "On Track" ? "#dcfce7" : status === "Critical" ? "#fff1f2" : status === "Delayed" ? "#fee2e2" : status === "At Risk" ? "#fef3c7" : null;
  const score = getStatusScore(status);
  const color = schedColor ?? (score >= 1 ? "#16a34a" : score >= 0.5 ? "#d97706" : score > 0 ? "#2563eb" : "#6b7280");
  const bg    = schedBg    ?? (score >= 1 ? "#dcfce7" : score >= 0.5 ? "#fef3c7" : score > 0 ? "#dbeafe" : "#f3f4f6");
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: bg, color }}>
      {status}
    </span>
  );
}

function comparisonResult(pm, gc) {
  if (!pm && !gc) return null;
  if (!pm) return { type: "not-assessed", badge: "Not assessed", color: "#94a3b8", bg: "white",    border: "#f3f4f6" };
  if (!gc) return { type: "no-gc",        badge: "No GC data",   color: "#6b7280",  bg: "#f8fafc", border: "#e5e7eb" };
  const ps = getStatusScore(pm), gs = getStatusScore(gc);
  if (ps === gs) return { type: "match",       badge: "✓ Match",       color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" };
  if (ps <  gs) return { type: "discrepancy", badge: "⚠ Discrepancy", color: "#991b1b", bg: "#fff1f2", border: "#fca5a5" };
  return              { type: "pm-higher",    badge: "↑ PM ahead",    color: "#92400e", bg: "#fefce8", border: "#fde68a" };
}

const CMP_HEADER = (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px", gap: 8, padding: "6px 10px", background: "#f8fafc", borderRadius: 8, marginBottom: 4 }}>
    {["Item", "GC Report", "PM Observed", "Result"].map((h, i) => (
      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: i === 2 ? ACCENT : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</div>
    ))}
  </div>
);

function ComparisonSection({ title, accentColor, items, pmStatuses, gcStatuses, demolition }) {
  const rows = demolition
    ? [{ item: "Demolition works", pm: pmStatuses, gc: gcStatuses }]
    : items.map(item => ({ item, pm: pmStatuses?.[item], gc: gcStatuses?.[item] }));

  const visible = rows.filter(r => r.pm || r.gc);
  if (!visible.length) return null;

  const discrepancies = visible.filter(r => comparisonResult(r.pm, r.gc)?.type === "discrepancy").length;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: accentColor }}>{title}</div>
        {discrepancies > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}>
            {discrepancies} discrepanc{discrepancies === 1 ? "y" : "ies"}
          </span>
        )}
      </div>
      {CMP_HEADER}
      {visible.map(({ item, pm, gc }) => {
        const r = comparisonResult(pm, gc);
        return (
          <div key={item} style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 120px", gap: 8, padding: "8px 10px", borderRadius: 8, background: r?.bg || "white", border: `1px solid ${r?.border || "#f3f4f6"}`, marginBottom: 3, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#374151" }}>{item}</div>
            <div><StatusPill status={gc} /></div>
            <div><StatusPill status={pm} /></div>
            <div style={{ fontSize: 11, fontWeight: 700, color: r?.color }}>{r?.badge}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

function SiteVisitReport({ projects, reports, siteVisits, onSaveSiteVisit }) {
  const { projectId } = useParams();
  const project = projects.find((p) => String(p.id) === projectId);

  const projectReports = [...(reports.filter((r) => String(r.projectId) === projectId))]
    .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt));

  const latestReport = projectReports[0] || null;

  const [form, setForm] = useState(() => ({
    visitDate: new Date().toISOString().split("T")[0],
    referenceReportId: latestReport?.id ? String(latestReport.id) : "",
    ...gcPrefill(latestReport),
    pmScheduleAssessment: "",
    observations: "",
    photos: [],
    declarationConfirmed: false,
  }));

  const [errors, setErrors]       = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [savedVisit, setSavedVisit] = useState(null);

  const referenceReport = projectReports.find((r) => String(r.id) === String(form.referenceReportId));

  function set(name, value) { setForm((p) => ({ ...p, [name]: value })); }
  function setNested(group, item, value) { setForm((p) => ({ ...p, [group]: { ...p[group], [item]: value } })); }

  function validate() {
    const errs = [];
    if (!form.visitDate) errs.push("Visit date is required.");
    if (!form.pmScheduleAssessment) errs.push("PM schedule assessment is required.");
    if (!form.declarationConfirmed) errs.push("Declaration confirmation is required.");
    return errs;
  }

  async function submit() {
    const errs = validate();
    if (errs.length) { setErrors(errs); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setErrors([]);
    const visitData = {
      projectId: projectId,
      referenceReportId: form.referenceReportId || null,
      ...form,
      photos: form.photos.map((p) => p?.name || p),
      submittedAt: new Date().toISOString(),
    };
    try {
      const saved = await onSaveSiteVisit(visitData);
      setSavedVisit(saved);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Failed to submit site visit:", err);
      alert(`Site visit error: ${err?.message || JSON.stringify(err)}`);
    }
  }

  if (!project) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗</div>
          <h2 style={{ color: "#111827", marginBottom: 8 }}>Project not found</h2>
          <p style={{ color: "#6b7280" }}>This link is invalid or the project has been removed.</p>
        </div>
      </div>
    );
  }

  // ── COMPARISON RESULTS VIEW ────────────────────────────────────────────────

  if (submitted && savedVisit) {
    const refRep = projectReports.find((r) => String(r.id) === String(savedVisit.referenceReportId));

    const allItems = [
      { pm: savedVisit.demolitionStatus, gc: refRep?.demolitionStatus },
      ...constructionItems.map((i) => ({ pm: savedVisit.constructionStatuses?.[i], gc: refRep?.constructionStatuses?.[i] })),
      ...testingItems.map((i)      => ({ pm: savedVisit.testingStatuses?.[i],      gc: refRep?.testingStatuses?.[i] })),
      ...handoverItems.map((i)     => ({ pm: savedVisit.handoverStatuses?.[i],     gc: refRep?.handoverStatuses?.[i] })),
    ].filter((r) => r.pm || r.gc);

    const matches      = allItems.filter((r) => comparisonResult(r.pm, r.gc)?.type === "match").length;
    const discrepancies = allItems.filter((r) => comparisonResult(r.pm, r.gc)?.type === "discrepancy").length;
    const pmHigher     = allItems.filter((r) => comparisonResult(r.pm, r.gc)?.type === "pm-higher").length;

    const gcRefPhases = refRep
      ? (Array.isArray(refRep.currentPhases) ? refRep.currentPhases : (refRep.currentPhase ? [refRep.currentPhase] : []))
      : [];

    return (
      <div style={{ minHeight: "100vh", background: "#f0f7fa", padding: "36px 20px 80px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

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
                { label: "Items Assessed",  value: allItems.length,  color: ACCENT,    bg: "#e0f2fe" },
                { label: "Matches",          value: matches,          color: "#166534", bg: "#dcfce7" },
                { label: "Discrepancies",    value: discrepancies,    color: discrepancies > 0 ? "#991b1b" : "#166534", bg: discrepancies > 0 ? "#fee2e2" : "#dcfce7" },
                { label: "PM Ahead",         value: pmHigher,         color: "#92400e", bg: "#fef3c7" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ textAlign: "center", background: bg, borderRadius: 10, padding: "14px 8px" }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparison detail */}
          <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "22px 24px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginBottom: 4 }}>Comparison Results</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18 }}>
              {refRep
                ? <>Reference: <strong style={{ color: "#374151" }}>GC Report {refRep.reportingDate || new Date(refRep.submittedAt).toLocaleDateString("en-GB")}</strong>{gcRefPhases.length > 0 && <> · Phases: <strong style={{ color: "#374151" }}>{gcRefPhases.join(", ")}</strong></>}</>
                : "No reference GC report selected — standalone site visit."
              }
            </div>

            <ComparisonSection title="Demolition Works" accentColor="#8b5cf6"
              demolition pmStatuses={savedVisit.demolitionStatus} gcStatuses={refRep?.demolitionStatus} />
            <ComparisonSection title="Construction Works" accentColor="#0891b2"
              items={constructionItems} pmStatuses={savedVisit.constructionStatuses} gcStatuses={refRep?.constructionStatuses} />
            <ComparisonSection title="Testing & Commissioning" accentColor="#f59e0b"
              items={testingItems} pmStatuses={savedVisit.testingStatuses} gcStatuses={refRep?.testingStatuses} />
            <ComparisonSection title="Handover" accentColor="#22c55e"
              items={handoverItems} pmStatuses={savedVisit.handoverStatuses} gcStatuses={refRep?.handoverStatuses} />

            {/* PM Assessment vs GC */}
            {(savedVisit.pmScheduleAssessment || refRep?.projectScheduleStatus) && (
              <div style={{ marginTop: 4, padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
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
                      <div style={{ fontSize: 10, color: "#0891b2", fontWeight: 700, marginBottom: 4 }}>PM Assessment</div>
                      <StatusPill status={savedVisit.pmScheduleAssessment} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* PM Observations */}
          {savedVisit.observations && (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", padding: "20px 22px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>PM Observations</div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, whiteSpace: "pre-wrap", background: "#f8fafc", borderRadius: 8, padding: "12px 16px" }}>{savedVisit.observations}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={() => {
              const ref = projectReports[0] || null;
              setForm({ visitDate: new Date().toISOString().split("T")[0], referenceReportId: ref?.id ? String(ref.id) : "", ...gcPrefill(ref), pmScheduleAssessment: "", observations: "", photos: [], declarationConfirmed: false });
              setSavedVisit(null); setErrors([]); setSubmitted(false);
            }}
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

  // ── FORM VIEW ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7fa", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>

        {/* Header card */}
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e5e7eb", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: ACCENT, marginBottom: 6 }}>PM Site Visit Report</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{project.storeCode}</div>
              <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                {project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}
              </div>
            </div>
            {project.projectManager && (
              <div style={{ background: "#e0f2fe", border: "1px solid #7dd3fc", borderRadius: 12, padding: "10px 18px", textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT, marginBottom: 4 }}>Project Manager</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{project.projectManager}</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            {project.generalContractor && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>General Contractor</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.generalContractor}</div>
            </div>}
            {project.constructionStartDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Construction Start</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionStartDate}</div>
            </div>}
            {project.constructionEndDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Construction End</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionEndDate}</div>
            </div>}
            {project.targetOpeningDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Target Opening</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.targetOpeningDate}</div>
            </div>}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>GC Reports</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{projectReports.length} submitted</div>
            </div>
          </div>
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8, fontSize: 13 }}>Please fix the following required fields:</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#b91c1c", fontSize: 13, lineHeight: 1.8 }}>
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* 1. Visit Info */}
        <FormSection title="Visit Information" accentColor={ACCENT}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Visit Date</div>
              <input type="date" value={form.visitDate} onChange={(e) => set("visitDate", e.target.value)}
                style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, color: "#1f2937", background: "white", outline: "none", width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Compare Against GC Report</div>
              {projectReports.length === 0 ? (
                <div style={{ fontSize: 13, color: "#d97706", fontWeight: 600, padding: "10px 14px", background: "#fef9c3", borderRadius: 10, border: "1px solid #fde68a" }}>
                  No contractor reports submitted yet
                </div>
              ) : (
                <select value={form.referenceReportId} onChange={(e) => {
                    const newId = e.target.value;
                    const ref = projectReports.find(r => String(r.id) === newId);
                    setForm(prev => ({ ...prev, referenceReportId: newId, ...gcPrefill(ref || null) }));
                  }}
                  style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 13, color: "#1f2937", background: "white", outline: "none", width: "100%", cursor: "pointer" }}>
                  <option value="">— No comparison —</option>
                  {projectReports.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.reportingDate || new Date(r.submittedAt).toLocaleDateString("en-GB")} — {r.contractor || "GC"}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {referenceReport && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: "#e0f2fe", borderRadius: 10, border: "1px solid #7dd3fc", fontSize: 12, color: "#0c4a6e" }}>
              Comparing against <strong>{referenceReport.reportingDate || new Date(referenceReport.submittedAt).toLocaleDateString("en-GB")}</strong>
              {" · "}Phase: <strong>{Array.isArray(referenceReport.currentPhases) ? referenceReport.currentPhases.join(", ") : referenceReport.currentPhase || "—"}</strong>
              {" · "}Schedule: <strong>{referenceReport.projectScheduleStatus || "—"}</strong>
            </div>
          )}
        </FormSection>

        {/* 2. Demolition */}
        <FormSection title="Demolition Works" accentColor="#8b5cf6" note="Record actual site observation. GC-reported status shown as reference below each item.">
          <StatusSelector
            label="Demolition works"
            value={form.demolitionStatus}
            onChange={(v) => set("demolitionStatus", v)}
            gcStatus={referenceReport?.demolitionStatus}
          />
        </FormSection>

        {/* 3. Construction Works */}
        <FormSection title="Construction Works" accentColor="#0891b2" note="Observe and record the actual status of each work package. GC-reported status is shown as reference.">
          {constructionItems.map((item) => (
            <StatusSelector key={item} label={item}
              value={form.constructionStatuses[item] || ""}
              onChange={(v) => setNested("constructionStatuses", item, v)}
              gcStatus={referenceReport?.constructionStatuses?.[item]}
            />
          ))}
        </FormSection>

        {/* 4. Testing & Commissioning */}
        <FormSection title="Testing & Commissioning" accentColor="#f59e0b" note="Verify commissioning progress on site.">
          {testingItems.map((item) => (
            <StatusSelector key={item} label={item}
              value={form.testingStatuses[item] || ""}
              onChange={(v) => setNested("testingStatuses", item, v)}
              gcStatus={referenceReport?.testingStatuses?.[item]}
            />
          ))}
        </FormSection>

        {/* 5. Handover */}
        <FormSection title="Handover" accentColor="#22c55e" note="Check handover readiness items on site.">
          {handoverItems.map((item) => (
            <StatusSelector key={item} label={item}
              value={form.handoverStatuses[item] || ""}
              onChange={(v) => setNested("handoverStatuses", item, v)}
              gcStatus={referenceReport?.handoverStatuses?.[item]}
            />
          ))}
        </FormSection>

        {/* 6. PM Assessment */}
        <FormSection title="PM Assessment" accentColor="#475569">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Schedule Assessment (PM view)</div>
            {referenceReport?.projectScheduleStatus && (
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>GC reported: <strong>{referenceReport.projectScheduleStatus}</strong></div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "On Track", bg: "#dcfce7", color: "#166534", border: "#86efac" },
                { label: "At Risk",  bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
                { label: "Delayed",  bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
                { label: "Critical", bg: "#fff1f2", color: "#7f1d1d", border: "#f43f5e" },
              ].map(({ label, bg, color, border }) => {
                const sel = form.pmScheduleAssessment === label;
                return (
                  <button key={label} type="button" onClick={() => set("pmScheduleAssessment", label)} style={{
                    padding: "9px 24px", borderRadius: 10,
                    border: `2px solid ${sel ? border : "#e5e7eb"}`,
                    background: sel ? bg : "white",
                    color: sel ? color : "#9ca3af",
                    fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer", transition: "all 0.12s",
                  }}>{label}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Site Observations & Notes</div>
            <textarea value={form.observations} onChange={(e) => set("observations", e.target.value)}
              rows={4} placeholder="Record key observations, concerns, or positive findings from the site visit..."
              style={{ width: "100%", padding: "12px 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 13, color: "#374151", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6, background: "#fafafa", boxSizing: "border-box" }}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px rgba(8,145,178,0.1)`; }}
              onBlur={(e)  => { e.target.style.borderColor = "#d1d5db"; e.target.style.boxShadow = "none"; }}
            />
          </div>
        </FormSection>

        {/* 7. Photos */}
        <FormSection title="Site Photos" accentColor="#6b7280">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "2px dashed #d1d5db", cursor: "pointer", color: "#6b7280", fontSize: 13, fontWeight: 500, background: "#fafafa" }}>
            <span style={{ fontSize: 18 }}>📷</span>
            {form.photos.length > 0 ? `${form.photos.length} photo${form.photos.length > 1 ? "s" : ""} selected` : "Upload site photos"}
            <input type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => set("photos", Array.from(e.target.files))} />
          </label>
          {form.photos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {form.photos.map((p, i) => (
                <span key={i} style={{ padding: "3px 10px", borderRadius: 8, background: "#e0f2fe", border: "1px solid #7dd3fc", color: "#0c4a6e", fontSize: 12 }}>
                  {p?.name || `Photo ${i + 1}`}
                </span>
              ))}
            </div>
          )}
        </FormSection>

        {/* 8. Declaration */}
        <FormSection title="Declaration" accentColor="#475569">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <div
              onClick={() => set("declarationConfirmed", !form.declarationConfirmed)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${form.declarationConfirmed ? ACCENT : "#d1d5db"}`,
                background: form.declarationConfirmed ? ACCENT : "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {form.declarationConfirmed && <span style={{ color: "white", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, fontWeight: 500 }}>
              I confirm that the observations recorded reflect the actual site status as witnessed during this visit.
            </span>
          </label>
        </FormSection>

        {/* Submit */}
        <button type="button" onClick={submit}
          style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${ACCENT} 0%, #06b6d4 100%)`, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 14px rgba(8,145,178,0.35)" }}>
          Submit Site Visit Report
        </button>

      </div>
    </div>
  );
}

export default SiteVisitReport;
