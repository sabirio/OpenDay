import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  loadContractorReportFallbackContext,
  submitContractorReportModel,
  createClientRequestId,
} from "../hooks/useContractorReportOrchestration";
import { loadScopedGanttTasks } from "../hooks/useGanttOrchestration";
import { buildCumulativeWPStatuses, daysSince } from "../utils/reportUtils";
import { getConstructionWeekInfo, getConstructionWeekPercent } from "../utils/scheduleUtils";
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

    loadContractorReportFallbackContext(projectId, {
      hasProject: projects.some((p) => String(p.id) === projectId),
      hasReports: reports.length > 0,
    })
      .then(({ loadedProject, loadedReports }) => {
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
  const clientRequestIdRef = useRef(readDraft()?.clientRequestId || createClientRequestId());

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

      const activeWPIds = project?.scope?.workPackages;
      const tasks = await loadScopedGanttTasks(project.id, activeWPIds);

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
      localStorage.setItem(draftKey, JSON.stringify({ form, ganttWpProgress, photoUrls, clientRequestId: clientRequestIdRef.current, savedAt: new Date().toISOString() }));
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

      // Synthesis (Gantt slider inputs -> workPackageStatuses), normalization,
      // and cumulative-progress math all live in submitContractorReportModel
      // (core/contractorReport) — this page only supplies the raw form state.
      await submitContractorReportModel({
        project, form, photoUrls, prevReport, ganttTasks, ganttWpProgress, reports, currentPhases,
        clientRequestId: clientRequestIdRef.current,
      });

      clearDraft();
      clientRequestIdRef.current = createClientRequestId();
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
          clientRequestIdRef.current = createClientRequestId();
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
  const weekPct = getConstructionWeekPercent(weekInfo);

  const daysSinceLast = prevReport ? daysSince(prevReport.reportingDate || prevReport.submittedAt) : null;


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
          templateType={project.templateType}
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
