import { normalizeReport } from "../services/reportService";
import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { getProjectGantt } from "../services/ganttService";
import {
  getReportsForProjectForScreens,
  submitReport as submitContractorReport,
} from "../services/contractorReportService";
import { getById as getProjectById } from "../services/projectService";
import { computeWPCumulativeStatuses, computeCumulativeStatuses } from "../utils/reportUtils";
import { calculateProjectProgressResult, calculateRawWPAverageProgress } from "../engines/progressEngine";
import {
  LoadingReportState,
  ProjectNotFoundState,
  SubmittedReportState,
} from "../components/contractor/ContractorReportStates";
import PhotoErrorAlert from "../components/contractor/PhotoErrorAlert";
import ReportHeaderCard from "../components/contractor/ReportHeaderCard";
import ReportingWorkPackagesSection from "../components/contractor/ReportingWorkPackagesSection";
import ScheduleRiskSection from "../components/contractor/ScheduleRiskSection";
import StickySubmitBar from "../components/contractor/StickySubmitBar";
import SupportWorksSection from "../components/contractor/SupportWorksSection";
import ValidationErrors from "../components/contractor/ValidationErrors";
import WorkPackageProgressSection from "../components/contractor/WorkPackageProgressSection";
import LookAheadDeclarationSection from "../components/contractor/LookAheadDeclarationSection";
import {
  deriveOldPhasesFromPackages,
  getConstructionWeekInfo,
  buildCumulativeWPStatuses,
  makeInitialForm,
  validateContractorReport,
} from "../components/contractor/formHelpers";


