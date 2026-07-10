import { Field, FieldRow, FormSection } from "./ProjectFormParts";
import ConflictWarning from "../ConflictWarning";
import { TEMPLATES } from "../../config/projectTemplates";
import { V2_TEMPLATE_TYPE } from "../../domains/construction/templates/retailFitoutV2";
import { clamp } from "../../hooks/useChartMathPresentation";

export default function ProjectEditorModal({
  project,
  editingProjectId,
  inputStyle,
  onChange,
  onProjectPatch,
  onOpenScopeConfigurator,
  onDelete,
  onSave,
  onClose,
  conflict,
  onDiscardConflict,
  onOverwriteConflict,
}) {
  if (!project) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820, width: "95vw" }}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>{editingProjectId ? "Edit Project" : "New Project"}</h2>
            {project.storeCode && (
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{project.storeCode}</div>
            )}
          </div>
          <button className="close-button" onClick={onClose}>x</button>
        </div>

        <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 72px)", padding: "20px 24px" }}>
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
              name="storeCode"
              value={project.storeCode}
              onChange={onChange}
              placeholder="e.g. SE001"
              style={{ ...inputStyle, maxWidth: 200, fontWeight: 700, fontSize: 15 }}
            />
          </div>

          <FormSection title="Address" accentColor="var(--accent)">
            <FieldRow>
              <Field label="Shopping Mall">
                <input name="shoppingMallName" value={project.shoppingMallName} onChange={onChange} style={inputStyle} placeholder="Mall name" />
              </Field>
              <Field label="Sales Market">
                <input name="salesMarket" value={project.salesMarket || ""} onChange={onChange} style={inputStyle} placeholder="e.g. Sweden" />
              </Field>
              <Field label="City">
                <input name="city" value={project.city} onChange={onChange} style={inputStyle} placeholder="City" />
              </Field>
              <Field label="State / Region">
                <input name="state" value={project.state || ""} onChange={onChange} style={inputStyle} placeholder="State or region" />
              </Field>
              <Field label="Street">
                <input name="street" value={project.street || ""} onChange={onChange} style={inputStyle} placeholder="Street address" />
              </Field>
              <Field label="Country">
                <input name="country" value={project.country} onChange={onChange} style={inputStyle} placeholder="Country" />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Dates" accentColor="var(--status-warn)">
            <FieldRow>
              <Field label="Construction Start Date">
                <input type="date" name="constructionStartDate" value={project.constructionStartDate} onChange={onChange} style={inputStyle} />
              </Field>
              <Field label="Construction End Date">
                <input type="date" name="constructionEndDate" value={project.constructionEndDate} onChange={onChange} style={inputStyle} />
              </Field>
              <Field label="Target Opening Date">
                <input type="date" name="targetOpeningDate" value={project.targetOpeningDate} onChange={onChange} style={inputStyle} />
              </Field>
            </FieldRow>
          </FormSection>

          <FormSection title="Stakeholders" accentColor="var(--status-done)">
            <FieldRow>
              <Field label="Project Manager">
                <input name="projectManager" value={project.projectManager} onChange={onChange} style={inputStyle} placeholder="Full name" />
              </Field>
              <Field label="General Contractor">
                <input name="generalContractor" value={project.generalContractor} onChange={onChange} style={inputStyle} placeholder="Company name" />
              </Field>
              <Field label="Security Manager">
                <input name="securityManager" value={project.securityManager || ""} onChange={onChange} style={inputStyle} placeholder="Full name" />
              </Field>
              <Field label="IT Manager">
                <input name="itManager" value={project.itManager || ""} onChange={onChange} style={inputStyle} placeholder="Full name" />
              </Field>
              <Field label="Facility Manager">
                <input name="facilityManager" value={project.facilityManager || ""} onChange={onChange} style={inputStyle} placeholder="Full name" />
              </Field>
              <Field label="HR Manager">
                <input name="hrManager" value={project.hrManager || ""} onChange={onChange} style={inputStyle} placeholder="Full name" />
              </Field>
              <Field label="Supply Manager">
                <input name="supplyManager" value={project.supplyManager || ""} onChange={onChange} style={inputStyle} placeholder="Full name" />
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
                    style={inputStyle}
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
                    style={inputStyle}
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
                  {["New Opening", "Rebuilding"].map((opt) => (
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
                  onClick={onDelete}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: "1.5px solid var(--border)", background: "var(--status-alert-bg)", color: "var(--status-alert)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Delete Project
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="secondary-button" onClick={onClose}>Cancel</button>
              <button className="primary-button" onClick={onSave}>
                {editingProjectId ? "Save Changes" : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
