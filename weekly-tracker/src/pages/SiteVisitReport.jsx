import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { WORK_PACKAGES, WP_STATUS_SCORES, makeEmptyPMWPStatuses } from "../config/workPackages";
import { getProjectGantt } from "../services/ganttService";
import { submitSiteVisit } from "../services/siteVisitService";
import { getLastReport as getLastContractorReport } from "../services/contractorReportService";

const ACCENT = "#0891b2";

// ── GC reference status helpers ───────────────────────────────────────────────

// Old-format field → WP task name best-effort mapping
const OLD_TO_WP = {
  "Flooring installation":                              { wpId: "finishes",       task: "Floor finishes" },
  "Drywall partition installation":                     { wpId: "construction",   task: "Partitions & drywall" },
  "Electrical systems installation":                    { wpId: "mep",            task: "Electrical conduits & cabling" },
  "HVAC systems installation":                          { wpId: "mep",            task: "HVAC ducts" },
  "Fire safety systems installation":                   { wpId: "mep",            task: "Fire suppression pipes" },
  "Low current systems installation":                   { wpId: "mep",            task: "Low current systems" },
  "Ceiling installation":                               { wpId: "construction",   task: "Ceiling structures" },
  "Lighting installation":                              { wpId: "finishes",       task: "Lighting fixtures" },
  "Furniture installation":                             { wpId: "equipment",      task: "Furniture & loose items" },
  "Sprinkler system testing and commissioning":         { wpId: "commissioning",  task: "Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":   { wpId: "commissioning",  task: "Fire alarm testing" },
  "Emergency announcement system testing and commissioning": { wpId: "commissioning", task: "Integrated systems testing" },
  "HVAC system testing and commissioning":              { wpId: "commissioning",  task: "HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":        { wpId: "commissioning",  task: "Electrical testing & certification" },
  "Low current testing and commissioning":              { wpId: "commissioning",  task: "Security & access control testing" },
  "Staff training":                                     { wpId: "handover",       task: "Staff training" },
  "Manuals, certificates, test reports":                { wpId: "handover",       task: "O&M manuals" },
  "Final cleaning":                                     { wpId: "handover",       task: "Final cleaning" },
  "Snag list resolution":                               { wpId: "handover",       task: "Defects & snagging resolution" },
};

// Convert old GC status string → new WP status string
function mapOldStatus(s) {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("completed") || lower.includes("ready")) return "Completed";
  if (lower.includes("in progress") || lower.includes("started")) return "In Progress";
  if (lower === "not applicable" || lower === "n/a") return null;
  return "Not Started";
}

/**
 * Get GC's reported status for a given WP task from either format.
 * Returns { status, progress } or null.
 */
function getGCTaskEntry(gcReport, wpId, taskName) {
  if (!gcReport) return null;

  // New format
  if (gcReport.workPackageStatuses?.[wpId]?.[taskName] != null) {
    const e = gcReport.workPackageStatuses[wpId][taskName];
    return { status: e.status, progress: e.progress ?? 0 };
  }

  // Old format — reverse-lookup by checking if this wpId+taskName matches an old item
  for (const [oldItem, mapping] of Object.entries(OLD_TO_WP)) {
    if (mapping.wpId === wpId && mapping.task === taskName) {
      let oldStatus = null;
      if (oldItem === "Demolition works") {
        oldStatus = gcReport.demolitionStatus;
      } else if (gcReport.constructionStatuses?.[oldItem] != null) {
        oldStatus = gcReport.constructionStatuses[oldItem];
      } else if (gcReport.testingStatuses?.[oldItem] != null) {
        oldStatus = gcReport.testingStatuses[oldItem];
      } else if (gcReport.handoverStatuses?.[oldItem] != null) {
        oldStatus = gcReport.handoverStatuses[oldItem];
      }
      const mapped = mapOldStatus(oldStatus);
      return mapped ? { status: mapped, progress: 0 } : null;
    }
  }

  return null;
}

// ── Status comparison ─────────────────────────────────────────────────────────

function comparisonResult(pmStatus, gcStatus) {
  if (!pmStatus && !gcStatus) return null;
  // Either side marked N/A — exclude from comparison metrics entirely
  if (pmStatus === "Not Applicable" || gcStatus === "Not Applicable") return null;
  if (!pmStatus) return { type: "not-assessed", badge: "Not assessed", color: "#94a3b8", bg: "white",    border: "#f3f4f6" };
  if (!gcStatus) return { type: "no-gc",        badge: "No GC data",   color: "#6b7280",  bg: "#f8fafc", border: "#e5e7eb" };
  const ps = WP_STATUS_SCORES[pmStatus] ?? 0;
  const gs = WP_STATUS_SCORES[gcStatus] ?? 0;
  if (ps === gs) return { type: "match",        badge: "✓ Match",       color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" };
  if (ps < gs)   return { type: "discrepancy",  badge: "⚠ Discrepancy", color: "#991b1b", bg: "#fff1f2", border: "#fca5a5" };
  return               { type: "pm-higher",    badge: "↑ PM ahead",    color: "#92400e", bg: "#fefce8", border: "#fde68a" };
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

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe", gcBg: "#faf8ff", gcColor: "#7c3aed", gcBorder: "#ede9fe" },
  { value: "Not Started",    label: "Not Started",    bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", gcBg: "#f9fafb", gcColor: "#9ca3af", gcBorder: "#e5e7eb" },
  { value: "In Progress",    label: "In Progress",    bg: "#fef3c7", color: "#d97706", border: "#fde68a", gcBg: "#fefce8", gcColor: "#d97706", gcBorder: "#fde68a" },
  { value: "Completed",      label: "Completed",      bg: "#dcfce7", color: "#16a34a", border: "#86efac", gcBg: "#f0fdf4", gcColor: "#16a34a", gcBorder: "#bbf7d0" },
];

function PMTaskRow({ wpId, taskName, entry, gcEntry, onChange }) {
  const e        = entry || { observedStatus: "" };
  const gcStatus = gcEntry?.status || null;

  return (
    <div data-testid="pm-task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid #f3f4f6", padding: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "#374151", lineHeight: 1.35, minWidth: 0 }}>
          {taskName}
        </span>

        {/* Status buttons — PM selection is bold/solid; GC reference is tinted with a "GC" chip */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {WP_STATUS_OPTS.map((opt) => {
            const isPM = e.observedStatus === opt.value;
            const isGC = gcStatus === opt.value && !isPM;
            return (
              <button key={opt.value} type="button"
                data-testid={`pm-status-btn-${opt.value}`}
                onClick={() => onChange({ ...e, observedStatus: opt.value })}
                style={{
                  position: "relative",
                  padding: "4px 9px", borderRadius: 6, fontSize: 11,
                  border: isPM ? `1.5px solid ${opt.border}` : isGC ? `1px solid ${opt.gcBorder}` : "1px solid #e5e7eb",
                  background: isPM ? opt.bg : isGC ? opt.gcBg : "white",
                  color: isPM ? opt.color : isGC ? opt.gcColor : "#9ca3af",
                  fontWeight: isPM ? 700 : 400,
                  cursor: "pointer", whiteSpace: "nowrap", outline: "none",
                }}>
                {opt.label}
                {isGC && (
                  <span style={{
                    position: "absolute", top: -6, right: -4,
                    fontSize: 8, fontWeight: 800, lineHeight: 1.2,
                    background: ACCENT, color: "white",
                    padding: "1px 3px", borderRadius: 3,
                    letterSpacing: "0.02em", pointerEvents: "none",
                  }}>GC</span>
                )}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

const STATUS_PILL_STYLE = {
  "Not Applicable": { bg: "#f5f3ff", color: "#7c3aed" },
  "Not Started":    { bg: "#f3f4f6", color: "#6b7280" },
  "In Progress":    { bg: "#fef3c7", color: "#d97706" },
  "Completed":      { bg: "#dcfce7", color: "#16a34a" },
  "Delayed":        { bg: "#fce7f3", color: "#be185d" }, // legacy display only
};

function StatusPill({ status }) {
  if (!status) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
  const style = STATUS_PILL_STYLE[status] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
      {status}
    </span>
  );
}

// ── Gantt-based PM observation row ────────────────────────────────────────

const GANTT_STATUS_OPTS_SV = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed'   },
  { value: 'delayed',     label: 'Delayed'     },
  { value: 'blocked',     label: 'Blocked'     },
];

function liveDiscrepancy(gcPct, pmPct) {
  const delta = Math.round(Math.abs((pmPct ?? 0) - (gcPct ?? 0)));
  if (delta < 10) return { label: `Δ ${delta}%`, color: '#16a34a', bg: '#f0fdf4' };
  if (delta < 25) return { label: `Δ ${delta}%`, color: '#d97706', bg: '#fffbeb' };
  return               { label: `Δ ${delta}%`, color: '#dc2626', bg: '#fef2f2' };
}

function GanttPMTaskRow({ task, pmEntry, onChange }) {
  const gcPct    = task.actual_progress ?? 0;
  const pmPct    = pmEntry?.observed_progress ?? gcPct;
  const pmStatus = pmEntry?.observed_status   ?? (task.status || 'not_started');
  const disc     = liveDiscrepancy(gcPct, pmPct);

  return (
    <div style={{ borderBottom: '1px solid #f3f4f6', padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{task.label}</span>
          {task.isCritical && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>CRITICAL</span>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: disc.bg, color: disc.color }}>
          {disc.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* GC column — read-only */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>GC Reported</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${gcPct}%`, height: '100%', background: gcPct >= 100 ? '#22c55e' : '#9ca3af', borderRadius: 4, transition: 'width 0.2s' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', minWidth: 36, textAlign: 'right' }}>{gcPct}%</span>
          </div>
        </div>

        {/* PM column — editable */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>PM Observed</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <input
              type="range" min="0" max="100" step="5"
              value={pmPct}
              onChange={e => onChange({ observed_progress: parseInt(e.target.value), observed_status: pmStatus })}
              style={{ flex: 1, cursor: 'pointer', accentColor: ACCENT }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: pmPct >= 100 ? '#166534' : ACCENT, minWidth: 36, textAlign: 'right' }}>{pmPct}%</span>
          </div>
          <select
            value={pmStatus}
            onChange={e => onChange({ observed_progress: pmPct, observed_status: e.target.value })}
            style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, background: 'white', cursor: 'pointer', outline: 'none' }}
          >
            {GANTT_STATUS_OPTS_SV.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
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
    pmWorkPackageStatuses: makeEmptyPMWPStatuses(),
    pmScheduleAssessment: "",
    observations: "",
    photos: [],
    declarationConfirmed: false,
  }));

  const [errors, setErrors]       = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [savedVisit, setSavedVisit] = useState(null);

  const [ganttTasks, setGanttTasks]           = useState([]);
  const [ganttLoading, setGanttLoading]       = useState(false);
  const [lastContractorReportId, setLastContractorReportId] = useState(null);
  const [pmWpObservations, setPmWpObservations] = useState({});

  useEffect(() => {
    if (!project?.id) return;
    setGanttLoading(true);
    getProjectGantt(project.id)
      .then(tasks => {
        setGanttTasks(tasks);
        // Pre-fill PM observations from current gantt progress
        const initial = {};
        for (const t of tasks) {
          initial[t.id] = { observed_progress: t.actual_progress ?? 0, observed_status: t.status ?? 'not_started', pm_note: '' };
        }
        setPmWpObservations(initial);
      })
      .catch(() => setGanttTasks([]))
      .finally(() => setGanttLoading(false));

    getLastContractorReport(project.id)
      .then(r => setLastContractorReportId(r?.id || null))
      .catch(() => {});
  }, [project?.id]);

  function updatePMObservation(wpId, updates) {
    setPmWpObservations(prev => ({ ...prev, [wpId]: { ...(prev[wpId] || {}), ...updates } }));
  }

  // Auto-select latest GC report once reports load from Supabase (async timing fix)
  useEffect(() => {
    if (latestReport?.id) {
      setForm((p) => ({
        ...p,
        referenceReportId: p.referenceReportId || String(latestReport.id),
      }));
    }
  }, [latestReport?.id]);

  const referenceReport = projectReports.find((r) => String(r.id) === String(form.referenceReportId));

  function set(name, value) { setForm((p) => ({ ...p, [name]: value })); }

  function updateWPTask(wpId, taskName, entry) {
    setForm((p) => ({
      ...p,
      pmWorkPackageStatuses: {
        ...p.pmWorkPackageStatuses,
        [wpId]: { ...p.pmWorkPackageStatuses[wpId], [taskName]: entry },
      },
    }));
  }

  // When reference report changes, keep PM statuses but update selection
  function handleReferenceChange(newId) {
    setForm((p) => ({ ...p, referenceReportId: newId }));
  }

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
    try {
      if (ganttTasks.length > 0) {
        const wpObservationsArray = Object.entries(pmWpObservations).map(([wpId, v]) => ({
          wpId,
          observed_progress: v.observed_progress ?? 0,
          observed_status:   v.observed_status   ?? 'not_started',
          pm_note:           v.pm_note           ?? '',
        }));
        const result = await submitSiteVisit(projectId, lastContractorReportId, wpObservationsArray, {
          visitDate:   form.visitDate,
          visitedBy:   project.projectManager || '',
          overallNote: form.observations || '',
        });
        setSavedVisit({ ...form, ...result.siteVisit, discrepancies: result.discrepancies, _ganttFormat: true });
      } else {
        const visitData = {
          projectId,
          referenceReportId: form.referenceReportId || null,
          ...form,
          photos: form.photos.map((p) => p?.name || p),
          submittedAt: new Date().toISOString(),
        };
        const saved = await onSaveSiteVisit(visitData);
        setSavedVisit(saved);
      }
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

  // ── GANTT FORMAT SUCCESS VIEW ──────────────────────────────────────────────

  if (submitted && savedVisit?._ganttFormat) {
    const discrepancies = savedVisit.discrepancies || [];
    const critCount     = discrepancies.filter(d => d.status === 'critical').length;
    const warnCount     = discrepancies.filter(d => d.status === 'warning').length;

    return (
      <div style={{ minHeight: '100vh', background: '#f0f7fa', padding: '36px 20px 80px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: '32px 28px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#e0f2fe', border: '2px solid #7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0c4a6e', marginBottom: 8 }}>Site Visit Recorded</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
              {project.storeCode} · {project.shoppingMallName} · {form.visitDate}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
              {[
                { label: 'WPs Assessed',   value: discrepancies.length, color: ACCENT,    bg: '#e0f2fe' },
                { label: 'Warnings',        value: warnCount,            color: '#d97706', bg: '#fef3c7' },
                { label: 'Critical Gaps',   value: critCount,            color: critCount > 0 ? '#991b1b' : '#166534', bg: critCount > 0 ? '#fee2e2' : '#dcfce7' },
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 8px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => { setSavedVisit(null); setSubmitted(false); }}
              style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${ACCENT}, #06b6d4)`, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginRight: 12 }}>
              New Visit
            </button>
            <button type="button" onClick={() => window.history.back()}
              style={{ padding: '12px 28px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', color: '#6b7280', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── COMPARISON RESULTS VIEW ────────────────────────────────────────────────

  if (submitted && savedVisit) {

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

          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" onClick={() => {
              setForm({ visitDate: new Date().toISOString().split("T")[0], referenceReportId: latestReport?.id ? String(latestReport.id) : "", pmWorkPackageStatuses: makeEmptyPMWPStatuses(), pmScheduleAssessment: "", observations: "", photos: [], declarationConfirmed: false });
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
    <div data-testid="pm-site-visit-form" style={{ minHeight: "100vh", background: "#f0f7fa", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

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
                <select value={form.referenceReportId} onChange={(e) => handleReferenceChange(e.target.value)}
                  style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 13, color: "#1f2937", background: "white", outline: "none", width: "100%", cursor: "pointer" }}>
                  <option value="">— No comparison —</option>
                  {projectReports.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.reportingDate || new Date(r.submittedAt).toLocaleDateString("en-GB")} — {r.contractor || "GC"}
                      {r.workPackageStatuses ? " (new format)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {referenceReport && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: "#e0f2fe", borderRadius: 10, border: "1px solid #7dd3fc", fontSize: 12, color: "#0c4a6e" }}>
              Comparing against <strong>{referenceReport.reportingDate || new Date(referenceReport.submittedAt).toLocaleDateString("en-GB")}</strong>
              {" · "}Schedule: <strong>{referenceReport.projectScheduleStatus || "—"}</strong>
              {referenceReport.workPackageStatuses
                ? <span style={{ marginLeft: 8, padding: "1px 6px", background: "#0891b2", color: "white", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>WP Format</span>
                : <span style={{ marginLeft: 8, padding: "1px 6px", background: "#9ca3af", color: "white", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Legacy Format</span>
              }
            </div>
          )}
        </FormSection>

        {/* 2. Work Package Observation Sections */}
        {ganttLoading ? (
          <FormSection title="Work Package Observations" accentColor={ACCENT}>
            <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: 13 }}>Loading schedule…</div>
          </FormSection>
        ) : ganttTasks.length > 0 ? (
          (() => {
            const byPhase = {};
            for (const task of ganttTasks) {
              const key = task.phaseLabel || task.phaseId || 'Other';
              if (!byPhase[key]) byPhase[key] = [];
              byPhase[key].push(task);
            }
            return Object.entries(byPhase).map(([phase, tasks]) => (
              <FormSection key={phase} title={phase} accentColor={ACCENT}>
                {tasks.map(task => (
                  <GanttPMTaskRow
                    key={task.id}
                    task={task}
                    pmEntry={pmWpObservations[task.id]}
                    onChange={updates => updatePMObservation(task.id, updates)}
                  />
                ))}
              </FormSection>
            ));
          })()
        ) : (
          WORK_PACKAGES.map((wp) => (
            <FormSection key={wp.id} title={wp.name} accentColor="#f97316">
              {wp.tasks.map((task) => (
                <PMTaskRow
                  key={task.name}
                  wpId={wp.id}
                  taskName={task.name}
                  entry={form.pmWorkPackageStatuses?.[wp.id]?.[task.name]}
                  gcEntry={getGCTaskEntry(referenceReport, wp.id, task.name)}
                  onChange={(entry) => updateWPTask(wp.id, task.name, entry)}
                />
              ))}
            </FormSection>
          ))
        )}

        {/* 3. PM Assessment */}
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
                { label: "Critical", bg: "#fff1f2", color: "#7f1d1d", border: "#f43f5e" },
              ].map(({ label, bg, color, border }) => {
                const sel = form.pmScheduleAssessment === label;
                return (
                  <button key={label} type="button"
                    data-testid={`pm-schedule-btn-${label}`}
                    onClick={() => set("pmScheduleAssessment", label)} style={{
                    padding: "9px 24px", borderRadius: 10,
                    border: `2px solid ${sel ? border : "#e5e7eb"}`,
                    background: sel ? bg : "white",
                    color: sel ? color : "#9ca3af",
                    fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer",
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

        {/* 4. Photos */}
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

        {/* 5. Declaration */}
        <FormSection title="Declaration" accentColor="#475569">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <div
              data-testid="pm-declaration-checkbox"
              onClick={() => set("declarationConfirmed", !form.declarationConfirmed)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${form.declarationConfirmed ? ACCENT : "#d1d5db"}`,
                background: form.declarationConfirmed ? ACCENT : "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
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
        <button type="button" data-testid="save-site-visit-report" onClick={submit}
          style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${ACCENT} 0%, #06b6d4 100%)`, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 14px rgba(8,145,178,0.35)" }}>
          Submit Site Visit Report
        </button>

      </div>
    </div>
  );
}

export default SiteVisitReport;
