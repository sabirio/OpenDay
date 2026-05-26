import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { WORK_PACKAGES, makeEmptyWPStatuses } from "../config/workPackages";

const riskOptions = [
  { label: "Resource Availability",          description: "Shortage of manpower, equipment, or site supervision within the next 2–3 weeks." },
  { label: "Material or Equipment Delivery", description: "Material not fully delivered, not ordered, or delivery dates are uncertain." },
  { label: "Regulatory Compliance",          description: "Permit, inspection, approval, or authority action may delay works." },
  { label: "Coordination",                   description: "Misalignment or delay from Landlord, Mall, Consultant, or subcontractors." },
  { label: "Safety or External Factors",     description: "Safety observations, incidents, bank holidays or restrictions." },
];

const riskOwners = ["Landlord", "General Contractor", "Consultant", "Authorities", "Client"];
const supportTypes = [
  { label: "Decision",    description: "Assistance in making critical project decisions affecting schedule, budget, or scope." },
  { label: "Design",      description: "Support for design clarifications, adjustments, or approvals." },
  { label: "Approval",    description: "Help obtaining approvals for materials, methods, or changes." },
  { label: "Authorities", description: "Support in dealing with local authorities for permits, inspections, or compliance." },
  { label: "Escalation",  description: "Escalate unresolved issues to higher management for quick resolution." },
];

// WP id → old phase name mapping for backward compat
const WP_TO_OLD_PHASE = {
  preconstruction: "Construction works",
  demolition: "Demolition works",
  construction: "Construction works",
  mep: "Construction works",
  finishes: "Construction works",
  equipment: "Construction works",
  commissioning: "Testing & Commissioning",
  handover: "Handover",
};

function deriveOldPhasesFromPackages(packages) {
  return [...new Set((packages || []).map((id) => WP_TO_OLD_PHASE[id]).filter(Boolean))];
}

function derivePackagesFromOldPhases(phases) {
  const map = {
    "Demolition works": ["demolition"],
    "Construction works": ["preconstruction", "construction", "mep", "finishes", "equipment"],
    "Testing & Commissioning": ["commissioning"],
    Handover: ["handover"],
  };
  const result = new Set();
  for (const p of phases || []) {
    for (const id of map[p] || []) result.add(id);
  }
  return [...result];
}

function calculateWeeksBetween(start, end) {
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24 * 7)));
}

