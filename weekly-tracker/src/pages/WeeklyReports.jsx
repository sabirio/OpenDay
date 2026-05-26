import React, { useState, useMemo } from "react";
import {
  formatDate,
  getStatusScore,
  computeCumulativeStatuses,
  estimateProgressFromStatuses,
  computeWPCumulativeStatuses,
  isWPReport,
} from "../reportUtils";
import { WORK_PACKAGES, computePackageProgress, WP_STATUS_SCORES } from "../config/workPackages";

// ─────────────────────────────────────────────
// ErrorBoundary — перехватывает ошибки рендера
// и показывает читаемое сообщение вместо белого экрана
// ─────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="dashboard-summary-card">
        <h2>Rendering error</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#dc2626" }}>{String(this.state.error)}</pre>
      </div>
    );
    return this.props.children;
  }
}

// ─────────────────────────────────────────────
// Под-компоненты — объявлены ВНЕ WeeklyReports,
// чтобы React не пересоздавал их тип при каждом
// рендере (иначе компоненты размонтируются
// и монтируются заново при любом state-изменении)
// ─────────────────────────────────────────────

// Цветной бейдж статуса (Completed / In progress / Not started)
function StatusBadge({ value }) {
  if (!value || value === "-") return <span style={{ color: "#94a3b8" }}>—</span>;
  const scheduleColor = value === "On Track" ? "#22c55e" : value === "Critical" ? "#7f1d1d" : value === "Delayed" ? "#dc2626" : value === "At Risk" ? "#f59e0b" : null;
  const score = getStatusScore(value);
  const color = scheduleColor ?? (score >= 1 ? "#22c55e" : score >= 0.5 ? "#f59e0b" : score > 0 ? "#60a5fa" : "#94a3b8");
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: color + "20", color, border: `1px solid ${color}44` }}>
      {value}
    </span>
  );
}

// Лейбл + значение (используется в сводке отчёта и информационных строках)
function InfoLabel({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{children || "—"}</div>
    </div>
  );
}

