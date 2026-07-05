// ARCHITECTURE NOTE — two report formats coexist in this component:
//
//  Gantt (new)  — workPackageStatuses: { phaseId → { taskLabel → { progress, status } } }
//                 Phase IDs and task labels come from masterTaskLibrary.js.
//                 Used when project has a Gantt plan (getProjectGantt returns tasks).
//
//  Legacy (old) — demolitionStatus / constructionStatuses / testingStatuses / handoverStatuses
//                 Task keys come from reportWeights.js / reportUtils.js.
//                 Used as fallback when no Gantt plan exists.
//
// Progress calculation for both formats lives in progressEngine.js.
// Do NOT add new progress logic here — extend progressEngine instead.

import { normalizeReport } from "../services/reportService";
import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { WORK_PACKAGES, makeEmptyWPStatuses, getWPGroups } from "../config/workPackages";
import { getProjectGantt } from "../services/ganttService";
import {
  getReportsForProjectForScreens,
  submitReport as submitContractorReport,
} from "../services/contractorReportService";
import { getById as getProjectById } from "../services/projectService";
import { computeWPCumulativeStatuses, computeCumulativeStatuses } from "../utils/reportUtils";
import { calculateProjectProgressResult } from "../engines/progressEngine";
import { useAuth } from "../auth/AuthContext";

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

