import { WORK_PACKAGES } from "../../config/workPackages";
import FormSection, { ACCENT } from "./FormSection";
import LegacyPMTaskRow from "./LegacyPMTaskRow";
import GanttPMTaskRow from "./GanttPMTaskRow";
import { getGCTaskEntry } from "./gcReferenceHelpers";
import PhotoUpload from "../shared/PhotoUpload";
import { isZonedTemplate, groupGanttTasksByZone } from "../../hooks/useWPGrouping";

function SiteVisitFormView({
  project, projectReports, form, set, errors,
  referenceReport, handleReferenceChange, updateWPTask,
  ganttLoading, ganttTasks, pmWpObservations, updatePMObservation,
  onSubmit,
  photoUrls, projectId, onPhotoUpload, onPhotoRemove, onPhotoError, photoError,
  draftRestored, onDiscardDraft,
}) {
  return (
    <div data-testid="pm-site-visit-form" className="field-form-page" style={{ minHeight: "100vh", background: "var(--field-bg-sitevisit)", padding: "36px 20px 80px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {draftRestored && (
          <div data-testid="draft-restored-banner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "var(--field-info-bg)", border: "1px solid var(--field-info-border)", borderRadius: 12, padding: "10px 16px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--field-info-fg-dark)", fontWeight: 600 }}>Restored your unsaved draft for this site visit.</span>
            <button
              type="button"
              onClick={onDiscardDraft}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--field-info-border)", background: "white", color: "var(--field-info-fg-dark)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Discard draft
            </button>
          </div>
        )}

        {/* Header card */}
        <div style={{ background: "white", borderRadius: 16, border: "1px solid var(--field-border)", padding: "24px 28px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: ACCENT, marginBottom: 6 }}>PM Site Visit Report</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--field-text-heading)", lineHeight: 1.1 }}>{project.storeCode}</div>
              <div style={{ color: "var(--field-text-secondary)", fontSize: 14, marginTop: 4 }}>
                {project.shoppingMallName}{project.city ? ` · ${project.city}` : ""}
              </div>
            </div>
            {project.projectManager && (
              <div style={{ background: "var(--field-info-bg)", border: "1px solid var(--field-info-border)", borderRadius: 12, padding: "10px 18px", textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT, marginBottom: 4 }}>Project Manager</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--field-text-heading)" }}>{project.projectManager}</div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", paddingTop: 16, borderTop: "1px solid var(--field-bg-subtle)" }}>
            {project.generalContractor && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>General Contractor</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.generalContractor}</div>
            </div>}
            {project.constructionStartDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Construction Start</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.constructionStartDate}</div>
            </div>}
            {project.constructionEndDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Construction End</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.constructionEndDate}</div>
            </div>}
            {project.targetOpeningDate && <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>Target Opening</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{project.targetOpeningDate}</div>
            </div>}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 3 }}>GC Reports</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--field-text-heading)" }}>{projectReports.length} submitted</div>
            </div>
          </div>
        </div>

        {/* Validation errors */}
        {errors.length > 0 && (
          <div style={{ background: "var(--field-danger-bg)", border: "1px solid var(--field-danger-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "var(--field-danger-fg-dark)", marginBottom: 8, fontSize: 13 }}>Please fix the following required fields:</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--field-danger-fg-dark)", fontSize: 13, lineHeight: 1.8 }}>
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* 1. Visit Info */}
        <FormSection title="Visit Information" accentColor={ACCENT}>
          <div className="field-form-2col">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Visit Date</div>
              <input type="date" value={form.visitDate} onChange={(e) => set("visitDate", e.target.value)}
                style={{ height: 42, padding: "0 14px", border: "1px solid var(--field-border-strong)", borderRadius: 10, fontSize: 14, color: "var(--field-text-heading)", background: "white", outline: "none", width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Compare Against GC Report</div>
              {projectReports.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--field-warning-fg)", fontWeight: 600, padding: "10px 14px", background: "var(--field-warning-bg-subtle)", borderRadius: 10, border: "1px solid var(--field-warning-border)" }}>
                  No contractor reports submitted yet
                </div>
              ) : (
                <select value={form.referenceReportId} onChange={(e) => handleReferenceChange(e.target.value)}
                  style={{ height: 42, padding: "0 14px", border: "1px solid var(--field-border-strong)", borderRadius: 10, fontSize: 13, color: "var(--field-text-heading)", background: "white", outline: "none", width: "100%", cursor: "pointer" }}>
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
            <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--field-info-bg)", borderRadius: 10, border: "1px solid var(--field-info-border)", fontSize: 12, color: "var(--field-info-fg-dark)" }}>
              Comparing against <strong>{referenceReport.reportingDate || new Date(referenceReport.submittedAt).toLocaleDateString("en-GB")}</strong>
              {" · "}Schedule: <strong>{referenceReport.projectScheduleStatus || "—"}</strong>
              {referenceReport.workPackageStatuses
                ? <span style={{ marginLeft: 8, padding: "1px 6px", background: "var(--field-accent-sitevisit)", color: "white", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>WP Format</span>
                : <span style={{ marginLeft: 8, padding: "1px 6px", background: "var(--field-text-muted)", color: "white", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Legacy Format</span>
              }
            </div>
          )}
        </FormSection>

        {/* 2. Work Package Observation Sections */}
        {ganttLoading ? (
          <FormSection title="Work Package Observations" accentColor={ACCENT}>
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--field-text-muted)', fontSize: 13 }}>Loading schedule…</div>
          </FormSection>
        ) : ganttTasks.length > 0 && isZonedTemplate(project.templateType) ? (
          (() => {
            const zones = groupGanttTasksByZone(ganttTasks, project.templateType);
            return [...zones.entries()].map(([zoneId, zone]) => (
              <div key={zoneId} style={{ marginBottom: 8 }}>
                <h2 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--field-text-secondary)', margin: '0 0 8px 4px' }}>
                  {zone.zoneLabel}
                </h2>
                {[...zone.categories.entries()].map(([categoryId, { categoryLabel, tasks }]) => (
                  <FormSection key={`${zoneId}.${categoryId}`} title={categoryLabel} accentColor={ACCENT}>
                    {tasks.map(task => (
                      <GanttPMTaskRow
                        key={task.id}
                        task={task}
                        pmEntry={pmWpObservations[task.id]}
                        onChange={updates => updatePMObservation(task.id, updates)}
                      />
                    ))}
                  </FormSection>
                ))}
              </div>
            ));
          })()
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
            <FormSection key={wp.id} title={wp.name} accentColor="var(--field-accent-orange-fg)">
              {wp.tasks.map((task) => (
                <LegacyPMTaskRow
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
        <FormSection title="PM Assessment" accentColor="var(--field-accent-slate)">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 6 }}>Schedule Assessment (PM view)</div>
            {referenceReport?.projectScheduleStatus && (
              <div style={{ fontSize: 12, color: "var(--field-text-secondary)", marginBottom: 10 }}>GC reported: <strong>{referenceReport.projectScheduleStatus}</strong></div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "On Track", bg: "var(--field-success-bg)", color: "var(--field-success-fg-dark)", border: "var(--field-success-border)" },
                { label: "At Risk",  bg: "var(--field-warning-bg)", color: "var(--field-warning-fg-dark)", border: "var(--field-warning-border)" },
                { label: "Critical", bg: "var(--field-danger-bg)", color: "var(--field-danger-fg-dark)", border: "var(--field-danger-fg)" },
              ].map(({ label, bg, color, border }) => {
                const sel = form.pmScheduleAssessment === label;
                return (
                  <button key={label} type="button"
                    data-testid={`pm-schedule-btn-${label}`}
                    onClick={() => set("pmScheduleAssessment", label)} style={{
                    padding: "9px 24px", borderRadius: 10,
                    border: `2px solid ${sel ? border : "var(--field-border)"}`,
                    background: sel ? bg : "white",
                    color: sel ? color : "var(--field-text-muted)",
                    fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer",
                  }}>{label}</button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Site Observations & Notes</div>
            <textarea value={form.observations} onChange={(e) => set("observations", e.target.value)}
              rows={4} placeholder="Record key observations, concerns, or positive findings from the site visit..."
              style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--field-border-strong)", borderRadius: 10, fontSize: 13, color: "var(--field-text-body)", resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.6, background: "var(--field-bg-faint)", boxSizing: "border-box" }}
              onFocus={(e) => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px rgba(8,145,178,0.1)`; }}
              onBlur={(e)  => { e.target.style.borderColor = "var(--field-border-strong)"; e.target.style.boxShadow = "none"; }}
            />
          </div>
        </FormSection>

        {/* 4. Photos */}
        <FormSection title="Site Photos" accentColor="var(--field-text-secondary)">
          <PhotoUpload projectId={projectId} onUpload={onPhotoUpload} onRemove={onPhotoRemove} onError={onPhotoError} />
          {photoUrls.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--field-text-muted)", marginTop: 8 }}>{photoUrls.length} photo{photoUrls.length > 1 ? "s" : ""} attached</p>
          )}
          {photoError && (
            <div style={{ marginTop: 10, background: "var(--field-danger-bg)", border: "1px solid var(--field-danger-border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--field-danger-fg-dark)" }}>
              {photoError}
            </div>
          )}
        </FormSection>

        {/* 5. Declaration */}
        <FormSection title="Declaration" accentColor="var(--field-accent-slate)">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <div
              data-testid="pm-declaration-checkbox"
              onClick={() => set("declarationConfirmed", !form.declarationConfirmed)}
              style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${form.declarationConfirmed ? ACCENT : "var(--field-border-strong)"}`,
                background: form.declarationConfirmed ? ACCENT : "white",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              {form.declarationConfirmed && <span style={{ color: "white", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: "var(--field-text-body)", lineHeight: 1.6, fontWeight: 500 }}>
              I confirm that the observations recorded reflect the actual site status as witnessed during this visit.
            </span>
          </label>
        </FormSection>

        {/* Submit */}
        <div className="field-form-sticky-submit-spacer" />
        <div className="field-form-sticky-submit">
          <button type="button" data-testid="save-site-visit-report" onClick={onSubmit}
            style={{ width: "100%", minHeight: 44, padding: "16px", borderRadius: 12, border: "none", background: `linear-gradient(135deg, ${ACCENT} 0%, var(--field-accent-sitevisit-2) 100%)`, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em", boxShadow: "0 4px 14px rgba(8,145,178,0.35)" }}>
            Submit Site Visit Report
          </button>
        </div>

      </div>
    </div>
  );
}

export default SiteVisitFormView;
