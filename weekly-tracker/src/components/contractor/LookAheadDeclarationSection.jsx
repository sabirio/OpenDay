import { FormSection, ToggleGroup, TextAreaField } from "./FormParts";
import PhotoUpload from "../shared/PhotoUpload";

export function ForwardCommitmentsSection({ form, updateField }) {
  return (
    <FormSection title="Look Ahead" accentColor="var(--field-accent-sitevisit)">
      <div className="field-form-2col">
        <TextAreaField label="Top 3 Activities — Next Week (optional)" value={form.nextWeekTop3} onChange={(value) => updateField("nextWeekTop3", value)} placeholder={"1)\n2)\n3)"} rows={5} />
        <TextAreaField label="Top 3 Activities — Week +2 (optional)" value={form.weekAfterTop3} onChange={(value) => updateField("weekAfterTop3", value)} placeholder={"1)\n2)\n3)"} rows={5} />
      </div>
      <ToggleGroup
        name="activities-blocked"
        label="Any risks blocking the above activities?"
        options={["No", "Yes"]}
        value={form.activitiesBlocked}
        onChange={(value) => updateField("activitiesBlocked", value)}
        colorMap={{
          No: { bg: "var(--field-bg-subtle)", color: "var(--field-text-body)", border: "var(--field-text-muted)" },
          Yes: { bg: "var(--field-danger-bg)", color: "var(--field-danger-fg-dark)", border: "var(--field-danger-border)" },
        }}
      />
      {form.activitiesBlocked === "Yes" && (
        <TextAreaField label="Delay Reason & Mitigation" value={form.delayReason} onChange={(value) => updateField("delayReason", value)} placeholder="Describe the reason and planned mitigation..." rows={3} />
      )}
    </FormSection>
  );
}

export function EvidenceDeclarationSection({ form, updateField, photoUrls, projectId, onPhotoUpload, onPhotoRemove, onPhotoError, onPhotoUploadingChange, onPhotoItemsChange }) {
  return (
    <FormSection title="Evidence, Comments & Declaration" accentColor="var(--field-accent-slate)">
      <TextAreaField label="Final Comments or Pending Issues (optional)" value={form.finalComments} onChange={(value) => updateField("finalComments", value)} placeholder="Any comments, open issues, or pending actions for this week..." rows={4} />

      <div style={{ marginBottom: 24 }}>
        <div className="contractor-report-field-label">Site Photos</div>
        <PhotoUpload projectId={projectId} existingPaths={photoUrls} onUpload={onPhotoUpload} onRemove={onPhotoRemove} onError={onPhotoError} onUploadingChange={onPhotoUploadingChange} onItemsChange={onPhotoItemsChange} />
        {photoUrls.length > 0 && <p className="contractor-report-evidence-count">{photoUrls.length} photo{photoUrls.length > 1 ? "s" : ""} attached</p>}
      </div>

      <label className="contractor-report-declaration">
        <div
          data-testid="declaration-checkbox"
          role="checkbox"
          tabIndex={0}
          aria-checked={form.declarationConfirmed}
          aria-required="true"
          onClick={() => updateField("declarationConfirmed", !form.declarationConfirmed)}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              updateField("declarationConfirmed", !form.declarationConfirmed);
            }
          }}
          className={form.declarationConfirmed ? "contractor-report-checkbox is-checked" : "contractor-report-checkbox"}
        >
          {form.declarationConfirmed && <span aria-hidden="true">✓</span>}
        </div>
        <span>I confirm that the reported information reflects the actual site status and is accurate to the best of my knowledge.</span>
      </label>
    </FormSection>
  );
}

export default function LookAheadDeclarationSection(props) {
  return (
    <>
      <ForwardCommitmentsSection {...props} />
      <EvidenceDeclarationSection {...props} />
    </>
  );
}