function getConstructionWeekInfo(start, end, reference) {
  const totalWeeks = calculateWeeksBetween(start, end);
  if (reference < start) return { totalWeeks, weekNumber: 0, label: "Before construction start" };
  if (reference >= end) return { totalWeeks, weekNumber: totalWeeks, label: `Construction complete · ${totalWeeks} weeks` };
  const weekNumber = Math.min(Math.floor((reference - start) / (1000 * 60 * 60 * 24 * 7)) + 1, totalWeeks);
  return { totalWeeks, weekNumber, label: `Week ${weekNumber} of ${totalWeeks}` };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FormSection({ title, accentColor = "#2f855a", children }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid #f3f4f6", borderLeft: `4px solid ${accentColor}`, background: "#fafafa" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

const WP_STATUS_OPTS = [
  { value: "Not Started", label: "Not Started", bg: "#f3f4f6",  color: "#6b7280", border: "#d1d5db" },
  { value: "In Progress", label: "In Progress", bg: "#fef3c7",  color: "#d97706", border: "#fde68a" },
  { value: "Delayed",     label: "Delayed",     bg: "#fce7f3",  color: "#be185d", border: "#fbcfe8" },
  { value: "Completed",   label: "Completed",   bg: "#dcfce7",  color: "#16a34a", border: "#86efac" },
];

function WPTaskRow({ taskName, entry, onChange }) {
  const e = entry || { status: "Not Started" };

  return (
    <div style={{ borderBottom: "1px solid #f9fafb", padding: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 160px", fontSize: 13, color: "#374151", lineHeight: 1.35 }}>{taskName}</span>

        {/* Status buttons */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {WP_STATUS_OPTS.map((opt) => {
            const sel = e.status === opt.value;
            return (
              <button key={opt.value} type="button"
                onClick={() => onChange({ ...e, status: opt.value })}
                style={{
                  padding: "3px 8px", borderRadius: 6, fontSize: 11,
                  border: `1px solid ${sel ? opt.border : "#e5e7eb"}`,
                  background: sel ? opt.bg : "white",
                  color: sel ? opt.color : "#9ca3af",
                  fontWeight: sel ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  "Not Started": { color: "#6b7280", bg: "#f3f4f6" },
  "In Progress":  { color: "#d97706", bg: "#fef3c7" },
  "Delayed":      { color: "#be185d", bg: "#fce7f3" },
  "Completed":    { color: "#16a34a", bg: "#dcfce7" },
};

// Read-only summary of the last submitted report shown above the form
function LastReportSummary({ prevReport }) {
  const [open, setOpen] = useState(true);
  if (!prevReport) return null;

  const date = prevReport.reportingDate ||
    new Date(prevReport.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const activeWPs = (prevReport.currentPackages || [])
    .map((id) => WORK_PACKAGES.find((wp) => wp.id === id))
    .filter(Boolean);

  // Old-format fallback: build a minimal display from legacy fields
  const hasWPStatuses = !!prevReport.workPackageStatuses;

  return (
    <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "13px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#0369a1" }}>Last Submitted Report</span>
          <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: "#0369a1", color: "white" }}>{date}</span>
          {prevReport.projectScheduleStatus && (
            <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>
              {prevReport.projectScheduleStatus}
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: "#7dd3fc" }}>{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 16px", borderTop: "1px solid #bae6fd" }}>
          {activeWPs.length === 0 && (
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 12 }}>No work packages recorded in this report.</div>
          )}

          {activeWPs.map((wp) => {
            const pkgStatuses = hasWPStatuses
              ? (prevReport.workPackageStatuses?.[wp.id] || {})
              : {};
            const tasks = wp.tasks.map((t) => ({
              name: t.name,
              status: pkgStatuses[t.name]?.status || "Not Started",
            }));
            const nonDefault = tasks.filter((t) => t.status !== "Not Started");

            return (
              <div key={wp.id} style={{ marginTop: 14 }}>
                {/* WP header */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: wp.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f" }}>{wp.name}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {nonDefault.length}/{tasks.length} reported
                  </span>
                </div>

                {/* Task grid — only show tasks that have a status set, or all if all are Not Started */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 3 }}>
                  {(nonDefault.length > 0 ? nonDefault : tasks).map(({ name, status }) => {
                    const st = STATUS_STYLE[status] || STATUS_STYLE["Not Started"];
                    return (
                      <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderRadius: 7, background: "white", border: "1px solid #e0f2fe" }}>
                        <span style={{ fontSize: 11, color: "#374151", flex: 1, paddingRight: 8, lineHeight: 1.3 }}>{name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: st.bg, color: st.color, whiteSpace: "nowrap", flexShrink: 0 }}>{status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WPSection({ wp, pkgStatuses, onChange }) {
  function handleTask(taskName, entry) {
    onChange({ ...pkgStatuses, [taskName]: entry });
  }
  return (
    <FormSection title={wp.name} accentColor={wp.color}>
      {wp.tasks.map((task) => (
        <WPTaskRow
          key={task.name}
          taskName={task.name}
          entry={pkgStatuses?.[task.name]}
          onChange={(entry) => handleTask(task.name, entry)}
        />
      ))}
    </FormSection>
  );
}

function ToggleGroup({ label, options, value, onChange, colorMap }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const sel = value === opt;
          const c = colorMap?.[opt] || {};
          return (
            <button key={opt} type="button" onClick={() => onChange(opt)} style={{
              padding: "9px 24px", borderRadius: 10,
              border: `2px solid ${sel ? (c.border || "#2f855a") : "#e5e7eb"}`,
              background: sel ? (c.bg || "#dcfce7") : "white",
              color: sel ? (c.color || "#166534") : "#9ca3af",
              fontSize: 14, fontWeight: sel ? 700 : 400, cursor: "pointer", transition: "all 0.12s",
            }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipGroup({ label, options, values, onToggle, activeBg = "#dcfce7", activeColor = "#166534", activeBorder = "#86efac" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const sel = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
              padding: "7px 14px", borderRadius: 20,
              border: `1px solid ${sel ? activeBorder : "#d1d5db"}`,
              background: sel ? activeBg : "white",
              color: sel ? activeColor : "#6b7280",
              fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer", transition: "all 0.1s",
            }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextAreaField({ label, value, onChange, rows = 4, placeholder = "" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>{label}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 14px",
          border: "1px solid #d1d5db", borderRadius: 10,
          fontSize: 13, color: "#374151", resize: "vertical",
          outline: "none", fontFamily: "inherit", lineHeight: 1.6,
          background: "#fafafa", boxSizing: "border-box",
        }}
        onFocus={(e) => { e.target.style.borderColor = "#2f855a"; e.target.style.boxShadow = "0 0 0 3px rgba(47,133,90,0.1)"; }}
        onBlur={(e) => { e.target.style.borderColor = "#d1d5db"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}

// ── Form initialization ────────────────────────────────────────────────────

// Build cumulative best WP statuses across all project reports
const _WP_SCORES = { 'Not Started': 0, 'In Progress': 0.5, 'Delayed': 0.3, 'Completed': 1 };
function buildCumulativeWPStatuses(allReports) {
  const base = makeEmptyWPStatuses();
  for (const report of allReports) {
    const snap = report.workPackageStatuses;
    if (!snap) continue;
    for (const wp of WORK_PACKAGES) {
      const pkgSnap = snap[wp.id] || {};
      for (const task of wp.tasks) {
        const s = pkgSnap[task.name];
        if (!s) continue;
        const cur = base[wp.id][task.name];
        if ((_WP_SCORES[s.status] ?? -1) > (_WP_SCORES[cur.status] ?? -1) ||
            (s.progress || 0) > (cur.progress || 0)) {
          base[wp.id][task.name] = { ...cur, ...s };
        }
      }
    }
  }
  return base;
}

function makeInitialForm(prevReport, cumulativeStatuses) {
  // Start from cumulative best statuses across all reports (not just the latest)
  const wpStatuses = cumulativeStatuses
    ? JSON.parse(JSON.stringify(cumulativeStatuses))
    : makeEmptyWPStatuses();

  let currentPackages = [];

  if (prevReport?.workPackageStatuses) {
    currentPackages = prevReport.currentPackages || derivePackagesFromOldPhases(prevReport.currentPhases);
  } else if (prevReport) {
    // Old format: derive active packages from old phases
    currentPackages = derivePackagesFromOldPhases(
      Array.isArray(prevReport.currentPhases) ? prevReport.currentPhases : (prevReport.currentPhase ? [prevReport.currentPhase] : [])
    );
  }

  // Auto-select first work package if nothing is selected
  if (!currentPackages.length) {
    currentPackages = [WORK_PACKAGES[0].id];
  }

  return {
    reportingDate: "",
    currentPackages,
    workPackageStatuses: wpStatuses,
    projectScheduleStatus: prevReport?.projectScheduleStatus || "On Track",
    risks: [],
    riskOwners: [],
    riskScale: "",
    riskDescription: "",
    supportRequired: "No",
    supportTypes: [],
    supportDescription: "",
    additionalWorks: "No",
    additionalWorksParty: "",
    additionalWorksDescription: "",
    additionalWorksCost: "",
    nextWeekTop3: "",
    weekAfterTop3: "",
    activitiesBlocked: "No",
    delayReason: "",
    pendingIssues: "",
    finalComments: "",
    photos: [],
    declarationConfirmed: false,
  };
}

// ── Main component ─────────────────────────────────────────────────────────

function ContractorReport({ projects, reports, onSaveReport }) {
  const { projectId } = useParams();
  const project = projects.find((p) => String(p.id) === projectId);

  const projectReportsForPrefill = useMemo(() =>
    reports.filter((r) => String(r.projectId) === projectId),
    [reports, projectId]
  );

  const prevReport = useMemo(() =>
    [...projectReportsForPrefill]
      .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt))[0] || null,
    [projectReportsForPrefill]
  );

  const cumulativeWPStatuses = useMemo(() =>
    buildCumulativeWPStatuses(projectReportsForPrefill),
    [projectReportsForPrefill]
  );

  const [form, setForm] = useState(() => makeInitialForm(null, null));
  const prefillDone = useRef(false);

  useEffect(() => {
    // Wait for reports to load before prefilling (prevReport is null until Supabase responds)
    if (prevReport && !prefillDone.current) {
      prefillDone.current = true;
      setForm(makeInitialForm(prevReport, cumulativeWPStatuses));
    }
  }, [prevReport, cumulativeWPStatuses]);

  const [validationErrors, setValidationErrors] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function togglePackage(wpId) {
    setForm((prev) => {
      const cur = prev.currentPackages || [];
      const next = cur.includes(wpId) ? cur.filter((id) => id !== wpId) : [...cur, wpId];
      return { ...prev, currentPackages: next };
    });
  }

  function updateWPStatuses(wpId, pkgStatuses) {
    setForm((prev) => ({
      ...prev,
      workPackageStatuses: { ...prev.workPackageStatuses, [wpId]: pkgStatuses },
    }));
  }

  function toggleCheckbox(fieldName, value) {
    setForm((prev) => {
      const cur = prev[fieldName];
      return { ...prev, [fieldName]: cur.includes(value) ? cur.filter((i) => i !== value) : [...cur, value] };
    });
  }

  function validateReport() {
    const errors = [];
    if (!form.reportingDate) errors.push("Reporting date is required.");
    if (!(form.currentPackages || []).length) errors.push("Select at least one active work package.");
    if (
      form.projectScheduleStatus === "At Risk" ||
      form.projectScheduleStatus === "Delayed" ||
      form.projectScheduleStatus === "Critical"
    ) {
      if (!form.risks.length) errors.push("Select at least one risk indication.");
      if (!form.riskOwners.length) errors.push("Select at least one risk owner.");
      if (!form.riskScale) errors.push("Risk scale is required.");
      if (!form.riskDescription) errors.push("Risk description is required.");
    }
    if (!form.supportRequired) errors.push("Customer support selection is required.");
    if (form.supportRequired === "Yes") {
      if (!form.supportTypes.length) errors.push("Select at least one support type.");
      if (!form.supportDescription) errors.push("Support description is required.");
    }
    if (!form.nextWeekTop3) errors.push("Next week top 3 activities are required.");
    if (!form.weekAfterTop3) errors.push("Week +2 top 3 activities are required.");
    if (!form.activitiesBlocked) errors.push("Activities blocked answer is required.");
    if (form.activitiesBlocked === "Yes" && !form.delayReason)
      errors.push("Delay reason is required when activities are blocked.");
    if (!form.pendingIssues) errors.push("Pending issues summary is required.");
    if (!form.finalComments) errors.push("Final comments are required.");
    if (!form.photos.length) errors.push("At least one photo is required.");
    if (!form.declarationConfirmed) errors.push("Declaration confirmation is required.");
    return errors;
  }

  async function saveReport() {
    if (!project) return;
    const errors = validateReport();
    if (errors.length) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setValidationErrors([]);
    try {
      await onSaveReport({
        projectId: project.id,
        storeCode: project.storeCode,
        projectName: project.shoppingMallName,
        contractor: project.generalContractor,
        submittedAt: new Date().toISOString(),
        ...form,
        currentPhases: deriveOldPhasesFromPackages(form.currentPackages),
        photos: form.photos.map((p) => (p?.name ? p.name : p)),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Failed to submit report. Please try again.");
    }
  }

  if (!project) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗</div>
          <h2 style={{ color: "#111827", marginBottom: 8 }}>Project not found</h2>
          <p style={{ color: "#6b7280" }}>This report link is invalid or the project has been removed.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#dcfce7", border: "2px solid #86efac", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>✓</div>
          <h2 style={{ color: "#166534", marginBottom: 8, fontSize: 24 }}>Report submitted</h2>
          <p style={{ color: "#6b7280", marginBottom: 28, lineHeight: 1.6 }}>
            Thank you. Your weekly report for <strong>{project.storeCode} — {project.shoppingMallName}</strong> has been submitted successfully.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                prefillDone.current = false;
                setForm(makeInitialForm(prevReport, cumulativeWPStatuses));
                setSubmitted(false);
              }}
              style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "#2f855a", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Submit another report
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              style={{ padding: "12px 28px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const startDate = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const endDate = project.constructionEndDate ? new Date(project.constructionEndDate) : null;
  const refDate = form.reportingDate ? new Date(form.reportingDate) : new Date();
  const weekInfo = startDate && endDate ? getConstructionWeekInfo(startDate, endDate, refDate) : null;
  const weekPct = weekInfo && weekInfo.totalWeeks > 0 ? Math.round((weekInfo.weekNumber / weekInfo.totalWeeks) * 100) : 0;

  const projectReports = reports.filter((r) => r.projectId === project.id);
  const lastReport = [...projectReports].sort(
    (a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt)
  )[0] || null;
  const lastReportDate = lastReport ? new Date(lastReport.reportingDate || lastReport.submittedAt) : null;
  const daysSinceLast = lastReportDate ? Math.floor((new Date() - lastReportDate) / 86400000) : null;

  const activePackages = (form.currentPackages || []).map((id) => WORK_PACKAGES.find((wp) => wp.id === id)).filter(Boolean);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f7f2", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* ── Header card ── */}
        <div style={{ background: "white", borderRadius: 16, border: "1px solid #e5e7eb", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#2f855a", marginBottom: 6 }}>Weekly Construction Report</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>{project.storeCode}</div>
              <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                {project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}
              </div>
            </div>
            {project.generalContractor && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 18px", textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#2f855a", marginBottom: 4 }}>General Contractor</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{project.generalContractor}</div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
            {project.projectManager && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Client PM</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.projectManager}</div>
              </div>
            )}
            {project.constructionStartDate && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Start</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionStartDate}</div>
              </div>
            )}
            {project.constructionEndDate && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>End</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{project.constructionEndDate}</div>
              </div>
            )}
            {weekInfo && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 3 }}>Duration</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937" }}>{weekInfo.totalWeeks} weeks</div>
              </div>
            )}
          </div>

          {weekInfo && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>{weekInfo.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2f855a" }}>{weekPct}%</span>
              </div>
              <div style={{ background: "#e7f4e8", borderRadius: 6, height: 6, overflow: "hidden" }}>
                <div style={{ width: `${weekPct}%`, height: "100%", background: "linear-gradient(90deg, #2f855a, #4ade80)", borderRadius: 6 }} />
              </div>
            </div>
          )}

          <div style={{
            marginTop: 16, paddingTop: 14, borderTop: "1px solid #f3f4f6",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: lastReport ? (daysSinceLast > 14 ? "#f59e0b" : "#22c55e") : "#d1d5db",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: "#6b7280" }}>Last submitted report:</span>
              {lastReport ? (
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {new Date(lastReport.reportingDate || lastReport.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>No reports yet</span>
              )}
              {daysSinceLast !== null && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                  background: daysSinceLast > 14 ? "#fef3c7" : "#f0fdf4",
                  color: daysSinceLast > 14 ? "#92400e" : "#166534",
                  border: `1px solid ${daysSinceLast > 14 ? "#fde68a" : "#bbf7d0"}`,
                }}>
                  {daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              {projectReports.length} report{projectReports.length !== 1 ? "s" : ""} submitted total
            </span>
          </div>
        </div>

        {/* ── Last report summary (read-only reference for the contractor) ── */}
        <LastReportSummary prevReport={prevReport} />

        {/* ── Validation errors ── */}
        {validationErrors.length > 0 && (
          <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8, fontSize: 13 }}>Please fix the following required fields:</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#b91c1c", fontSize: 13, lineHeight: 1.8 }}>
              {validationErrors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* ── 1. Reporting Date & Work Package Selection ── */}
        <FormSection title="Reporting Date & Active Work Packages" accentColor="#2f855a">
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Reporting Date</div>
            <input
              type="date"
              value={form.reportingDate}
              onChange={(e) => updateField("reportingDate", e.target.value)}
              style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, color: "#1f2937", background: "white", outline: "none", width: 200 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Active Work Packages This Week</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>Select all work packages with active works this reporting period.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {WORK_PACKAGES.map((wp) => {
                const sel = (form.currentPackages || []).includes(wp.id);
                return (
                  <button key={wp.id} type="button"
                    onClick={() => togglePackage(wp.id)}
                    style={{
                      padding: "12px 14px", borderRadius: 12, textAlign: "left",
                      border: `2px solid ${sel ? wp.color : "#e5e7eb"}`,
                      background: sel ? wp.color + "14" : "white",
                      color: sel ? wp.color : "#9ca3af",
                      fontWeight: sel ? 700 : 500, fontSize: 13,
                      cursor: "pointer", transition: "all 0.15s", lineHeight: 1.3,
                    }}>
                    {sel && <span style={{ marginRight: 6, fontSize: 11 }}>✓</span>}
                    {wp.name}
                  </button>
                );
              })}
            </div>
          </div>
        </FormSection>

        {/* ── 2. Work Package Status Sections (dynamic) ── */}
        {activePackages.map((wp) => (
          <WPSection
            key={wp.id}
            wp={wp}
            pkgStatuses={form.workPackageStatuses?.[wp.id] || {}}
            onChange={(pkgStatuses) => updateWPStatuses(wp.id, pkgStatuses)}
          />
        ))}

        {/* ── 3. Schedule Status ── */}
        <FormSection title="Project Schedule Status" accentColor="#475569">
          <ToggleGroup
            label="Is the project on track vs the agreed schedule?"
            options={["On Track", "At Risk", "Delayed", "Critical"]}
            value={form.projectScheduleStatus}
            onChange={(v) => updateField("projectScheduleStatus", v)}
            colorMap={{
              "On Track": { bg: "#dcfce7", color: "#166534", border: "#86efac" },
              "At Risk":  { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
              "Delayed":  { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
              "Critical": { bg: "#fff1f2", color: "#7f1d1d", border: "#f43f5e" },
            }}
          />
        </FormSection>

        {/* ── 4. Risks ── */}
        {(form.projectScheduleStatus === "At Risk" || form.projectScheduleStatus === "Delayed" || form.projectScheduleStatus === "Critical") && (
          <FormSection title="Risk Details" accentColor="#dc2626">
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>Main Risk Indication</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {riskOptions.map(({ label, description }) => {
                  const active = (form.risks || []).includes(label);
                  return (
                    <label key={label} onClick={() => toggleCheckbox("risks", label)} style={{
                      display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
                      borderRadius: 10, cursor: "pointer", background: active ? "#fff1f2" : "transparent",
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        border: `2px solid ${active ? "#dc2626" : "#d1d5db"}`,
                        background: active ? "#dc2626" : "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white" }} />}
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{label}</span>
                        <span style={{ fontSize: 13, color: "#6b7280" }}> — {description}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <ChipGroup label="Risk Owner" options={riskOwners} values={form.riskOwners}
              onToggle={(v) => toggleCheckbox("riskOwners", v)}
              activeBg="#fef3c7" activeColor="#92400e" activeBorder="#fde68a" />
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>Risk Scale</div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { label: "Low", bg: "#dcfce7", color: "#166534", border: "#86efac" },
                  { label: "Medium", bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
                  { label: "High", bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
                ].map(({ label, bg, color, border }) => {
                  const sel = form.riskScale === label;
                  return (
                    <button key={label} type="button" onClick={() => updateField("riskScale", label)} style={{
                      padding: "9px 24px", borderRadius: 10,
                      border: `2px solid ${sel ? border : "#e5e7eb"}`,
                      background: sel ? bg : "white",
                      color: sel ? color : "#9ca3af",
                      fontSize: 14, fontWeight: sel ? 700 : 400, cursor: "pointer",
                    }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <TextAreaField label="Short Description" value={form.riskDescription} onChange={(v) => updateField("riskDescription", v)} placeholder="Describe the risk and planned mitigation..." rows={3} />
          </FormSection>
        )}

        {/* ── 5. Client Support ── */}
        <FormSection title="Client Support Required" accentColor="#2563eb">
          <ToggleGroup
            label="Is any support required from the Client Project Manager?"
            options={["No", "Yes"]}
            value={form.supportRequired}
            onChange={(v) => updateField("supportRequired", v)}
            colorMap={{
              "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
              "Yes": { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
            }}
          />
          {form.supportRequired === "Yes" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>Support Type</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {supportTypes.map(({ label, description }) => {
                    const active = (form.supportTypes || []).includes(label);
                    return (
                      <label key={label} onClick={() => toggleCheckbox("supportTypes", label)} style={{
                        display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
                        borderRadius: 10, cursor: "pointer", background: active ? "#eff6ff" : "transparent",
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                          border: `2px solid ${active ? "#2563eb" : "#d1d5db"}`,
                          background: active ? "#2563eb" : "white",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white" }} />}
                        </div>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{label}</span>
                          <span style={{ fontSize: 13, color: "#6b7280" }}> — {description}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <TextAreaField label="Support Description" value={form.supportDescription} onChange={(v) => updateField("supportDescription", v)} placeholder="What support is needed and why..." rows={3} />
            </>
          )}
        </FormSection>

        {/* ── 6. Additional Works ── */}
        <FormSection title="Additional Works" accentColor="#ea580c">
          <ToggleGroup
            label="Are there any additional works with potential cost impact?"
            options={["No", "Yes"]}
            value={form.additionalWorks}
            onChange={(v) => updateField("additionalWorks", v)}
            colorMap={{
              "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
              "Yes": { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
            }}
          />
          {form.additionalWorks === "Yes" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Main Reason for Additional Works</div>
                <select
                  value={form.additionalWorksParty}
                  onChange={(e) => updateField("additionalWorksParty", e.target.value)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 13, background: "white", width: "100%", maxWidth: 320, cursor: "pointer", outline: "none" }}
                >
                  <option value="">— Select —</option>
                  <option>Drawings Issues</option>
                  <option>Design Changes</option>
                  <option>Client Request</option>
                  <option>Site Condition Issue</option>
                </select>
              </div>
              <TextAreaField label="Description" value={form.additionalWorksDescription} onChange={(v) => updateField("additionalWorksDescription", v)} placeholder="Explain the project change, reason, and affected scope..." rows={4} />
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Estimated Additional Cost</div>
                <input
                  type="text"
                  value={form.additionalWorksCost}
                  onChange={(e) => updateField("additionalWorksCost", e.target.value)}
                  placeholder="e.g. 1 000 EUR"
                  style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 13, background: "white", outline: "none" }}
                />
              </div>
            </>
          )}
        </FormSection>

        {/* ── 7. Look Ahead ── */}
        <FormSection title="Look Ahead" accentColor="#0891b2">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <TextAreaField label="Top 3 Activities — Next Week" value={form.nextWeekTop3} onChange={(v) => updateField("nextWeekTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
            <TextAreaField label="Top 3 Activities — Week +2" value={form.weekAfterTop3} onChange={(v) => updateField("weekAfterTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
          </div>
          <ToggleGroup
            label="Any risks blocking the above activities?"
            options={["No", "Yes"]}
            value={form.activitiesBlocked}
            onChange={(v) => updateField("activitiesBlocked", v)}
            colorMap={{
              "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
              "Yes": { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
            }}
          />
          {form.activitiesBlocked === "Yes" && (
            <TextAreaField label="Delay Reason & Mitigation" value={form.delayReason} onChange={(v) => updateField("delayReason", v)} placeholder="Describe the reason and planned mitigation..." rows={3} />
          )}
        </FormSection>

        {/* ── 8. Declaration & Comments ── */}
        <FormSection title="Declaration & Comments" accentColor="#475569">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <TextAreaField label="Pending Issues Summary" value={form.pendingIssues} onChange={(v) => updateField("pendingIssues", v)} placeholder="List any open issues or pending actions..." rows={4} />
            <TextAreaField label="Final Comments" value={form.finalComments} onChange={(v) => updateField("finalComments", v)} placeholder="Any additional comments for this week..." rows={4} />
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>Site Photos</div>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 18px", borderRadius: 10,
              border: "2px dashed #d1d5db", cursor: "pointer",
              color: "#6b7280", fontSize: 13, fontWeight: 500, background: "#fafafa",
            }}>
              <span style={{ fontSize: 18 }}>📷</span>
              {form.photos.length > 0 ? `${form.photos.length} photo${form.photos.length > 1 ? "s" : ""} selected` : "Upload site photos"}
              <input type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => updateField("photos", Array.from(e.target.files))} />
            </label>
            {form.photos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {form.photos.map((p, i) => (
                  <span key={i} style={{ padding: "3px 10px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166634", fontSize: 12 }}>
                    {p?.name || `Photo ${i + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <div
              onClick={() => updateField("declarationConfirmed", !form.declarationConfirmed)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${form.declarationConfirmed ? "#2f855a" : "#d1d5db"}`,
                background: form.declarationConfirmed ? "#2f855a" : "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              {form.declarationConfirmed && <span style={{ color: "white", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, fontWeight: 500 }}>
              I confirm that the reported information reflects the actual site status and is accurate to the best of my knowledge.
            </span>
          </label>
        </FormSection>

        {/* ── Submit ── */}
        <button
          type="button"
          onClick={saveReport}
          style={{
            width: "100%", padding: "16px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, #2f855a 0%, #22c55e 100%)",
            color: "white", fontSize: 16, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.02em",
            boxShadow: "0 4px 14px rgba(47, 133, 90, 0.35)",
          }}
        >
          Submit Weekly Report
        </button>

      </div>
    </div>
  );
}

export default ContractorReport;