function ContractorReport({ projects, reports }) {
  const { projectId } = useParams();
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

  // P2.1: draft-save/recovery. A contractor filling this out on a phone on
  // site can lose the whole form to a dropped connection, the phone locking,
  // or switching apps mid-fill — there was no recovery path at all before
  // this. One JSON blob per project in localStorage; cleared on successful
  // submit or explicit discard. Restored silently (no banner) — the form
  // just comes back the way the contractor left it.
  const draftKey = `contractor_draft_${projectId}`;

  function readDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }

  const [form, setForm] = useState(() => {
    const draft = readDraft();
    return draft?.form ? draft.form : makeInitialForm(null, null);
  });
  const prefillDone = useRef(Boolean(readDraft()?.form));

  useEffect(() => {
    // Wait for reports to load before prefilling (prevReport is null until Supabase responds)
    if (prevReport && !prefillDone.current) {
      prefillDone.current = true;
      setForm(makeInitialForm(prevReport, cumulativeWPStatuses));
    }
  }, [prevReport, cumulativeWPStatuses]);

  const [ganttTasks, setGanttTasks] = useState([]);
  const [ganttLoading, setGanttLoading] = useState(false);
  const [ganttWpProgress, setGanttWpProgress] = useState(() => readDraft()?.ganttWpProgress || {});

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
        // even if the user submits without touching any slider. A restored
        // draft's per-task edits win over the server default for that task —
        // this only ever narrows (server defaults fill in tasks the draft
        // doesn't have an opinion on), never discards draft input.
        const draftProgress = readDraft()?.ganttWpProgress || {};
        const initial = {};
        for (const t of tasks) {
          initial[t.id] = draftProgress[t.id] ?? {
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
  const [submitting, setSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState(() => readDraft()?.photoUrls || []);
  const [photoError, setPhotoError] = useState(null);
  const [photosUploading, setPhotosUploading] = useState(false);

  // Persist the draft on every edit. Small, plain-JSON state — cheap to
  // stringify on each change; guarded against private-browsing/quota errors.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({ form, ganttWpProgress, photoUrls, savedAt: new Date().toISOString() }));
    } catch { /* private browsing / quota exceeded — draft save is best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, ganttWpProgress, photoUrls]);

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

  async function saveReport() {
    if (!project) return;
    if (submitting) return;
    // Defense in depth: the Submit button is disabled while photosUploading, but
    // guard here too — a photo's compress+upload is async and validateContractorReport
    // only sees photoUrls once it resolves, so submitting mid-upload would otherwise
    // reject a report that visibly has a photo attached.
    if (photosUploading) {
      setValidationErrors(["Please wait for the photo to finish uploading before submitting."]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const errors = validateContractorReport(form, photoUrls);
    if (errors.length) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setValidationErrors([]);
    setSubmitting(true);

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

      // P1.4: this is a RAW, unweighted average of this single report's WP
      // percentages — NOT the canonical phase-weighted progress. It becomes
      // contractor_reports.overall_progress (the "what the contractor just
      // submitted" signal), distinct from cumulativeProgress above (canonical
      // calculateProjectProgressResult() output across all reports to date),
      // which becomes progress_history.overall_progress — the official number
      // every other screen treats as "the" project progress. Do not let this
      // raw average silently become official progress: the RPC
      // (018_submit_contractor_report_rpc.sql) only falls back to it for
      // progress_history when cumulativeProgress is missing, so always send
      // cumulativeProgress explicitly, as this call does.
      const contractorRawAverageProgress = calculateRawWPAverageProgress(wpProgressArray, cumulativeProgress);

      await submitContractorReport(project.id, wpProgressArray, {
        reportDate: mainReportPayload.reportingDate,
        overallProgress: contractorRawAverageProgress,
        masterReportId: mainReportPayload.id,
        reportSnapshot: mainReportPayload,
        cumulativeProgress,
        photoUrls,
      });

      clearDraft();
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit report:", err);
      alert("Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!project && contextLoading) {
    return <LoadingReportState />;
  }

  if (!project) {
    return <ProjectNotFoundState message={contextError} />;
  }

  if (submitted) {
    return (
      <SubmittedReportState
        project={project}
        onSubmitAnother={() => {
          prefillDone.current = false;
          setForm(makeInitialForm(prevReport, cumulativeWPStatuses));
          setPhotoUrls([]);
          setSubmitted(false);
        }}
        onClose={() => window.history.back()}
      />
    );
  }

  const startDate = project.constructionStartDate ? new Date(project.constructionStartDate) : null;
  const endDate = project.constructionEndDate ? new Date(project.constructionEndDate) : null;
  const refDate = form.reportingDate ? new Date(form.reportingDate) : new Date();
  const weekInfo = startDate && endDate ? getConstructionWeekInfo(startDate, endDate, refDate) : null;
  const weekPct = weekInfo && weekInfo.totalWeeks > 0 ? Math.round((weekInfo.weekNumber / weekInfo.totalWeeks) * 100) : 0;

  const lastReportDate = prevReport ? new Date(prevReport.reportingDate || prevReport.submittedAt) : null;
  const daysSinceLast = lastReportDate ? Math.floor((new Date() - lastReportDate) / 86400000) : null;


  return (
    <div data-testid="contractor-report-form" className="field-form-page" style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        <ReportHeaderCard
          project={project}
          weekInfo={weekInfo}
          weekPct={weekPct}
          lastReport={prevReport}
          daysSinceLast={daysSinceLast}
          projectReportsCount={projectReportsForPrefill.length}
        />

        <ValidationErrors errors={validationErrors} />

        <ReportingWorkPackagesSection
          reportingDate={form.reportingDate}
          selectedPackages={form.currentPackages || []}
          ganttTasks={ganttTasks}
          ganttLoading={ganttLoading}
          onReportingDateChange={(value) => updateField("reportingDate", value)}
          onTogglePackage={togglePackage}
        />

        <WorkPackageProgressSection
          ganttLoading={ganttLoading}
          ganttTasks={ganttTasks}
          ganttWpProgress={ganttWpProgress}
          onUpdateProgress={updateWPProgress}
          projectId={project.id}
          form={form}
          prevReport={prevReport}
          onLegacyChange={updateWPStatuses}
        />

        {/* в”Ђв”Ђ 3-4. Schedule Status & Risk в”Ђв”Ђ */}
        <ScheduleRiskSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />

        {/* в”Ђв”Ђ 5-6. Client Support & Additional Works в”Ђв”Ђ */}
        <SupportWorksSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />

        {/* в”Ђв”Ђ 7-8. Look Ahead & Declaration в”Ђв”Ђ */}
        <LookAheadDeclarationSection
          form={form}
          updateField={updateField}
          photoUrls={photoUrls}
          projectId={project.id}
          onPhotoUpload={(paths) => setPhotoUrls((prev) => [...prev, ...paths])}
          onPhotoRemove={(path) => setPhotoUrls((prev) => prev.filter((p) => p !== path))}
          onPhotoError={(msg) => setPhotoError(msg)}
          onPhotoUploadingChange={setPhotosUploading}
        />
        <PhotoErrorAlert message={photoError} />

        {/* в”Ђв”Ђ Submit в”Ђв”Ђ */}
        <StickySubmitBar
          onSubmit={saveReport}
          disabled={submitting || photosUploading}
          label={submitting ? "Submitting..." : photosUploading ? "Uploading photo…" : "Submit Weekly Report"}
        />

      </div>
    </div>
  );
}

export default ContractorReport;
