// Audited, intentional legacy fallback. Migrating this import would change
// report-compatibility semantics and is outside the presentation-only G1.10 scope.
// eslint-disable-next-line no-restricted-imports
import { WORK_PACKAGES } from '../../config/workPackages';
import AnalyticalSection from '../shared/detail/AnalyticalSection.jsx';
import AttentionSurface from '../shared/detail/AttentionSurface.jsx';
import EvidenceLedger from '../shared/detail/EvidenceLedger.jsx';
import MetadataRows from '../shared/detail/MetadataRows.jsx';
import PhotoUpload from '../shared/PhotoUpload';
import FormSection from './FormSection';
import LegacyPMTaskRow from './LegacyPMTaskRow';
import SiteVisitDraftRecovery from './SiteVisitDraftRecovery';
import SimpleSiteVisitWorkList from './SimpleSiteVisitWorkList';
import { getGCTaskEntry } from './gcReferenceHelpers';

function SiteVisitFormView({
  project,
  projectReports,
  form,
  set,
  errors,
  submitError,
  submitting,
  canRetry,
  referenceReport,
  handleReferenceChange,
  updateWPTask,
  ganttLoading,
  ganttTasks,
  lastContractorReport,
  pmWpObservations,
  updatePMObservation,
  onSubmit,
  photoUrls,
  projectId,
  onPhotoUpload,
  onPhotoRemove,
  onPhotoError,
  photoError,
  draftCandidate,
  onContinueDraft,
  onDiscardDraft,
  reviewCounts,
  onPhotoItemsChange,
  submitDisabled,
}) {
  const referenceDate = referenceReport
    ? referenceReport.reportingDate || new Date(referenceReport.submittedAt).toLocaleDateString('en-GB')
    : 'No contractor report selected';
  return (
    <div data-testid="pm-site-visit-form" className="field-form-page site-visit-page">
      <div className="site-visit-document">
        <header className="site-visit-header">
          <div className="site-visit-header-main">
            <div>
              <div className="site-visit-eyebrow">PM Site Visit</div>
              <h1>{project.storeCode}{project.shoppingMallName ? ` · ${project.shoppingMallName}` : ''}</h1>
              {project.city && <p>{project.city}</p>}
            </div>
            <div className="site-visit-save-state" role="status">
              <strong>Draft autosave active</strong>
              <span>{reviewCounts.completedCount} verified · {reviewCounts.incompleteCount} untouched</span>
            </div>
          </div>
          <MetadataRows
            className="site-visit-project-context"
            density="compact"
            columns={4}
            items={[
              { label: 'Visit date', value: form.visitDate || 'Required' },
              { label: 'Reference report', value: referenceDate },
              { label: 'General contractor', value: project.generalContractor || 'Not assigned' },
              { label: 'Visit evidence', value: `${photoUrls.length} photo${photoUrls.length === 1 ? '' : 's'}` },
            ]}
          />
        </header>

        {submitError && (
          <AttentionSurface
            title="Site visit not confirmed"
            description={submitError}
            className="site-visit-submit-error"
            accessory={canRetry ? <button type="button" className="btn btn-secondary" onClick={onSubmit}>Retry with the same request</button> : null}
            role="alert"
            aria-live="assertive"
          />
        )}

        <SiteVisitDraftRecovery result={draftCandidate} project={project} onContinue={onContinueDraft} onDiscard={onDiscardDraft} />

        {errors.length > 0 && (
          <div role="alert" aria-live="assertive" tabIndex={-1} autoFocus className="field-form-error-summary site-visit-validation-summary">
            <strong>Complete the required visit fields.</strong>
            <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
          </div>
        )}

        <AnalyticalSection
          title="Visit context"
          description="Choose the visit date and the contractor report used for comparison."
          className="site-visit-context-section"
        >
          <div className="field-form-2col">
            <label className="site-visit-field">
              <span>Visit date</span>
              <input id="site-visit-date" type="date" value={form.visitDate} onChange={(event) => set('visitDate', event.target.value)} />
            </label>
            {ganttTasks.length > 0 ? (
              <div className="site-visit-field">
                <span>Latest contractor report</span>
                <strong className="site-visit-no-report">{lastContractorReport?.report_date || 'No contractor report submitted yet'}</strong>
              </div>
            ) : (
              <label className="site-visit-field">
                <span>Compare against contractor report</span>
                {projectReports.length === 0 ? (
                  <strong className="site-visit-no-report">No contractor reports submitted yet</strong>
                ) : (
                  <select value={form.referenceReportId} onChange={(event) => handleReferenceChange(event.target.value)}>
                    <option value="">— No comparison —</option>
                    {projectReports.map((report) => (
                      <option key={report.id} value={String(report.id)}>
                        {report.reportingDate || new Date(report.submittedAt).toLocaleDateString('en-GB')} — {report.contractor || 'Contractor'}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
          </div>
        </AnalyticalSection>

        {ganttLoading ? (
          <div className="site-visit-loading" role="status">Loading scoped work packages…</div>
        ) : ganttTasks.length > 0 ? (
          <SimpleSiteVisitWorkList tasks={ganttTasks} contractorReport={lastContractorReport} observations={pmWpObservations} onChange={updatePMObservation} />
        ) : (
          <section className="site-visit-legacy-scope" aria-labelledby="site-visit-legacy-title">
            <div className="site-visit-legacy-heading">
              <h2 id="site-visit-legacy-title">Legacy report scope</h2>
              <p>No scoped Gantt plan is available. Existing legacy comparison behavior remains active.</p>
            </div>
            {WORK_PACKAGES.map((workPackage) => (
              <FormSection key={workPackage.id} title={workPackage.name} accentColor="var(--field-accent-orange-fg)">
                {workPackage.tasks.map((task) => (
                  <LegacyPMTaskRow
                    key={task.name}
                    wpId={workPackage.id}
                    taskName={task.name}
                    entry={form.pmWorkPackageStatuses?.[workPackage.id]?.[task.name]}
                    gcEntry={getGCTaskEntry(referenceReport, workPackage.id, task.name)}
                    onChange={(entry) => updateWPTask(workPackage.id, task.name, entry)}
                  />
                ))}
              </FormSection>
            ))}
          </section>
        )}

        <div className="site-visit-supporting-sections">
          <AnalyticalSection
            title="Visit assessment"
            description="This visit-level assessment remains separate from per-work-package discrepancy results."
            className="site-visit-assessment"
          >
            {referenceReport?.projectScheduleStatus && <p className="site-visit-reported-assessment">Contractor reported: <strong>{referenceReport.projectScheduleStatus}</strong></p>}
            <div className="site-visit-assessment-options" role="group" aria-label="PM schedule assessment">
              {['On Track', 'At Risk', 'Critical'].map((label) => (
                <button
                  key={label}
                  type="button"
                  data-testid={`pm-schedule-btn-${label}`}
                  aria-pressed={form.pmScheduleAssessment === label}
                  onClick={() => set('pmScheduleAssessment', label)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="site-visit-note-control">
              <span>Overall visit notes <small>Optional</small></span>
              <textarea
                value={form.observations}
                onChange={(event) => set('observations', event.target.value)}
                rows={4}
                placeholder="Record visit-level observations, concerns, or positive findings."
              />
            </label>
          </AnalyticalSection>

          <AnalyticalSection
            title="Visit evidence"
            description="Photos belong to the visit record. They are not assigned to an individual work package."
            className="site-visit-evidence"
          >
            <EvidenceLedger
              density="compact"
              contained
              items={[
                { label: 'Ownership', value: 'Visit-level evidence', secondary: 'Existing persistence model' },
                { label: 'Attached', value: `${photoUrls.length} photo${photoUrls.length === 1 ? '' : 's'}`, secondary: photoUrls.length ? 'Ready with this visit' : 'No evidence attached yet' },
              ]}
            />
            <PhotoUpload projectId={projectId} existingPaths={photoUrls} onUpload={onPhotoUpload} onRemove={onPhotoRemove} onError={onPhotoError} onItemsChange={onPhotoItemsChange} />
            {photoError && <div role="alert" aria-live="assertive" className="site-visit-photo-error">{photoError}</div>}
          </AnalyticalSection>
        </div>

        <AnalyticalSection title="Declaration" className="site-visit-declaration-section">
          <label className="site-visit-declaration">
            <span
              data-testid="pm-declaration-checkbox"
              role="checkbox"
              tabIndex={0}
              aria-checked={form.declarationConfirmed}
              aria-required="true"
              className={`site-visit-checkbox ${form.declarationConfirmed ? 'is-checked' : ''}`}
              onClick={() => set('declarationConfirmed', !form.declarationConfirmed)}
              onKeyDown={(event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                  event.preventDefault();
                  set('declarationConfirmed', !form.declarationConfirmed);
                }
              }}
            >
              {form.declarationConfirmed && <span aria-hidden="true">✓</span>}
            </span>
            <span>I confirm that these observations reflect the actual site status witnessed during this visit.</span>
          </label>
        </AnalyticalSection>

        <div className="field-form-sticky-submit-spacer" />
        <div className="field-form-sticky-submit site-visit-sticky-actions">
          <span className="site-visit-autosave-note">Draft saves automatically · {reviewCounts.completedCount} verified</span>
          <button
            type="button"
            data-testid="save-site-visit-report"
            className="btn btn-primary site-visit-submit"
            onClick={onSubmit}
            disabled={submitting || submitDisabled}
            aria-busy={submitting}
          >
            {submitting ? 'Submitting site visit…' : reviewCounts.incompleteCount > 0 ? 'Submit partial visit' : 'Submit site visit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SiteVisitFormView;
