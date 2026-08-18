import { Field, FieldRow, FormSection } from "./ProjectFormParts";
import ConflictWarning from "../ConflictWarning";
import { PROJECT_TYPE_OPTIONS, LOCATION_TYPE_OPTIONS, STORE_CONCEPT_SUGGESTIONS } from "../../config/projectVocabulary";
import Modal from "../shared/Modal";

export default function ProjectEditorModal({
  project,
  editingProjectId,
  onChange,
  onProjectPatch,
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
              value={project.storeCode ?? ""}
              onChange={onChange}
              placeholder="e.g. SE001"
              style={{ maxWidth: 200, fontWeight: 700, fontSize: 15 }}
            />
          </div>

          <FormSection title="Identity & Location" accentColor="var(--accent)">
            <FieldRow>
              <Field label="Country">
                <input name="country" value={project.country ?? ""} onChange={onChange} className="ds-input" placeholder="Country" />
              </Field>
              <Field label="City">
                <input name="city" value={project.city ?? ""} onChange={onChange} className="ds-input" placeholder="City" />
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

              <div style={{ marginTop: 12 }}>
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
              </div>
            </div>
          </FormSection>

          <FormSection title="Planned Dates" accentColor="var(--status-warn)">
            <FieldRow>
              <Field label="Construction Start Date">
                <input type="date" name="constructionStartDate" value={project.constructionStartDate ?? ""} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Construction End Date">
                <input type="date" name="constructionEndDate" value={project.constructionEndDate ?? ""} onChange={onChange} className="ds-input" />
              </Field>
              <Field label="Target Opening Date">
                <input type="date" name="targetOpeningDate" value={project.targetOpeningDate ?? ""} onChange={onChange} className="ds-input" />
              </Field>
            </FieldRow>
          </FormSection>

          {/* Actual dates are observed historical facts (frozen Retail Project
              Profile v1) — deliberately never reused/confused with the planned
              fields above or with the engine-owned forecast fields
              (construction_completion_date/forecast_opening_date), which have
              no input here at all and remain exclusively ganttService-written. */}
          {editingProjectId && (
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
          )}

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

          <FormSection title="Commercial settings" accentColor="var(--status-warn)">
            <FieldRow>
              <Field label="Currency">
                <select name="currencyCode" value={project.currencyCode || "KZT"} onChange={onChange} className="ds-select" disabled={Boolean(editingProjectId)}>
                  <option value="KZT">KZT</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
            </FieldRow>
          </FormSection>

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
