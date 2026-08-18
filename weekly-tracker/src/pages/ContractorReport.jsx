import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
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
import { ClientSupportSection } from "../components/contractor/SupportWorksSection";
import ValidationErrors from "../components/contractor/ValidationErrors";
import WorkPackageProgressSection from "../components/contractor/WorkPackageProgressSection";
import { EvidenceDeclarationSection, ForwardCommitmentsSection } from "../components/contractor/LookAheadDeclarationSection";
import DraftRecoveryBanner from "../components/contractor/DraftRecoveryBanner";
import { buildContractorDraftEnvelope, findContractorDraft, removeContractorDraft, saveContractorDraft, useContractorReportWorkflow } from "../hooks/useContractorReportWorkflow";
import {
  deriveOldPhasesFromPackages,
  makeInitialForm,
  validateContractorReport,
} from "../components/contractor/formHelpers";


function ContractorReport({ projects, reports }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const [fallbackProject, setFallbackProject] = useState(null);
  const [fallbackReports, setFallbackReports] = useState([]);
  const [contextLoading, setContextLoading] = useState(() => !projects.some((p) => String(p.id) === projectId) || reports.length === 0);
  const [contextError, setContextError] = useState(null);
  const project = projects.find((p) => String(p.id) === projectId) || fallbackProject;
  const reportSource = reports.length > 0 ? reports : fallbackReports;

  useEffect(() => {
    if (projects.some((p) => String(p.id) === projectId) && reports.length > 0) return;

    let isMounted = true;
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

  const draftIdentity = useMemo(() => ({ userId: user.id, projectId }), [user.id, projectId]);
  const [draftCandidate, setDraftCandidate] = useState(() => findContractorDraft(localStorage, { userId: user.id, projectId }));
  const [recoveryResolved, setRecoveryResolved] = useState(() => draftCandidate.status === 'missing');
  const [initialRequestId] = useState(createClientRequestId);
  const clientRequestIdRef = useRef(initialRequestId);
  const activeDraftKeyRef = useRef(null);
  const [form, setForm] = useState(() => makeInitialForm(null, null));
  const prefillDone = useRef(false);
  const workflow = useContractorReportWorkflow(initialRequestId);

  function clearDraft() {
    try { removeContractorDraft(localStorage, activeDraftKeyRef.current || draftCandidate.key); } catch { /* storage unavailable */ }
    activeDraftKeyRef.current = null;
  }

  function restoreDraft() {
    const draft = draftCandidate.draft;
    if (!draft) return;
    setForm(draft.formData);
    setGanttWpProgress(draft.workPackageRows || {});
    setPhotoUrls((draft.evidenceItems || []).filter(item => item.status === 'uploaded').map(item => item.path));
    clientRequestIdRef.current = draft.clientRequestId;
    activeDraftKeyRef.current = draftCandidate.key;
    prefillDone.current = true;
    setRecoveryResolved(true);
    workflow.dispatch({ type: 'DRAFT_RESTORED', requestId: draft.clientRequestId, updatedAt: draft.updatedAt });
  }

  function discardDraft() {
    clearDraft();
    const nextId = createClientRequestId();
    clientRequestIdRef.current = nextId;
    setDraftCandidate({ status: 'missing', draft: null, key: null });
    setRecoveryResolved(true);
    workflow.dispatch({ type: 'RESET', requestId: nextId });
  }

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

      const activeWPIds = project?.scope?.workPackages;
      const tasks = await loadScopedGanttTasks(project.id, activeWPIds);

      if (isMounted) {
        setGanttTasks(tasks);
        // Pre-fill progress state from DB so overallProgress is correct
        // even if the user submits without touching any slider. A restored
        // draft's per-task edits win over the server default for that task —
        // this only ever narrows (server defaults fill in tasks the draft
        // doesn't have an opinion on), never discards draft input.
        const draftProgress = recoveryResolved && draftCandidate.draft ? draftCandidate.draft.workPackageRows || {} : {};
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
}, [project?.id, project?.scope?.workPackages, recoveryResolved, draftCandidate.draft]);

  function updateWPProgress(wpId, updates) {
    workflow.dispatch({ type: 'EDIT' });
    setGanttWpProgress(prev => ({ ...prev, [wpId]: { ...(prev[wpId] || {}), ...updates } }));
  }

  const [validationErrors, setValidationErrors] = useState([]);
  const validationSummaryRef = useRef(null);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [photoError, setPhotoError] = useState(null);
  const [photosUploading, setPhotosUploading] = useState(false);

  useEffect(() => {
    if (!recoveryResolved || !workflow.state.dirty) return undefined;
    const timer = window.setTimeout(() => {
      try {
        const draft = buildContractorDraftEnvelope({
          ...draftIdentity, reportDate: form.reportingDate, reportPeriod: form.reportingDate,
          clientRequestId: clientRequestIdRef.current, formData: form,
          workPackageRows: ganttWpProgress, evidenceItems: photoUrls,
          createdAt: draftCandidate.draft?.createdAt,
        });
        const nextKey = saveContractorDraft(localStorage, draft);
        if (activeDraftKeyRef.current && activeDraftKeyRef.current !== nextKey) removeContractorDraft(localStorage, activeDraftKeyRef.current);
        activeDraftKeyRef.current = nextKey;
      } catch { /* private browsing / quota exceeded — form remains in memory */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftCandidate.draft?.createdAt, draftIdentity, form, ganttWpProgress, photoUrls, recoveryResolved, workflow.state.dirty]);

  useEffect(() => {
    if (!workflow.state.dirty || workflow.isSubmitted) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [workflow.isSubmitted, workflow.state.dirty]);

  useEffect(() => {
    if (validationErrors.length > 0) validationSummaryRef.current?.focus();
  }, [validationErrors]);

  function updateField(name, value) {
    workflow.dispatch({ type: 'EDIT' });
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function togglePackage(wpId) {
    workflow.dispatch({ type: 'EDIT' });
    setForm((prev) => {
      const cur = prev.currentPackages || [];
      const next = cur.includes(wpId) ? cur.filter((id) => id !== wpId) : [...cur, wpId];
      return { ...prev, currentPackages: next };
    });
  }

  function updateWPStatuses(wpId, pkgStatuses) {
    workflow.dispatch({ type: 'EDIT' });
    setForm((prev) => ({
      ...prev,
      workPackageStatuses: { ...prev.workPackageStatuses, [wpId]: pkgStatuses },
    }));
  }

  function toggleCheckbox(fieldName, value) {
    workflow.dispatch({ type: 'EDIT' });
    setForm((prev) => {
      const cur = prev[fieldName];
      return { ...prev, [fieldName]: cur.includes(value) ? cur.filter((i) => i !== value) : [...cur, value] };
    });
  }

  async function saveReport() {
    if (!project) return;
    if (workflow.isSubmitting || workflow.isSubmitted) return;
    workflow.dispatch({ type: 'VALIDATE' });
    // Defense in depth: the Submit button is disabled while photosUploading, but
    // guard here too — a photo's compress+upload is async and validateContractorReport
    // only sees photoUrls once it resolves, so submitting mid-upload would otherwise
    // reject a report that visibly has a photo attached.
    if (photosUploading) {
      setValidationErrors(["Please wait for the photo to finish uploading before submitting."]);
      workflow.dispatch({ type: 'VALIDATION_FAILED', errors: ["Please wait for the photo to finish uploading before submitting."] });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const errors = validateContractorReport(form, photoUrls);
    if (errors.length) {
      setValidationErrors(errors);
      workflow.dispatch({ type: 'VALIDATION_FAILED', errors });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setValidationErrors([]);
    workflow.dispatch({ type: 'SUBMIT' });

    try {
      const currentPhases = deriveOldPhasesFromPackages(form.currentPackages);

      // Synthesis (Gantt slider inputs -> workPackageStatuses), normalization,
      // and cumulative-progress math all live in submitContractorReportModel
      // (core/contractorReport) — this page only supplies the raw form state.
      const result = await submitContractorReportModel({
        project, form, photoUrls, prevReport, ganttTasks, ganttWpProgress, reports, currentPhases,
        clientRequestId: clientRequestIdRef.current,
      });

      clearDraft();
      workflow.dispatch({ type: 'SUBMIT_SUCCEEDED', reportId: result.persistedReportId, idempotentReplay: result.idempotentReplay });
    } catch (err) {
      console.error("Failed to submit report:", err);
      workflow.dispatch({ type: 'SUBMIT_FAILED', retryable: err?.retryable === true, error: err?.message || "The report could not be confirmed. Your draft is still saved; retry when the connection is available." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (!project && contextLoading) {
    return <LoadingReportState />;
  }

  if (!project) {
    return <ProjectNotFoundState message={contextError} />;
  }

  if (workflow.isSubmitted) {
    return (
      <SubmittedReportState
        project={project}
        idempotentReplay={workflow.state.idempotentReplay}
        onSubmitAnother={() => {
          prefillDone.current = false;
          setForm(makeInitialForm(prevReport, cumulativeWPStatuses));
          setPhotoUrls([]);
          const nextId = createClientRequestId();
          clientRequestIdRef.current = nextId;
          workflow.dispatch({ type: 'RESET', requestId: nextId });
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
    <div data-testid="contractor-report-form" className="field-form-page contractor-report-page">
      <div className="contractor-report-document">

        <ReportHeaderCard
          project={project}
          weekInfo={weekInfo}
          weekPct={weekPct}
          lastReport={prevReport}
          daysSinceLast={daysSinceLast}
          projectReportsCount={projectReportsForPrefill.length}
        />

        <DraftRecoveryBanner result={recoveryResolved ? null : draftCandidate} project={project} onContinue={restoreDraft} onDiscard={discardDraft} />

        <ValidationErrors errors={validationErrors} summaryRef={validationSummaryRef} />
        {workflow.state.formError && <div role="alert" aria-live="assertive" className="field-form-error-summary"><strong>Report not confirmed.</strong> {workflow.state.formError} {workflow.canRetry && <button type="button" className="btn-ghost" onClick={saveReport}>Retry with the same request</button>}</div>}

        <section className="contractor-report-group" aria-labelledby="contractor-report-reality-heading">
          <div className="contractor-report-group-heading">
            <span>1</span>
            <div>
              <h2 id="contractor-report-reality-heading">Reporting reality</h2>
              <p>Confirm the period, active work, progress, schedule, and exceptions that are true this week.</p>
            </div>
          </div>
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
            project={project}
          />
          <ScheduleRiskSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />
          <ClientSupportSection form={form} updateField={updateField} toggleCheckbox={toggleCheckbox} />
        </section>

        <section className="contractor-report-group" aria-labelledby="contractor-report-forward-heading">
          <div className="contractor-report-group-heading">
            <span>2</span>
            <div>
              <h2 id="contractor-report-forward-heading">Forward commitments</h2>
              <p>Record next-period activities and disclose anything that blocks them.</p>
            </div>
          </div>
          <ForwardCommitmentsSection form={form} updateField={updateField} />
        </section>

        <section className="contractor-report-group" aria-labelledby="contractor-report-evidence-heading">
          <div className="contractor-report-group-heading">
            <span>3</span>
            <div>
              <h2 id="contractor-report-evidence-heading">Evidence and submission</h2>
              <p>Attach current-period evidence, review comments, and confirm the declaration.</p>
            </div>
          </div>
          <EvidenceDeclarationSection
            form={form}
            updateField={updateField}
            photoUrls={photoUrls}
            projectId={project.id}
            onPhotoUpload={(paths) => { workflow.dispatch({ type: 'EDIT' }); setPhotoUrls((prev) => [...prev, ...paths]); }}
            onPhotoRemove={(path) => { workflow.dispatch({ type: 'EDIT' }); setPhotoUrls((prev) => prev.filter((p) => p !== path)); }}
            onPhotoError={(msg) => setPhotoError(msg)}
            onPhotoUploadingChange={(uploading) => { setPhotosUploading(uploading); workflow.dispatch({ type: 'UPLOADS_CHANGED', items: uploading ? [{ id: 'active-batch', status: 'uploading' }] : photoUrls.map(path => ({ path, status: 'uploaded' })) }); }}
            onPhotoItemsChange={(items) => workflow.dispatch({ type: 'UPLOADS_CHANGED', items })}
          />
        </section>
        <PhotoErrorAlert message={photoError} />

        {/* в”Ђв”Ђ Submit в”Ђв”Ђ */}
        <StickySubmitBar
          onSubmit={saveReport}
          disabled={!recoveryResolved || workflow.submitBlocked || photosUploading}
          label={workflow.isSubmitting ? "Submitting…" : photosUploading ? "Uploading photo…" : "Submit Weekly Report"}
        />

      </div>
    </div>
  );
}

export default ContractorReport;
