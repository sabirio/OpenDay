import { useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { FieldState } from "../components/shared/FieldPrimitives.jsx";
// TODO wave4: legacy-report fallback (no Gantt plan) — mirrors the same dual-
// format design documented at the top of ContractorReport.jsx. Non-trivial to
// replace with masterTaskLibrary (different task-name vocabulary). Audited
// Wave 4 Step 4.6.
import { loadScopedGanttTasks } from "../hooks/useGanttOrchestration";
import { getLastContractorReport, submitSiteVisitModel, createClientRequestId } from "../hooks/useSiteVisitOrchestration";
import { useAuth } from "../auth/AuthContext";
import GanttSuccessView from "../components/sitevisit/GanttSuccessView";
import ComparisonResultsView from "../components/sitevisit/ComparisonResultsView";
import SiteVisitFormView from "../components/sitevisit/SiteVisitFormView";
import { buildSiteVisitDraft, findSiteVisitDraft, removeSiteVisitDraft, saveSiteVisitDraft, siteVisitReviewCounts, useSiteVisitWorkflow } from "../hooks/useSiteVisitWorkflow";

// ── Main component ─────────────────────────────────────────────────────────

function SiteVisitReport({ projects, reports, onSaveSiteVisit }) {
  const { projectId } = useParams();
  const { user } = useAuth();
  const project = projects.find((p) => String(p.id) === projectId);

  const projectReports = [...(reports.filter((r) => String(r.projectId) === projectId))]
    .sort((a, b) => new Date(b.reportingDate || b.submittedAt) - new Date(a.reportingDate || a.submittedAt));

  const latestReport = projectReports[0] || null;

  const makeInitialForm = () => ({
      visitDate: new Date().toISOString().split("T")[0],
      referenceReportId: latestReport?.id ? String(latestReport.id) : "",
      pmWorkPackageStatuses: {},
      pmScheduleAssessment: "",
      observations: "",
      photos: [],
      declarationConfirmed: false,
    });
  const [draftCandidate, setDraftCandidate] = useState(() => findSiteVisitDraft(localStorage, { userId: user.id, projectId }));
  const [recoveryResolved, setRecoveryResolved] = useState(() => draftCandidate.status === 'missing');
  const [initialRequestId] = useState(createClientRequestId);
  const clientRequestIdRef = useRef(initialRequestId);
  const activeDraftKeyRef = useRef(null);
  const workflow = useSiteVisitWorkflow(initialRequestId);
  const [form, setForm] = useState(makeInitialForm);

  const [errors, setErrors]       = useState([]);
  const [savedVisit, setSavedVisit] = useState(null);
  const [photoUrls, setPhotoUrls] = useState([]);
  const [photoError, setPhotoError] = useState(null);

  const [ganttTasks, setGanttTasks]           = useState([]);
  const [ganttLoading, setGanttLoading]       = useState(true);
  const [lastContractorReport, setLastContractorReport] = useState(null);
  const [pmWpObservations, setPmWpObservations] = useState({});

  function clearDraft() { try { removeSiteVisitDraft(localStorage, activeDraftKeyRef.current || draftCandidate.key); } catch { /* unavailable */ } activeDraftKeyRef.current = null; }
  function restoreDraft() { const draft=draftCandidate.draft; if(!draft)return; setForm(draft.formData); setPmWpObservations(draft.observations||{}); setPhotoUrls(draft.evidenceItems.map(item=>item.path)); clientRequestIdRef.current=draft.clientRequestId; activeDraftKeyRef.current=draftCandidate.key; setRecoveryResolved(true); workflow.dispatch({type:'DRAFT_RESTORED',requestId:draft.clientRequestId,currentItemId:draft.currentItemId,currentGroupId:draft.currentGroupId,activeFilter:draft.activeFilter}); }
  function discardDraft() { clearDraft(); const requestId=createClientRequestId(); clientRequestIdRef.current=requestId; setDraftCandidate({status:'missing',draft:null,key:null}); setRecoveryResolved(true); workflow.dispatch({type:'RESET',requestId}); }

  // Persist the draft on every edit — cheap, plain-JSON state, best-effort.
  useEffect(() => {
    if (!recoveryResolved || !workflow.state.dirty) return undefined;
    const timer=window.setTimeout(()=>{try{const draft=buildSiteVisitDraft({userId:user.id,projectId,visitDate:form.visitDate,contractorReportId:lastContractorReport?.id||form.referenceReportId,clientRequestId:clientRequestIdRef.current,formData:form,observations:pmWpObservations,evidenceItems:photoUrls,currentItemId:workflow.state.currentItemId,currentGroupId:workflow.state.currentGroupId,activeFilter:workflow.state.activeFilter,createdAt:draftCandidate.draft?.createdAt});const key=saveSiteVisitDraft(localStorage,draft);if(activeDraftKeyRef.current&&activeDraftKeyRef.current!==key)removeSiteVisitDraft(localStorage,activeDraftKeyRef.current);activeDraftKeyRef.current=key;}catch{/* in-memory state remains */}},500);
    return()=>window.clearTimeout(timer);
  }, [draftCandidate.draft?.createdAt, form, lastContractorReport, photoUrls, pmWpObservations, projectId, recoveryResolved, user.id, workflow.state.activeFilter, workflow.state.currentGroupId, workflow.state.currentItemId, workflow.state.dirty]);

  useEffect(()=>{if(!workflow.state.dirty||workflow.isSubmitted)return undefined;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[workflow.isSubmitted,workflow.state.dirty]);

  useEffect(() => {
    if (!project?.id) return;
    const activeWPIds = project?.scope?.workPackages;
    loadScopedGanttTasks(project.id, activeWPIds)
      .then(tasks => {
        setGanttTasks(tasks);
        // Pre-fill PM observations from current gantt progress. A restored
        // draft's per-task edits win over the server default for that task —
        // mirrors the same merge in ContractorReport.jsx (P2.1).
        const draftObs = recoveryResolved && draftCandidate.draft ? draftCandidate.draft.observations || {} : {};
        setPmWpObservations(draftObs);
      })
      .catch(() => setGanttTasks([]))
      .finally(() => setGanttLoading(false));

    getLastContractorReport(project.id)
      .then(report => setLastContractorReport(report))
      .catch(() => {});
  }, [project?.id, project?.scope?.workPackages, recoveryResolved, draftCandidate.draft]);

  function updatePMObservation(wpId, updates) {
    workflow.dispatch({ type: 'EDIT' });
    setPmWpObservations(prev => ({ ...prev, [wpId]: { ...(prev[wpId] || {}), ...updates } }));
  }

  const effectiveReferenceReportId = form.referenceReportId || (latestReport?.id ? String(latestReport.id) : '');
  const referenceReport = projectReports.find((r) => String(r.id) === String(effectiveReferenceReportId));
  const reviewCounts = siteVisitReviewCounts(ganttTasks, pmWpObservations);

  function set(name, value) { workflow.dispatch({ type: 'EDIT' }); setForm((p) => ({ ...p, [name]: value })); }

  function updateWPTask(wpId, taskName, entry) {
    workflow.dispatch({ type: 'EDIT' });
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
    workflow.dispatch({ type: 'EDIT' });
    setForm((p) => ({ ...p, referenceReportId: newId }));
  }

  function validate() {
    const errs = [];
    if (!form.visitDate) errs.push("Visit date is required.");
    if (ganttTasks.length > 0 && reviewCounts.completedCount === 0) errs.push("Record at least one PM observation before submitting.");
    if (!form.pmScheduleAssessment) errs.push("PM schedule assessment is required.");
    if (!form.declarationConfirmed) errs.push("Declaration confirmation is required.");
    return errs;
  }

  function resetForm() {
    clearDraft();
    setForm(makeInitialForm());
    setPmWpObservations({});
    setSavedVisit(null);
    setErrors([]);
    setPhotoUrls([]);
    const requestId=createClientRequestId(); clientRequestIdRef.current=requestId; workflow.dispatch({type:'RESET',requestId});
  }

  async function submit() {
    if (workflow.isSubmitting || workflow.isSubmitted) return;
    workflow.dispatch({type:'VALIDATE'});
    const errs = validate();
    if (errs.length) { setErrors(errs); workflow.dispatch({type:'VALIDATION_FAILED',errors:errs}); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setErrors([]);
    workflow.dispatch({type:'SUBMIT'});
    let persistedSiteVisitId;
    let idempotentReplay = false;
    try {
      if (ganttTasks.length > 0) {
        // Build from ganttTasks (ordered) rather than pmWpObservations keys so we can
        // include gc_progress for each task to compute discrepancies in the service.
        const contractorEntries = new Map((lastContractorReport?.wps || []).map(item => [item.wpId, item]));
        const wpObservationsArray = ganttTasks.filter(task => pmWpObservations[task.id]).map(task => {
          const v = pmWpObservations[task.id] || {};
          const contractorEntry = contractorEntries.get(task.id);
          return {
            wpId:              task.id,
            observed_progress: v.observed_progress ?? task.actual_progress ?? 0,
            observed_status:   v.observed_status   ?? task.status ?? 'not_started',
            pm_note:           v.pm_note           ?? '',
            gc_progress:       contractorEntry?.progress_pct ?? task.actual_progress ?? 0,
            gc_status:         contractorEntry?.status ?? task.status ?? 'not_started',
          };
        });
        const result = await submitSiteVisitModel(projectId, lastContractorReport?.id || null, wpObservationsArray, {
          visitDate:              form.visitDate,
          visitedBy:              user.id,
          overallNote:            form.observations || '',
          pmScheduleAssessment:   form.pmScheduleAssessment || null,
          photoUrls,
          clientRequestId: clientRequestIdRef.current,
        });
        persistedSiteVisitId = result.siteVisit?.id || null;
        idempotentReplay = result.idempotentReplay === true;
        setSavedVisit({ ...form, ...result.siteVisit, discrepancies: result.discrepancies, idempotentReplay: result.idempotentReplay, _ganttFormat: true });
      } else {
        const visitData = {
          projectId,
          referenceReportId: form.referenceReportId || null,
          ...form,
          visitedBy: user.id,
          photos: photoUrls,
          photoUrls,
          submittedAt: new Date().toISOString(),
        };
        const saved = await onSaveSiteVisit(visitData);
        persistedSiteVisitId = saved?.id || null;
        setSavedVisit(saved);
      }
      clearDraft();
      workflow.dispatch({type:'SUBMIT_SUCCEEDED',siteVisitId:persistedSiteVisitId,idempotentReplay});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Failed to submit site visit:", err);
      workflow.dispatch({type:'SUBMIT_FAILED',retryable:err?.retryable===true,error:err?.message || "The visit could not be confirmed. Your draft is still saved; retry when the connection is available."});
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (!project) {
    return (
      <FieldState mode="sitevisit" icon="🏗" title="Project not found" body="This link is invalid or the project has been removed."/>
    );
  }

  if (workflow.isSubmitted && savedVisit?._ganttFormat) {
    return (
      <GanttSuccessView
        project={project}
        form={form}
        ganttTasks={ganttTasks}
        discrepancies={savedVisit.discrepancies}
        idempotentReplay={workflow.state.idempotentReplay}
        observedCount={reviewCounts.completedCount}
        onNewVisit={resetForm}
      />
    );
  }

  if (workflow.isSubmitted && savedVisit) {
    return (
      <ComparisonResultsView
        project={project}
        projectReports={projectReports}
        savedVisit={savedVisit}
        onNewVisit={resetForm}
      />
    );
  }

  return (
    <SiteVisitFormView
      project={project}
      projectReports={projectReports}
      form={{...form, referenceReportId: effectiveReferenceReportId}}
      set={set}
      errors={errors}
      submitError={workflow.state.formError}
      submitting={workflow.isSubmitting}
      canRetry={workflow.canRetry}
      referenceReport={referenceReport}
      handleReferenceChange={handleReferenceChange}
      updateWPTask={updateWPTask}
      ganttLoading={ganttLoading}
      ganttTasks={ganttTasks}
      lastContractorReport={lastContractorReport}
      pmWpObservations={pmWpObservations}
      updatePMObservation={updatePMObservation}
      reviewCounts={reviewCounts}
      onSubmit={submit}
      photoUrls={photoUrls}
      projectId={project.id}
      onPhotoUpload={(paths) => {workflow.dispatch({type:'EDIT'});setPhotoUrls((prev) => [...prev, ...paths]);}}
      onPhotoRemove={(path) => {workflow.dispatch({type:'EDIT'});setPhotoUrls((prev) => prev.filter((p) => p !== path));}}
      onPhotoItemsChange={(items)=>workflow.dispatch({type:'UPLOADS_CHANGED',items})}
      onPhotoError={(msg) => setPhotoError(msg)}
      photoError={photoError}
      draftCandidate={recoveryResolved?null:draftCandidate}
      onContinueDraft={restoreDraft}
      onDiscardDraft={discardDraft}
      submitDisabled={!recoveryResolved||workflow.submitBlocked}
      idempotentReplay={workflow.state.idempotentReplay}
    />
  );
}

export default SiteVisitReport;
