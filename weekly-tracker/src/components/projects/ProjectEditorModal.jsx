import { Field, FieldRow, FormSection } from "./ProjectFormParts";
import ConflictWarning from "../ConflictWarning";
import { TEMPLATES } from "../../config/projectTemplates";
import { PROJECT_TYPE_OPTIONS, LOCATION_TYPE_OPTIONS, STORE_CONCEPT_SUGGESTIONS } from "../../config/projectVocabulary";
import { V2_TEMPLATE_TYPE } from "../../domains/construction/templates/retailFitoutV2";
import { clamp } from "../../hooks/useChartMathPresentation";
import Modal from "../shared/Modal";

export default function ProjectEditorModal({
  project,
  editingProjectId,
  onChange,
  onProjectPatch,
  onOpenScopeConfigurator,
  onDelete,
  onSave,
  onClose,
  conflict,
  onDiscardConflict,
  onOverwriteConflict,
  isDirty = false,
}) {
  if (!project) return null;

  // Cancel/x are explicit close actions, same as Escape/backdrop — should
  // carry the same dirty-state protection rather than bypassing it.
  function requestClose() {
    if (isDirty && !window.confirm("Discard unsaved project changes?")) return;
    onClose();
  }

  return (
    <Modal
      onClose={onClose}
      titleId="project-editor-title"
      isDirty={isDirty}
      dirtyMessage="Discard unsaved project changes?"
      className="modal project-editor-modal"
      style={{ maxWidth: 820, width: "95vw" }}
    >
        <div className="modal-header">
          <div>
            <h2 id="project-editor-title" style={{ margin: 0 }}>{editingProjectId ? "Edit Project" : "New Project"}</h2>
            {project.storeCode && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{project.storeCode}</div>
            )}
          </div>
          <button type="button" className="close-button" onClick={requestClose} aria-label="Close project editor">×</button>
        </div>

        <div className="project-editor-body">
          {conflict && (
            <ConflictWarning
              serverUpdatedAt={conflict.serverUpdatedAt}
              onDiscard={onDiscardConflict}
              onOverwrite={onOverwriteConflict}
            />
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: 5 }}>Store Code</div>
            <input
              className="ds-input"
              name="storeCode"
              value={project.storeCode}
              onChange={onChange}
              placeholder="e.g. SE001"
              style={{ maxWidth: 200, fontWeight: 700, fontSize: 15 }}
            />
          </div>

          <FormSection title="Identity & Location" accentColor="var(--accent)">
            <FieldRow>
              <Field label="Country">
                <input name="country" value={project.country} onChange={onChange} className="ds-input" placeholder="Country" />
              </Field>
              <Field label="City">
                <input name="city" value={project.city} onChange={onChange} className="ds-input" placeholder="City" />
              </Field>
              <Field label="Sales Market">
                <input name="salesMarket" value={project.salesMarket || ""} onChange={onChange} className="ds-input" placeholder="e.g. Sweden" />
              </Field>
              <Field label="State / Region">
                <input name="state" value={project.state || ""} onChange={onChange} className="ds-input" placeholder="State or region" />
              </Field>
            </FieldRow>

            <div style={{ marginTop: 14 }}>
              <Field label="Location Type">
                <div style={{ display: "flex", gap: 8 }}>
                  {LOCATION_TYPE_OPTIONS.map((opt) => (
                    <button key={opt} type="button"
                      onClick={() => onProjectPatch((p) => ({
                        ...p,
                        locationType: opt,
                        // Clear the field that no longer applies immediately —
                        // toDB() also enforces this defensively at save time,
                        // but doing it here too means the user never sees a
                        // stale value from a prior selection lingering.
                        ...(opt === "Mall" ? { street: "" } : { shoppingMallName: "" }),
                      }))}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                        border: `1.5px solid ${project.locationType === opt ? "var(--status-done)" : "var(--border)"}`,
                        background: project.locationType === opt ? "var(--status-done-bg)" : "var(--accent-subtle)",
                        color: project.locationType === opt ? "var(--status-done)" : "var(--text-muted)",
                      }}>{opt}</button>
                  ))}
                </div>
              </Field>

              <div style={{ marginTop: 12 }}>
                {project.locationType === "Mall" ? (
                  <Field label="Shopping Mall Name">
                    <input name="shoppingMallName" value={project.shoppingMallName || ""} onChange={onChange} className="ds-input" placeholder="Mall name" />
                  </Field>
                ) : project.locationType === "Street" ? (
                  <Field label="Street Address">
                    <input name="street" value={project.street || ""} onChange={onChange} className="ds-input" placeholder="Street address" />
                  </Field>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Select a Location Type to enter the mall name or street address.</div>
                )}
              </div>
            </div>
          </FormSection>

          <FormSection title="Planned Dates" accentColor="var(--status-warn)">
            <FieldRow>
              <Field label="Construction Start Date">
                <input type="date" name="constructionStartDate" value={project.constructionStartDate} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Construction End Date">
                <input type="date" name="constructionEndDate" value={project.constructionEndDate} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Target Opening Date">
                <input type="date" name="targetOpeningDate" value={project.targetOpeningDate} onChange={onChange} className="ds-input" />
              </Field>
            </FieldRow>
          </FormSection>

          {/* Actual dates are observed historical facts (frozen Retail Project
              Profile v1) — deliberately never reused/confused with the planned
              fields above or with the engine-owned forecast fields
              (construction_completion_date/forecast_opening_date), which have
              no input here at all and remain exclusively ganttService-written. */}
          <FormSection title="Actual Dates" accentColor="var(--status-done)">
            <FieldRow>
              <Field label="Actual Construction Start">
                <input type="date" name="actualConstructionStartDate" value={project.actualConstructionStartDate || ""} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Actual Construction Completion">
                <input type="date" name="actualConstructionCompletionDate" value={project.actualConstructionCompletionDate || ""} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Actual Opening">
                <input type="date" name="actualOpeningDate" value={project.actualOpeningDate || ""} onChange={onChange} className="ds-input" />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Areas" accentColor="var(--accent)">
            <FieldRow>
              <Field label="Total Area (m²)">
                <input type="number" min="0" name="storeSizeSqm" value={project.storeSizeSqm ?? ""} onChange={onChange} className="ds-input" placeholder="e.g. 1250" />
              </Field>
              <Field label="Sales Area (m²)">
                <input type="number" min="0" name="salesAreaSqm" value={project.salesAreaSqm ?? ""} onChange={onChange} className="ds-input" placeholder="e.g. 900" />
              </Field>
              <Field label="Back of House Area (m²)">
                <input type="number" min="0" name="backOfHouseAreaSqm" value={project.backOfHouseAreaSqm ?? ""} onChange={onChange} className="ds-input" placeholder="e.g. 350" />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Financial" accentColor="var(--status-warn)">
            <FieldRow>
              <Field label="Budget">
                <input type="number" min="0" name="budget" value={project.budget ?? ""} onChange={onChange} className="ds-input" placeholder="e.g. 2500000" />
              </Field>
              {/* Actual Cost is real known cost — it generally doesn't exist
                  yet at creation time, so it's edit-only (never shown when
                  creating a new project, never defaulted to 0). */}
              {editingProjectId && (
                <Field label="Actual Cost">
                  <input type="number" min="0" name="actualCost" value={project.actualCost ?? ""} onChange={onChange} className="ds-input" placeholder="e.g. 2430000" />
                </Field>
              )}
              <Field label="Currency">
                <input name="currencyCode" value={project.currencyCode || ""} onChange={onChange} className="ds-input" placeholder="e.g. USD" maxLength={3} />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Stakeholders" accentColor="var(--status-done)">
            <FieldRow>
              <Field label="Project Manager">
                <input name="projectManager" value={project.projectManager} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
              <Field label="General Contractor">
                <input name="generalContractor" value={project.generalContractor} onChange={onChange} className="ds-input" placeholder="Company name" />
              </Field>
              <Field label="Security Manager">
                <input name="securityManager" value={project.securityManager || ""} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
              <Field label="IT Manager">
                <input name="itManager" value={project.itManager || ""} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
              <Field label="Facility Manager">
                <input name="facilityManager" value={project.facilityManager || ""} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
              <Field label="HR Manager">
                <input name="hrManager" value={project.hrManager || ""} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
              <Field label="Supply Manager">
                <input name="supplyManager" value={project.supplyManager || ""} onChange={onChange} className="ds-input" placeholder="Full name" />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Construction Template" accentColor="var(--accent)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (t.id === project.templateType) return;
                    // Switching templates invalidates any existing scope
                    // selection — v1's {phases,workPackages} shape and v2's
                    // {zones,categories,workPackages,zoneAreas} shape are not
                    // interchangeable (see getScopeWPIds.js/ZonedScopeConfigurator.jsx).
                    onProjectPatch((p) => ({ ...p, templateType: t.id, scope: null }));
                  }}
                  style={{
                    flex: "1 1 200px", textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                    border: `1.5px solid ${project.templateType === t.id ? "var(--status-done)" : "var(--border)"}`,
                    background: project.templateType === t.id ? "var(--status-done-bg)" : "var(--accent-subtle)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: project.templateType === t.id ? "var(--status-done)" : "var(--text-primary)" }}>
                    {t.icon} {t.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{t.description}</div>
                </button>
              ))}
            </div>
          </FormSection>

          {/* project.scope may already be a non-null object (e.g. it holds
              only zoneAreas, entered below, for a v2 project) without the
              user ever having opened the scope configurator — "configured"
              means a WP selection was actually saved (workPackages present),
              not merely that the scope object exists. */}
          {(() => {
            const scopeConfigured = project.scope?.workPackages != null;
            return (
              <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={onOpenScopeConfigurator}
                  style={{
                    padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
                    border: scopeConfigured ? "1.5px solid var(--status-done)" : "1.5px solid var(--border)",
                    background: scopeConfigured ? "var(--status-done-bg)" : "var(--accent-subtle)",
                    color: scopeConfigured ? "var(--status-done)" : "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                >
                  {scopeConfigured ? `Scope configured (${project.scope.workPackages.length} WPs)` : "Configure Scope ->"}
                </button>
                {scopeConfigured && (
                  <button
                    type="button"
                    onClick={() => onProjectPatch((p) => ({ ...p, scope: p.scope?.zoneAreas ? { zoneAreas: p.scope.zoneAreas } : null }))}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
                  >
                    Reset to full scope
                  </button>
                )}
              </div>
            );
          })()}

          {project.templateType === V2_TEMPLATE_TYPE && (
            <FormSection title="Zone Areas (m²)" accentColor="var(--accent)">
              <FieldRow>
                <Field label="Sales Floor Area">
                  <input
                    type="number"
                    min="0"
                    name="scope.zoneAreas.sales"
                    value={project.scope?.zoneAreas?.sales ?? ''}
                    onChange={(e) => {
                      // Clamped to >=0 at entry (defense-in-depth, F-01) — the
                      // engine (computeZoneWeights.js) is independently robust
                      // to a negative value reaching it regardless.
                      const v = e.target.value === '' ? '' : clamp(Number(e.target.value) || 0, 0, Infinity);
                      onProjectPatch((p) => ({ ...p, scope: { ...p.scope, zoneAreas: { ...p.scope?.zoneAreas, sales: v } } }));
                    }}
                    className="ds-input"
                    placeholder="e.g. 700"
                  />
                </Field>
                <Field label="Back of House Area">
                  <input
                    type="number"
                    min="0"
                    name="scope.zoneAreas.boh"
                    value={project.scope?.zoneAreas?.boh ?? ''}
                    onChange={(e) => {
                      // Clamped to >=0 at entry (defense-in-depth, F-01) — the
                      // engine (computeZoneWeights.js) is independently robust
                      // to a negative value reaching it regardless.
                      const v = e.target.value === '' ? '' : clamp(Number(e.target.value) || 0, 0, Infinity);
                      onProjectPatch((p) => ({ ...p, scope: { ...p.scope, zoneAreas: { ...p.scope?.zoneAreas, boh: v } } }));
                    }}
                    className="ds-input"
                    placeholder="e.g. 300"
                  />
                </Field>
              </FieldRow>
            </FormSection>
          )}

          <FormSection title="Project" accentColor="var(--status-done)">
            <FieldRow>
              <Field label="Project Type">
                <div style={{ display: "flex", gap: 8 }}>
                  {PROJECT_TYPE_OPTIONS.map((opt) => (
                    <button key={opt} type="button"
                      onClick={() => onProjectPatch((p) => ({ ...p, projectType: opt }))}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                        border: `1.5px solid ${project.projectType === opt ? "var(--status-done)" : "var(--border)"}`,
                        background: project.projectType === opt ? "var(--status-done-bg)" : "var(--accent-subtle)",
                        color: project.projectType === opt ? "var(--status-done)" : "var(--text-muted)",
                      }}>{opt}</button>
                  ))}
                </div>
              </Field>
              <Field label="Store Concept">
                <input
                  name="storeConcept"
                  list="store-concept-suggestions"
                  value={project.storeConcept || ""}
                  onChange={onChange}
                  className="ds-input"
                  placeholder="e.g. Flagship"
                />
                {/* Suggestions only — free text, no enum, matches the frozen
                    Retail Project Profile decision (store_concept is a plain
                    TEXT column with zero DB-level enforcement). */}
                <datalist id="store-concept-suggestions">
                  {STORE_CONCEPT_SUGGESTIONS.map((opt) => <option key={opt} value={opt} />)}
                </datalist>
              </Field>
              <Field label="Project Status">
                <div style={{ display: "flex", gap: 8 }}>
                  {["Active", "Completed"].map((label) => (
                    <button key={label} type="button"
                      onClick={() => onProjectPatch((p) => ({ ...p, projectStatus: label }))}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s ease",
                        border: `1.5px solid ${project.projectStatus === label ? "var(--accent)" : "var(--border)"}`,
                        background: project.projectStatus === label ? "var(--accent-subtle)" : "var(--accent-subtle)",
                        color: project.projectStatus === label ? "var(--accent)" : "var(--text-muted)",
                      }}>{label}</button>
                  ))}
                </div>
              </Field>
            </FieldRow>
          </FormSection>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
            <div>
              {editingProjectId && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={onDelete}
                >
                  Delete Project
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-secondary" onClick={requestClose}>Cancel</button>
              <button className="btn btn-primary" onClick={onSave}>
                {editingProjectId ? "Save Changes" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
    </Modal>
  );
}