// Блок с текстовым содержимым (риски, look-ahead, комментарии)
function TextBlock({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>{label}</div>
      <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "12px 16px", fontSize: 14, color: "#cbd5e1", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

function parseAdditionalWorksCost(cost) {
  if (!cost) return { value: 0, currency: "" };
  const raw = String(cost).trim();
  const currencyMatch = raw.match(/[A-Za-z]{1,5}$/);
  const currency = currencyMatch ? currencyMatch[0] : "";
  const numericPart = raw.replace(/[^0-9.,-]+/g, "").replace(/\s+/g, "");
  if (!numericPart) return { value: 0, currency };

  let normalized = numericPart;
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(".") > normalized.lastIndexOf(",")) {
      normalized = normalized.replace(/,/g, "");
    } else {
      normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (normalized.includes(",")) {
    const parts = normalized.split(",");
    if (parts.length > 1 && parts[1].length === 3) {
      normalized = parts.join("");
    } else {
      normalized = normalized.replace(/,/g, ".");
    }
  }

  const value = parseFloat(normalized);
  return { value: Number.isFinite(value) ? value : 0, currency };
}

function formatAdditionalWorksSum(value, currency) {
  const formatted = Math.round(value).toLocaleString("en-US").replace(/,/g, " ");
  return currency ? `${formatted} ${currency}` : formatted;
}

// Old-format task name → WP task mapping (for reading legacy reports as WP cards)
const OLD_TO_WP_WEEKLY = {
  "Flooring installation":                                   { wpId: "finishes",      task: "Floor finishes" },
  "Drywall partition installation":                          { wpId: "construction",  task: "Partitions & drywall" },
  "Electrical systems installation":                         { wpId: "mep",           task: "Electrical conduits & cabling" },
  "HVAC systems installation":                               { wpId: "mep",           task: "HVAC ducts" },
  "Fire safety systems installation":                        { wpId: "mep",           task: "Fire suppression pipes" },
  "Low current systems installation":                        { wpId: "mep",           task: "Low current systems" },
  "Ceiling installation":                                    { wpId: "construction",  task: "Ceiling structures" },
  "Lighting installation":                                   { wpId: "finishes",      task: "Lighting fixtures" },
  "Furniture installation":                                  { wpId: "equipment",     task: "Furniture & loose items" },
  "Sprinkler system testing and commissioning":              { wpId: "commissioning", task: "Sprinkler testing & commissioning" },
  "Smoke detection system testing and commissioning":        { wpId: "commissioning", task: "Fire alarm testing" },
  "Emergency announcement system testing and commissioning": { wpId: "commissioning", task: "Integrated systems testing" },
  "HVAC system testing and commissioning":                   { wpId: "commissioning", task: "HVAC balancing & commissioning" },
  "Electrical system testing and commissioning":             { wpId: "commissioning", task: "Electrical testing & certification" },
  "Low current testing and commissioning":                   { wpId: "commissioning", task: "Security & access control testing" },
  "Staff training":                                          { wpId: "handover",      task: "Staff training" },
  "Manuals, certificates, test reports":                     { wpId: "handover",      task: "O&M manuals" },
  "Final cleaning":                                          { wpId: "handover",      task: "Final cleaning" },
  "Snag list resolution":                                    { wpId: "handover",      task: "Defects & snagging resolution" },
};

function mapOldToWPStatus(s) {
  if (!s) return null;
  const v = String(s).toLowerCase().trim();
  if (v === "completed" || v === "done" || v === "complete") return "Completed";
  if (v.includes("progress") || v === "started" || v === "active") return "In Progress";
  if (v === "delayed" || v === "blocked" || v === "behind") return "Delayed";
  return null; // Not Started / Not Applicable → omit
}

function deriveWPStatusesFromOldReport(report) {
  if (!report) return {};
  const result = {};
  function set(wpId, taskName, rawStatus) {
    const status = mapOldToWPStatus(rawStatus);
    if (!status) return;
    if (!result[wpId]) result[wpId] = {};
    result[wpId][taskName] = { status };
  }
  set("demolition", "Demolition works", report.demolitionStatus);
  for (const [oldKey, { wpId, task }] of Object.entries(OLD_TO_WP_WEEKLY)) {
    const raw = report.constructionStatuses?.[oldKey]
      ?? report.testingStatuses?.[oldKey]
      ?? report.handoverStatuses?.[oldKey];
    set(wpId, task, raw);
  }
  return result;
}

// Merge multiple derived WP-status maps, keeping the highest-scored status per task
function mergeOldDerivedStatuses(derivedList) {
  const result = {};
  for (const derived of derivedList) {
    for (const [wpId, tasks] of Object.entries(derived)) {
      if (!result[wpId]) result[wpId] = {};
      for (const [taskName, entry] of Object.entries(tasks)) {
        const cur = result[wpId][taskName];
        if (!cur || (WP_STATUS_SCORES[entry.status] ?? -1) > (WP_STATUS_SCORES[cur.status] ?? -1)) {
          result[wpId][taskName] = entry;
        }
      }
    }
  }
  return result;
}

function statusColor(status) {
  const score = WP_STATUS_SCORES[status] ?? 0;
  return score >= 1 ? "#22c55e" : score >= 0.5 ? "#f59e0b" : score >= 0.3 ? "#be185d" : "#94a3b8";
}

function deriveOverallStatus(statuses) {
  if (!statuses.length) return "Not Started";
  if (statuses.some((s) => s === "Delayed"))   return "Delayed";
  if (statuses.every((s) => s === "Completed")) return "Completed";
  if (statuses.some((s) => s === "Completed" || s === "In Progress")) return "In Progress";
  return "Not Started";
}

// One card per WP phase — always rendered, collapsible task rows
function WPPhaseCard({ wp, wpStatuses, wpCumStatuses, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  const taskStatuses    = wpStatuses?.[wp.id]    || {};
  const cumTaskStatuses = wpCumStatuses?.[wp.id] || {};

  // Merge per-task: pick the highest-scored status between this report and cumulative
  const tasks = wp.tasks;
  const mergedTaskStatuses = {};
  for (const task of tasks) {
    const e = taskStatuses[task.name]    || {};
    const c = cumTaskStatuses[task.name] || {};
    const eScore = WP_STATUS_SCORES[e.status] ?? -1;
    const cScore = WP_STATUS_SCORES[c.status] ?? -1;
    mergedTaskStatuses[task.name] = cScore >= eScore
      ? (c.status ? c : e)
      : (e.status ? e : c);
  }

  const pct = computePackageProgress({ [wp.id]: mergedTaskStatuses }, wp.id);

  const resolvedStatuses = tasks.map((t) => mergedTaskStatuses[t.name]?.status || "Not Started");

  const overallStatus  = deriveOverallStatus(resolvedStatuses);
  const delayedCount   = resolvedStatuses.filter((s) => s === "Delayed").length;
  const completedCount = resolvedStatuses.filter((s) => s === "Completed").length;
  const sc = statusColor(overallStatus);

  return (
    <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 14, borderTop: `3px solid ${wp.color}`, overflow: "hidden" }}>
      <button type="button" onClick={() => setExpanded((e) => !e)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#f1f5f9", lineHeight: 1.3 }}>{wp.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: sc + "20", color: sc, border: `1px solid ${sc}44` }}>
                {overallStatus}
              </span>
              {delayedCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171" }}>⚠ {delayedCount} delayed</span>
              )}
              <span style={{ fontSize: 10, color: "#475569" }}>{completedCount}/{tasks.length} done</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: wp.color }}>{pct}%</span>
            <span style={{ fontSize: 9, color: "#475569" }}>{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
        <div style={{ background: "#334155", borderRadius: 6, height: 5, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: wp.color, borderRadius: 6, transition: "width 0.35s ease" }} />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #334155", padding: "6px 20px 14px" }}>
          {tasks.map((task) => {
            const status = mergedTaskStatuses[task.name]?.status || "Not Started";
            const tsc    = statusColor(status);
            return (
              <div key={task.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #2d3f54" }}>
                <span style={{ fontSize: 12, color: "#94a3b8", flex: 1, paddingRight: 12, lineHeight: 1.35 }}>{task.name}</span>
                <span style={{ padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600, background: tsc + "20", color: tsc, border: `1px solid ${tsc}44`, whiteSpace: "nowrap" }}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Главный компонент WeeklyReports
// Props: projects (массив проектов), reports (все отчёты)
// ─────────────────────────────────────────────
function WeeklyReports({ projects, reports }) {
  // Храним только намерение пользователя — реальный выбор выводится ниже
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [showMissingModal, setShowMissingModal] = useState(false);

  // ── Мемоизированные вычисления ────────────────

  // Эффективный ID проекта: если state пустой или проект удалён — берём первый из списка.
  // Это заменяет useEffect, который вызывал setState внутри эффекта (нарушение правил React).
  const effectiveProjectId = useMemo(() => {
    if (selectedProjectId && projects.some((p) => String(p.id) === selectedProjectId))
      return selectedProjectId;
    return projects.length ? String(projects[0].id) : "";
  }, [selectedProjectId, projects]);

  // Отчёты выбранного проекта, отсортированные от новых к старым
  const projectReports = useMemo(() =>
    reports
      .filter((r) => String(r.projectId) === effectiveProjectId)
      .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt)),
    [reports, effectiveProjectId]
  );

  // Эффективный ID отчёта: если state пустой или отчёт удалён — берём самый свежий.
  // Это заменяет useEffect, который вызывал setState внутри эффекта (нарушение правил React).
  const effectiveReportId = useMemo(() => {
    if (selectedReportId && projectReports.some((r) => String(r.id) === selectedReportId))
      return selectedReportId;
    return projectReports.length ? String(projectReports[0].id) : "";
  }, [selectedReportId, projectReports]);

  const selectedReport = projectReports.find((r) => String(r.id) === effectiveReportId);
  const selectedProject = projects.find((p) => String(p.id) === effectiveProjectId);

  // Кумулятивный прогресс по ВСЕМ отчётам проекта (для полосы "Overall Progress")
  const overallCumulative = useMemo(
    () => computeCumulativeStatuses(projectReports),
    [projectReports]
  );
  const overallProgress = useMemo(
    () => estimateProgressFromStatuses(overallCumulative),
    [overallCumulative]
  );

  const riskCount = selectedReport?.risks?.filter(Boolean).length || 0;

  const portfolioKpis = useMemo(() => {
    const now = new Date();
    const rows = projects.map(p => {
      const pReports = reports.filter(r => String(r.projectId) === String(p.id));
      const latest = [...pReports].sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt))[0];
      const daysSince = latest ? Math.floor((now - new Date(latest.reportingDate || latest.submittedAt)) / 86400000) : null;
      const isMissing = !latest || (daysSince !== null && daysSince > 7);
      const progress = estimateProgressFromStatuses(computeCumulativeStatuses(pReports));
      return { project: p, latestReport: latest, daysSinceReport: daysSince, isMissing, progress };
    });
    const missing = rows.filter(r => r.isMissing);
    const blocked = rows.filter(r => r.latestReport?.activitiesBlocked === "Yes").length;
    const support = rows.filter(r => r.latestReport?.supportRequired === "Yes").length;
    const avgProgress = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.progress, 0) / rows.length) : 0;
    return { missingCount: missing.length, missing, blocked, support, avgProgress };
  }, [projects, reports]);

  const additionalWorksList = useMemo(() => {
    const sorted = [...projectReports].sort(
      (a, b) => new Date(a.reportingDate || a.submittedAt) - new Date(b.reportingDate || b.submittedAt)
    );
    const entries = sorted.reduce((acc, r, idx) => {
      if (r.additionalWorks !== "Yes") return acc;
      const { value, currency } = parseAdditionalWorksCost(r.additionalWorksCost);
      acc.push({
        num: idx + 1,
        date: r.reportingDate || new Date(r.submittedAt).toLocaleDateString("en-GB"),
        cost: r.additionalWorksCost || "—",
        description: r.additionalWorksDescription || "",
        party: r.additionalWorksParty || "",
        costValue: value,
        currency,
      });
      return acc;
    }, []);
    const totalSum = entries.reduce((s, e) => s + (e.costValue || 0), 0);
    const allCurrencies = [...new Set(entries.map(e => e.currency).filter(Boolean))];
    const currency = allCurrencies.length === 1 ? allCurrencies[0] : "";
    const total = entries.length > 0 ? formatAdditionalWorksSum(totalSum, currency) : null;
    return { entries, total };
  }, [projectReports]);

  const additionalWorksTotal = additionalWorksList.total;

  // ── Рендер ───────────────────────────────────
  return (
    <ErrorBoundary>
      <div>
        {/* Заголовок страницы */}
        <div className="page-header">
          <div>
            <h1>Weekly Reports</h1>
            <p>Contractor progress reports — detailed operational status by project and week.</p>
          </div>
        </div>

        {/* Тулбар: выбор проекта, выбор отчёта, метрики проекта */}
        <div className="dashboard-toolbar">
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="dashboard-filter-group">
              <label>Project</label>
              <select value={selectedProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedReportId(""); }}>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.storeCode} — {p.shoppingMallName}</option>
                ))}
              </select>
            </div>
            <div className="dashboard-filter-group">
              <label>Report date</label>
              <select value={selectedReportId} onChange={(e) => setSelectedReportId(e.target.value)} disabled={!projectReports.length}>
                {projectReports.length === 0
                  ? <option value="">No reports yet</option>
                  : projectReports.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.reportingDate || formatDate(r.submittedAt)}
                      </option>
                    ))
                }
              </select>
            </div>
          </div>

          {/* Пилюли с основной информацией о выбранном проекте */}
          {selectedProject && (
            <div className="dashboard-metrics-toolbar">
              <div className="metric-pill"><span>Store</span><strong>{selectedProject.storeCode}</strong></div>
              <div className="metric-pill"><span>Country</span><strong>{selectedProject.country || "—"}</strong></div>
              <div className="metric-pill"><span>PM</span><strong>{selectedProject.projectManager || "—"}</strong></div>
              <div className="metric-pill"><span>Type</span><strong>{selectedProject.projectType || "—"}</strong></div>
              <div className="metric-pill" style={selectedProject.projectStatus !== "Active" ? { background: "#1e293b", color: "#94a3b8", borderColor: "#475569" } : {}}>
                <span>Status</span><strong>{selectedProject.projectStatus || "—"}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Полоса дат проекта + общий кумулятивный прогресс */}
        {selectedProject && (
          <div className="dashboard-summary-card" style={{ marginBottom: 20, padding: "16px 24px" }}>
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "flex-end" }}>
              <InfoLabel label="Construction Start">{selectedProject.constructionStartDate || "—"}</InfoLabel>
              <InfoLabel label="Construction End">{selectedProject.constructionEndDate || "—"}</InfoLabel>
              <InfoLabel label="Target Opening">
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>{selectedProject.targetOpeningDate || "—"}</span>
              </InfoLabel>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Overall Progress</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#22c55e", lineHeight: 1 }}>{overallProgress}%</span>
                  <div style={{ width: 80, background: "#1a3a29", borderRadius: 4, height: 6, overflow: "hidden" }}>
                    <div style={{ width: `${overallProgress}%`, height: "100%", background: "#2f855a", borderRadius: 4 }} />
                  </div>
                </div>
              </div>
              <div style={{ width: 1, background: "#334155", alignSelf: "stretch", margin: "0 8px" }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Avg Progress</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#2563eb", lineHeight: 1 }}>{portfolioKpis.avgProgress}%</span>
              </div>
              <div
                onClick={portfolioKpis.missingCount > 0 ? () => setShowMissingModal(true) : undefined}
                style={{ cursor: portfolioKpis.missingCount > 0 ? "pointer" : "default" }}
                title={portfolioKpis.missingCount > 0 ? "Click to view missing reports" : undefined}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Missing Reports</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: portfolioKpis.missingCount > 0 ? "#dc2626" : "#22c55e", lineHeight: 1, textDecoration: portfolioKpis.missingCount > 0 ? "underline dotted" : "none" }}>{portfolioKpis.missingCount}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Blocked</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: portfolioKpis.blocked > 0 ? "#dc2626" : "#22c55e", lineHeight: 1 }}>{portfolioKpis.blocked}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Client Support</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: portfolioKpis.support > 0 ? "#7c3aed" : "#22c55e", lineHeight: 1 }}>{portfolioKpis.support}</span>
              </div>
            </div>
          </div>
        )}

        {/* Missing Reports Modal */}
        {showMissingModal && (
          <>
            <div onClick={() => setShowMissingModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 780, maxWidth: "96vw", maxHeight: "85vh", background: "#1e293b", zIndex: 1001, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", borderTop: "3px solid #dc2626" }}>
              <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #334155", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#f1f5f9" }}>Missing Reports</div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Projects with no report submitted or last report older than 7 days</div>
                </div>
                <button type="button" onClick={() => setShowMissingModal(false)} style={{ padding: "5px 13px", borderRadius: 8, border: "none", background: "#334155", color: "#f1f5f9", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close ×</button>
              </div>
              <div style={{ overflowY: "auto", padding: "16px 24px" }}>
                <table className="dashboard-table" style={{ width: "100%" }}>
                  <thead><tr><th>Project</th><th>Contractor</th><th>Last Report</th><th>Days Since</th><th>PM</th><th>Status</th></tr></thead>
                  <tbody>{portfolioKpis.missing.sort((a, b) => (b.daysSinceReport ?? 999) - (a.daysSinceReport ?? 999)).map(({ project, latestReport, daysSinceReport }) => (
                    <tr key={project.id}>
                      <td><div style={{ fontWeight: 700, color: "#f1f5f9" }}>{project.storeCode}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{project.shoppingMallName}</div></td>
                      <td style={{ fontSize: 12, color: "#e2e8f0" }}>{project.generalContractor || "—"}</td>
                      <td style={{ fontSize: 12, color: "#94a3b8" }}>{latestReport ? formatDate(latestReport.reportingDate || latestReport.submittedAt) : <span style={{ color: "#dc2626", fontWeight: 700 }}>Never</span>}</td>
                      <td style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{daysSinceReport !== null ? `${daysSinceReport}d` : "—"}</td>
                      <td style={{ fontSize: 12, color: "#e2e8f0" }}>{project.projectManager || "—"}</td>
                      <td>{!latestReport ? <span style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", padding: "2px 8px", borderRadius: 7, background: "#450a0a", border: "1px solid #7f1d1d" }}>Missing</span> : <span style={{ fontSize: 11, fontWeight: 700, color: "#fcd34d", padding: "2px 8px", borderRadius: 7, background: "#422006", border: "1px solid #b45309" }}>Overdue</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Заглушка когда отчётов нет */}
        {projectReports.length === 0 && selectedProject && (
          <div className="dashboard-summary-card" style={{ color: "#94a3b8", padding: "32px 24px", textAlign: "center" }}>
            No weekly reports submitted yet for this project.
          </div>
        )}

        {/* ── Детальный просмотр выбранного отчёта ──────────────────────────── */}
        {selectedReport && (
          <>
            {/* Сводка отчёта: фаза, статус графика, блокеры, дата */}
            <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 20 }}>
                <InfoLabel label="Current Phase">
                  {Array.isArray(selectedReport.currentPhases)
                    ? selectedReport.currentPhases.join(" + ")
                    : selectedReport.currentPhase}
                </InfoLabel>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 6 }}>Schedule</div>
                  <StatusBadge value={selectedReport.projectScheduleStatus} />
                </div>
                <InfoLabel label="Blocked">
                  <span style={{ fontWeight: 700, color: selectedReport.activitiesBlocked === "Yes" ? "#dc2626" : "#22c55e" }}>
                    {selectedReport.activitiesBlocked || "—"}
                  </span>
                </InfoLabel>
                <InfoLabel label="Support Required">
                  <span style={{ fontWeight: 700, color: selectedReport.supportRequired === "Yes" ? "#d97706" : "#22c55e" }}>
                    {selectedReport.supportRequired || "—"}
                  </span>
                </InfoLabel>
                <InfoLabel label="Report Date">{selectedReport.reportingDate || "—"}</InfoLabel>
                <InfoLabel label="Submitted">{new Date(selectedReport.submittedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</InfoLabel>
                <InfoLabel label="Total Reports">{projectReports.length}</InfoLabel>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Additional Works</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: additionalWorksTotal === "0" || additionalWorksTotal === "" ? "#94a3b8" : "#c2410c" }}>
                    {additionalWorksTotal || "—"}
                  </div>
                </div>
                {riskCount > 0 && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Active Risks</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(selectedReport.risks || []).filter(Boolean).map((r, i) => (
                        <span key={i} style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "#422006", color: "#fcd34d", border: "1px solid #b45309" }}>{r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 8 WP phase cards — always rendered, one per phase */}
            {(() => {
              const wpReport = isWPReport(selectedReport);
              const derivedStatuses = wpReport
                ? selectedReport.workPackageStatuses
                : deriveWPStatusesFromOldReport(selectedReport);
              const wpCumStatuses = wpReport
                ? computeWPCumulativeStatuses(projectReports)?.workPackageStatuses
                : mergeOldDerivedStatuses(projectReports.map(deriveWPStatusesFromOldReport));
              return (
                // key on effectiveReportId forces card remount (and defaultExpanded reset) when report changes
                <div key={effectiveReportId} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 20 }}>
                  {WORK_PACKAGES.map((wp, index) => (
                    <WPPhaseCard
                      key={wp.id}
                      wp={wp}
                      wpStatuses={derivedStatuses}
                      wpCumStatuses={wpCumStatuses}
                      defaultExpanded={index === 0}
                    />
                  ))}
                </div>
              );
            })()}

            {/* ── 4 колонки: Look Ahead / Declaration / Risk Details / Client Support ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>

              {/* Look Ahead */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#f1f5f9" }}>Look Ahead</div>
                {(selectedReport.nextWeekTop3 || selectedReport.weekAfterTop3 || selectedReport.delayReason) ? (
                  <>
                    <TextBlock label="Top 3 — Next Week" value={selectedReport.nextWeekTop3} />
                    <TextBlock label="Top 3 — Week +2" value={selectedReport.weekAfterTop3} />
                    {selectedReport.activitiesBlocked === "Yes" && (
                      <TextBlock label="Delay Reason" value={selectedReport.delayReason} />
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>No look-ahead submitted</div>
                )}
              </div>

              {/* Declaration & Comments */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#f1f5f9" }}>Declaration</div>
                {(selectedReport.pendingIssues || selectedReport.finalComments) ? (
                  <>
                    <TextBlock label="Pending Issues" value={selectedReport.pendingIssues} />
                    <TextBlock label="Final Comments" value={selectedReport.finalComments} />
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>No comments</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: selectedReport.declarationConfirmed ? "#22c55e" : "#334155", border: `1px solid ${selectedReport.declarationConfirmed ? "#22c55e" : "#475569"}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Confirmed by contractor</span>
                </div>
              </div>

              {/* Risk Details */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#f1f5f9" }}>Risk Details</div>
                {(selectedReport.riskDescription || selectedReport.riskScale || selectedReport.riskOwners?.filter(Boolean).length > 0) ? (
                  <>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      {selectedReport.riskScale && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 5 }}>Scale</div>
                          <span style={{
                            display: "inline-block", padding: "3px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                            background: selectedReport.riskScale === "High" ? "#450a0a" : selectedReport.riskScale === "Medium" ? "#422006" : "#052e16",
                            color: selectedReport.riskScale === "High" ? "#fca5a5" : selectedReport.riskScale === "Medium" ? "#fcd34d" : "#86efac",
                            border: `1px solid ${selectedReport.riskScale === "High" ? "#7f1d1d" : selectedReport.riskScale === "Medium" ? "#b45309" : "#166534"}`,
                          }}>{selectedReport.riskScale}</span>
                        </div>
                      )}
                      {selectedReport.riskOwners?.filter(Boolean).length > 0 && (
                        <InfoLabel label="Owners">{selectedReport.riskOwners.filter(Boolean).join(", ")}</InfoLabel>
                      )}
                    </div>
                    <TextBlock label="Description" value={selectedReport.riskDescription} />
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✓ No risks reported</div>
                )}
              </div>

              {/* Client Support */}
              <div className="dashboard-summary-card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#f1f5f9" }}>Client Support</div>
                {selectedReport.supportRequired === "Yes" ? (
                  <>
                    {selectedReport.supportTypes?.filter(Boolean).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                        {selectedReport.supportTypes.filter(Boolean).map((t, i) => (
                          <span key={i} style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: "#1e3a5f", color: "#93c5fd", border: "1px solid #1d4ed8" }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <TextBlock label="Description" value={selectedReport.supportDescription} />
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✓ No support required</div>
                )}
              </div>

            </div>

            {/* ── Additional Works — полная ширина ── */}
            <div className="dashboard-summary-card" style={{ marginBottom: 20, borderTop: additionalWorksList.entries.length > 0 ? "3px solid #ea580c" : undefined }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: additionalWorksList.entries.length > 0 ? "#ea580c" : "#111827" }}>Additional Works</div>
              {additionalWorksList.entries.length === 0 ? (
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>✓ No additional works</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 8, marginBottom: 12 }}>
                    {additionalWorksList.entries.map((e, i) => (
                      <div key={i} style={{ background: "#1c1007", border: "1px solid #c2410c", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: e.description ? 5 : 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Report #{e.num} · {e.date}{e.party ? ` · ${e.party}` : ""}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#fdba74", whiteSpace: "nowrap" }}>{e.cost}</span>
                        </div>
                        {e.description && <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>{e.description}</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ paddingTop: 10, borderTop: "1px solid #c2410c", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>Total Additional Works Cost</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#c2410c" }}>{additionalWorksList.total}</span>
                  </div>
                </>
              )}
            </div>

            {/* Фотографии с объекта */}
            {selectedReport.photos?.length > 0 && (
              <div className="dashboard-summary-card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: "#f1f5f9" }}>Site Photos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedReport.photos.map((photo, i) => (
                    <span key={i} style={{ padding: "4px 12px", borderRadius: 8, fontSize: 13, background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1" }}>
                      {typeof photo === "string" ? photo : photo?.name || `Photo ${i + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default WeeklyReports;