function FormSection({ title, accentColor = "#2f855a", badge, children }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid #f3f4f6", borderLeft: `4px solid ${accentColor}`, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
        {badge}
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
  { value: "Not Started",    label: "Not Started",    bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db" },
  { value: "In Progress",    label: "In Progress",    bg: "#fef3c7", color: "#d97706", border: "#fde68a" },
  { value: "Completed",      label: "Completed",      bg: "#dcfce7", color: "#16a34a", border: "#86efac" },
];

const STATUS_SCORE = { "Not Applicable": null, "Not Started": 0, "In Progress": 0.5, "Completed": 1, "Delayed": 0.3 };

function WPTaskRow({ wpId, taskName, entry, prevEntry, onChange }) {
  const e          = entry || { status: "Not Started" };
  const prevStatus = prevEntry?.status ?? null;
  const curStatus  = e.status;
  const changed    = prevStatus !== null && prevStatus !== curStatus;
  const curScore   = STATUS_SCORE[curStatus]  ?? null;
  const prevScore  = STATUS_SCORE[prevStatus] ?? null;
  const improved   = changed && prevScore !== null && curScore !== null && curScore > prevScore;
  const regressed  = changed && prevScore !== null && curScore !== null && curScore < prevScore;

  return (
    <div data-testid="task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "#374151", lineHeight: 1.35, minWidth: 0 }}>
          {taskName}
        </span>

        {/* Last week indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 150 }}>
          <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>Last week:</span>
          {prevStatus ? (
            <>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                background: STATUS_STYLE[prevStatus]?.bg || "#f3f4f6",
                color: STATUS_STYLE[prevStatus]?.color || "#6b7280",
                border: `1px solid ${STATUS_STYLE[prevStatus]?.bg || "#e5e7eb"}`,
                whiteSpace: "nowrap",
              }}>{prevStatus}</span>
              {improved  && <span style={{ fontSize: 12, fontWeight: 800, color: "#16a34a" }}>↑</span>}
              {regressed && <span style={{ fontSize: 12, fontWeight: 800, color: "#be185d" }}>↓</span>}
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#d1d5db" }}>—</span>
          )}
        </div>

        {/* Status buttons */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {WP_STATUS_OPTS.map((opt) => {
            const sel = curStatus === opt.value;
            return (
              <button key={opt.value} type="button"
                data-testid={`status-btn-${opt.value}`}
                onClick={() => onChange({ ...e, status: opt.value })}
                style={{
                  padding: "4px 9px", borderRadius: 6, fontSize: 11,
                  border: `1px solid ${sel ? opt.border : "#e5e7eb"}`,
                  background: sel ? opt.bg : "white",
                  color: sel ? opt.color : "#9ca3af",
                  fontWeight: sel ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap",
                  outline: "none",
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
  "Not Applicable": { color: "#7c3aed", bg: "#f5f3ff" },
  "Not Started":    { color: "#6b7280", bg: "#f3f4f6" },
  "In Progress":    { color: "#d97706", bg: "#fef3c7" },
  "Completed":      { color: "#16a34a", bg: "#dcfce7" },
  "Delayed":        { color: "#be185d", bg: "#fce7f3" }, // legacy display only
};

// Collapsible group row with subtasks inside
function GroupRow({ group, wpId, pkgStatuses, prevPkgStatuses, onChange }) {
  const [expanded, setExpanded] = useState(true);
  const taskNames    = group.tasks;
  const completedCnt = taskNames.filter(t => pkgStatuses?.[t]?.status === "Completed").length;
  const inProgCnt    = taskNames.filter(t => pkgStatuses?.[t]?.status === "In Progress").length;
  const allDone      = completedCnt === taskNames.length;

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 0 7px 2px", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid #f3f4f6", textAlign: "left" }}
      >
        <span style={{ fontSize: 9, color: "#9ca3af", width: 10, flexShrink: 0 }}>{expanded ? "▼" : "▶"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", flex: 1, lineHeight: 1.3 }}>{group.name}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 6, flexShrink: 0,
          background: allDone ? "#f0fdf4" : inProgCnt > 0 ? "#fffbeb" : "#f9fafb",
          color:      allDone ? "#16a34a" : inProgCnt > 0 ? "#d97706" : "#9ca3af",
          border: `1px solid ${allDone ? "#bbf7d0" : inProgCnt > 0 ? "#fde68a" : "#e5e7eb"}`,
        }}>
          {completedCnt}/{taskNames.length}
        </span>
      </button>
      {expanded && (
        <div style={{ paddingLeft: 18, borderLeft: "2px solid #f3f4f6" }}>
          {taskNames.map(taskName => (
            <WPTaskRow
              key={taskName}
              wpId={wpId}
              taskName={taskName}
              entry={pkgStatuses?.[taskName]}
              prevEntry={prevPkgStatuses?.[taskName] ?? null}
              onChange={entry => onChange(taskName, entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WPSection({ wp, pkgStatuses, prevPkgStatuses, prevDate, onChange }) {
  function handleTask(taskName, entry) {
    onChange({ ...pkgStatuses, [taskName]: entry });
  }

  const groups = getWPGroups(wp.id);
  const badge  = prevDate ? (
    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, whiteSpace: "nowrap" }}>
      Pre-filled from {prevDate}
    </span>
  ) : null;

  return (
    <FormSection title={wp.name} accentColor="#f97316" badge={badge}>
      {groups.map(group => (
        <GroupRow
          key={group.id}
          group={group}
          wpId={wp.id}
          pkgStatuses={pkgStatuses}
          prevPkgStatuses={prevPkgStatuses}
          onChange={handleTask}
        />
      ))}
    </FormSection>
  );
}

function ToggleGroup({ name, label, options, value, onChange, colorMap }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const sel = value === opt;
          const c = colorMap?.[opt] || {};
          return (
            <button key={opt} type="button"
              data-testid={name ? `toggle-${name}-${opt}` : undefined}
              onClick={() => onChange(opt)} style={{
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

// ── Gantt-based WP progress row ────────────────────────────────────────────

const GANTT_STATUS_OPTS = [
  { value: 'not_started', label: 'Not Started', bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' },
  { value: 'in_progress', label: 'In Progress', bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  { value: 'completed',   label: 'Completed',   bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  { value: 'delayed',     label: 'Delayed',     bg: '#fce7f3', color: '#be185d', border: '#f9a8d4' },
  { value: 'blocked',     label: 'Blocked',     bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
];

function GanttWPRow({ task, entry, onChange }) {
  const pct    = entry?.progress_pct ?? task.actual_progress ?? 0;
  const status = entry?.status       ?? task.status          ?? 'not_started';
  const pctColor = pct >= 100 ? '#16a34a' : pct >= 50 ? '#2f855a' : '#6b7280';

  function setPct(val) {
    const autoStatus = val === 0 ? 'not_started' : val === 100 ? 'completed' : 'in_progress';
    onChange({ progress_pct: val, status: autoStatus });
  }
  function setStatus(val) {
    const autoPct = val === 'completed' ? 100 : val === 'not_started' ? 0 : pct;
    onChange({ progress_pct: autoPct, status: val });
  }

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{task.label}</span>
          {task.isCritical && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>CRITICAL</span>
          )}
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: pctColor, minWidth: 44, textAlign: 'right' }}>{pct}%</span>
      </div>
      <input
        type="range" min="0" max="100" step="10"
        value={pct}
        onChange={e => setPct(parseInt(e.target.value))}
        style={{ width: '100%', cursor: 'pointer', accentColor: pctColor, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {GANTT_STATUS_OPTS.map(opt => {
          const sel = status === opt.value;
          return (
            <button key={opt.value} type="button"
              onClick={() => setStatus(opt.value)}
              style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 11,
                border: `1px solid ${sel ? opt.border : '#e5e7eb'}`,
                background: sel ? opt.bg : 'white',
                color: sel ? opt.color : '#9ca3af',
                fontWeight: sel ? 700 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', outline: 'none',
              }}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {(task.earlyStart || task.earlyFinish) && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
          {task.earlyStart ? new Date(task.earlyStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
          {' → '}
          {task.earlyFinish ? new Date(task.earlyFinish).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
          {' · '}
          {task.duration_days}d
        </div>
      )}
    </div>
  );
}

// ── Collapsible phase wrapper ──────────────────────────────────────────────

function PhaseSection({ phaseKey, tasks, ganttWpProgress, onUpdateProgress, projectId }) {
  const storageKey = `gantt_phases_${projectId}`;

  const [open, setOpen] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return stored[phaseKey] ?? false;
    } catch { return false; }
  });

  const phasePct = tasks.length === 0 ? 0 : Math.round(
    tasks.reduce((sum, t) => {
      const e = ganttWpProgress[t.id];
      return sum + (e?.progress_pct ?? t.actual_progress ?? 0);
    }, 0) / tasks.length
  );
  const allComplete = phasePct === 100;

  // Auto-close when the last task reaches 100% (skip on first mount)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (allComplete && open) toggle(false);
  }, [allComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(next = !open) {
    setOpen(next);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      stored[phaseKey] = next;
      localStorage.setItem(storageKey, JSON.stringify(stored));
    } catch { /* ignore corrupt localStorage */ }
  }

  const pctColor = phasePct >= 100 ? '#16a34a' : phasePct >= 50 ? '#2f855a' : '#6b7280';

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, marginBottom: 14, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Header */}
      <div
        onClick={() => toggle()}
        style={{
          padding: '12px 22px',
          borderLeft: '4px solid #2f855a',
          borderBottom: open ? '1px solid #f3f4f6' : 'none',
          background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, color: '#6b7280', display: 'inline-block',
            transition: 'transform 0.15s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>▶</span>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {phaseKey}
          </h3>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: pctColor }}>{phasePct}%</span>
      </div>

      {/* Tasks */}
      {open && (
        <div style={{ padding: '20px 22px' }}>
          {tasks.map(task => (
            <GanttWPRow
              key={task.id}
              task={task}
              entry={ganttWpProgress[task.id]}
              onChange={updates => onUpdateProgress(task.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Form initialization ────────────────────────────────────────────────────

// Build cumulative best WP statuses across all project reports
const _WP_SCORES = { 'Not Applicable': null, 'Not Started': 0, 'In Progress': 0.5, 'Completed': 1, 'Delayed': 0.3 };
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

  // Auto-advance reporting date by 7 days from the last report
  const nextReportDate = prevReport
    ? (() => {
        const d = new Date(prevReport.reportingDate || prevReport.submittedAt);
        d.setDate(d.getDate() + 7);
        return d.toISOString().split('T')[0];
      })()
    : new Date().toISOString().split('T')[0];

  return {
    reportingDate: nextReportDate,
    currentPackages,
    workPackageStatuses: wpStatuses,
    projectScheduleStatus: "On Track",
    risks:                 [],
    riskOwners:            [],
    riskScale:             "",
    riskDescription: "",
    supportRequired:       "No",
    supportTypes:          [],
    supportDescription: "",
    additionalWorks:       "No",
    additionalWorksParty:  "",
    additionalWorksDescription: "",
    additionalWorksCost: "",
    nextWeekTop3: "",
    weekAfterTop3: "",
    activitiesBlocked:     prevReport?.activitiesBlocked || "No",
    delayReason: "",
    pendingIssues: "",
    finalComments: "",
    photos: [],
    declarationConfirmed: false,
  };
}

// ── Main component ─────────────────────────────────────────────────────────

function ContractorReport({ projects, reports }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const [fallbackProject, setFallbackProject] = useState(null);
  const [fallbackReports, setFallbackReports] = useState([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState(null);
  const project = projects.find((p) => String(p.id) === projectId) || fallbackProject;
  const reportSource = reports.length > 0 ? reports : fallbackReports;

  useEffect(() => {
    if (projects.some((p) => String(p.id) === projectId) && reports.length > 0) return;

    let isMounted = true;
    setContextLoading(true);
    setContextError(null);

    Promise.all([
      projects.some((p) => String(p.id) === projectId)
        ? Promise.resolve(null)
        : getProjectById(projectId),
      reports.length > 0
        ? Promise.resolve(null)
        : getReportsForProjectForScreens(projectId),
    ])
      .then(([loadedProject, loadedReports]) => {
        if (!isMounted) return;
        if (loadedProject) setFallbackProject(loadedProject);
        if (loadedReports) setFallbackReports(loadedReports);
      })
      .catch((error) => {
        console.error("Failed to load contractor report context:", error);
        if (isMounted) setContextError(error?.message || "Failed to load report context");
      })
      .finally(() => {
        if (isMounted) setContextLoading(false);
      });

    return () => { isMounted = false; };
  }, [projectId, projects, reports.length]);

  const projectReportsForPrefill = useMemo(() =>
    reportSource.filter((r) => String(r.projectId) === projectId),
    [reportSource, projectId]
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

  const [ganttTasks, setGanttTasks] = useState([]);
  const [ganttLoading, setGanttLoading] = useState(false);
  const [ganttWpProgress, setGanttWpProgress] = useState({});

  useEffect(() => {
  if (!project?.id) return;

  let isMounted = true;

  const loadGanttTasks = async () => {
    try {
      setGanttLoading(true);

      const rawTasks = await getProjectGantt(project.id);
      const activeWPIds = project?.scope?.workPackages;
      const tasks = activeWPIds ? (rawTasks || []).filter(t => activeWPIds.includes(t.id)) : (rawTasks || []);

      if (isMounted) {
        setGanttTasks(tasks);
        // Pre-fill progress state from DB so overallProgress is correct
        // even if the user submits without touching any slider.
        const initial = {};
        for (const t of tasks) {
          initial[t.id] = {
            progress_pct: t.actual_progress ?? 0,
            status:       t.status          ?? 'not_started',
            comment:      '',
          };
        }
        setGanttWpProgress(initial);
      }
    } catch (error) {
      console.error("Failed to load Gantt tasks:", error);

      if (isMounted) {
        setGanttTasks([]);
      }
    } finally {
      if (isMounted) {
        setGanttLoading(false);
      }
    }
  };

  loadGanttTasks();

  return () => {
    isMounted = false;
  };
}, [project?.id]);

  function updateWPProgress(wpId, updates) {
    setGanttWpProgress(prev => ({ ...prev, [wpId]: { ...(prev[wpId] || {}), ...updates } }));
  }

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
      const currentPhases = deriveOldPhasesFromPackages(form.currentPackages);

      // When Gantt path is active, synthesize workPackageStatuses from the
      // slider inputs (ganttWpProgress) so Weekly Reports can display real progress.
      // Without this, the saved report has all tasks at "Not Started" (0%).
      let workPackageStatuses = form.workPackageStatuses || {};
      if (ganttTasks.length > 0) {
        const synthesized = {};
        for (const task of ganttTasks) {
          const entry = ganttWpProgress[task.id] || {};
          const pct = entry.progress_pct ?? task.actual_progress ?? 0;
          const ganttStatus = entry.status ?? task.status ?? 'not_started';
          const wpStatus =
            ganttStatus === 'completed' ? 'Completed'
            : (ganttStatus === 'in_progress' || ganttStatus === 'delayed' || ganttStatus === 'blocked') ? 'In Progress'
            : 'Not Started';
          const wpId = task.phaseId;
          const taskName = task.label;
          if (wpId && taskName) {
            if (!synthesized[wpId]) synthesized[wpId] = {};
            synthesized[wpId][taskName] = { status: wpStatus, progress: pct };
          }
        }
        workPackageStatuses = synthesized;
      }

      const mainReportPayload = normalizeReport({
        id: Date.now(),
        projectId: project.id,
        storeCode: project.storeCode,
        projectName: project.shoppingMallName,
        contractor: project.generalContractor,
        submittedAt: new Date().toISOString(),
        previousReportId: prevReport?.id ?? null,

        ...form,

        currentPhase: currentPhases[0] || "",
        currentPhases,
        currentPackages: form.currentPackages || [],
        workPackageStatuses,
        photos: form.photos.map((p) => (p?.name ? p.name : p)),
      });

      // Compute cumulative progress (all prior reports + this one) before saving,
      // so the history row stores the same number the Weekly Reports screen shows.
      const projectReports = reports.filter(r => String(r.projectId) === String(project.id));
      const allReports = [...projectReports, mainReportPayload];
      const wpCum  = computeWPCumulativeStatuses(allReports);
      const legCum = computeCumulativeStatuses(allReports);
      const cumulativeProgress = calculateProjectProgressResult(wpCum, legCum).progress;

      const wpProgressArray = ganttTasks.length > 0
        ? Object.entries(ganttWpProgress).map(([wpId, value]) => ({
            wpId,
            progress_pct: value.progress_pct ?? 0,
            status: value.status ?? "not_started",
            comment: value.comment ?? "",
          }))
        : [];

      const overallProgress =
        wpProgressArray.length > 0
          ? Math.round(
              wpProgressArray.reduce((sum, wp) => sum + wp.progress_pct, 0) /
                wpProgressArray.length
            )
          : cumulativeProgress;

      await submitContractorReport(project.id, wpProgressArray, {
        reportDate: mainReportPayload.reportingDate,
        submittedBy: user.id,
        overallProgress,
        masterReportId: mainReportPayload.id,
        reportSnapshot: mainReportPayload,
        cumulativeProgress,
      });

      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Failed to submit report. Please try again.");
    }
  }

  if (!project && contextLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>
          Loading report...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f7f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏗</div>
          <h2 style={{ color: "#111827", marginBottom: 8 }}>Project not found</h2>
          <p style={{ color: "#6b7280" }}>{contextError || "This report link is invalid or the project has been removed."}</p>
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
              onClick={() => window.history.back()}
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
    <div data-testid="contractor-report-form" style={{ minHeight: "100vh", background: "#f0f7f2", padding: "36px 20px 80px" }}>
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
          <div style={{ marginBottom: ganttTasks.length > 0 ? 0 : 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Reporting Date</div>
            <input
              type="date"
              data-testid="reporting-date"
              value={form.reportingDate}
              onChange={(e) => updateField("reportingDate", e.target.value)}
              style={{ height: 42, padding: "0 14px", border: "1px solid #d1d5db", borderRadius: 10, fontSize: 14, color: "#1f2937", background: "white", outline: "none", width: 200 }}
            />
          </div>
          {ganttTasks.length === 0 && !ganttLoading && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Active Work Packages This Week</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>Select all work packages with active works this reporting period.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {WORK_PACKAGES.map((wp) => {
                  const sel = (form.currentPackages || []).includes(wp.id);
                  return (
                    <button key={wp.id} type="button"
                      data-testid="wp-toggle"
                      data-wp-id={wp.id}
                      onClick={() => togglePackage(wp.id)}
                      style={{
                        padding: "12px 14px", borderRadius: 12, textAlign: "left",
                        border: `2px solid ${sel ? "#f97316" : "#e5e7eb"}`,
                        background: sel ? "#fff7ed" : "white",
                        color: sel ? "#f97316" : "#9ca3af",
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
          )}
        </FormSection>

        {/* ── 2. Work Package Progress ── */}
        {ganttLoading ? (
          <FormSection title="Work Package Progress" accentColor="#2f855a">
            <div style={{ textAlign: "center", padding: "20px", color: "#9ca3af", fontSize: 13 }}>Loading schedule…</div>
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
              <PhaseSection
                key={phase}
                phaseKey={phase}
                tasks={tasks}
                ganttWpProgress={ganttWpProgress}
                onUpdateProgress={updateWPProgress}
                projectId={project.id}
              />
            ));
          })()
        ) : (
          activePackages.map((wp) => (
            <WPSection
              key={wp.id}
              wp={wp}
              pkgStatuses={form.workPackageStatuses?.[wp.id] || {}}
              prevPkgStatuses={prevReport?.workPackageStatuses?.[wp.id] ?? null}
              prevDate={prevReport?.reportingDate || null}
              onChange={(pkgStatuses) => updateWPStatuses(wp.id, pkgStatuses)}
            />
          ))
        )}

        {/* ── 3. Schedule Status ── */}
        <FormSection title="Project Schedule Status" accentColor="#475569">
          <ToggleGroup
            name="schedule-status"
            label="Is the project on track vs the agreed schedule?"
            options={["On Track", "At Risk", "Critical"]}
            value={form.projectScheduleStatus}
            onChange={(v) => updateField("projectScheduleStatus", v)}
            colorMap={{
              "On Track": { bg: "#dcfce7", color: "#166534", border: "#86efac" },
              "At Risk":  { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
              "Critical": { bg: "#fff1f2", color: "#7f1d1d", border: "#f43f5e" },
            }}
          />
        </FormSection>

        {/* ── 4. Risks ── */}
        {(form.projectScheduleStatus === "At Risk" || form.projectScheduleStatus === "Critical") && (
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
            name="support-required"
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
            name="additional-works"
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
            name="activities-blocked"
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
              data-testid="declaration-checkbox"
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
          data-testid="save-contractor-report"
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
