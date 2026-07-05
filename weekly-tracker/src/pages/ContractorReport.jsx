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
// TODO wave4: legacy fallback per the ARCHITECTURE NOTE above (audited Wave 4
// Step 4.6 — gated on ganttTasks.length === 0, non-trivial to replace).
import { WORK_PACKAGES } from "../config/workPackages";
import { getProjectGantt } from "../services/ganttService";
import {
  getReportsForProjectForScreens,
  submitReport as submitContractorReport,
} from "../services/contractorReportService";
import { getById as getProjectById } from "../services/projectService";
import { computeWPCumulativeStatuses, computeCumulativeStatuses } from "../utils/reportUtils";
import { calculateProjectProgressResult } from "../engines/progressEngine";
import { useAuth } from "../auth/AuthContext";
import { FormSection } from "../components/contractor/FormParts";
import { WPSection } from "../components/contractor/LegacyWPSection";
import { PhaseSection } from "../components/contractor/GanttWPSection";
import ReportHeaderCard from "../components/contractor/ReportHeaderCard";
import ScheduleRiskSection from "../components/contractor/ScheduleRiskSection";
import SupportWorksSection from "../components/contractor/SupportWorksSection";
import LookAheadDeclarationSection from "../components/contractor/LookAheadDeclarationSection";
import {
  deriveOldPhasesFromPackages,
  getConstructionWeekInfo,
  buildCumulativeWPStatuses,
  makeInitialForm,
} from "../components/contractor/formHelpers";

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
  const [photoUrls, setPhotoUrls] = useState([]);
  const [photoError, setPhotoError] = useState(null);

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
    if (!photoUrls.length) errors.push("At least one photo is required.");
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
        photos: photoUrls,
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
        photoUrls,
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
                setPhotoUrls([]);
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
    <div data-testid="contractor-report-form" className="field-form-page" style={{ minHeight: "100vh", background: "#f0f7f2", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        <ReportHeaderCard
          project={project}
          weekInfo={weekInfo}
          weekPct={weekPct}
          lastReport={lastReport}
          daysSinceLast={daysSinceLast}
          projectReportsCount={projectReports.length}
        />

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

        {/* ── 3-4. Schedule Status & Risk ── */}
        <ScheduleRiskSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />

        {/* ── 5-6. Client Support & Additional Works ── */}
        <SupportWorksSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />

        {/* ── 7-8. Look Ahead & Declaration ── */}
        <LookAheadDeclarationSection
          form={form}
          updateField={updateField}
          photoUrls={photoUrls}
          projectId={project.id}
          onPhotoUpload={(path) => setPhotoUrls((prev) => [...prev, path])}
          onPhotoError={(msg) => setPhotoError(msg)}
        />
        {photoError && (
          <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b" }}>
            {photoError}
          </div>
        )}

        {/* ── Submit ── */}
        <div className="field-form-sticky-submit-spacer" />
        <div className="field-form-sticky-submit">
          <button
            type="button"
            data-testid="save-contractor-report"
            onClick={saveReport}
            style={{
              width: "100%", minHeight: 44, padding: "16px", borderRadius: 12, border: "none",
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
    </div>
  );
}

export default ContractorReport;
