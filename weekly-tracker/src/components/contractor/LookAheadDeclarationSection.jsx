import { FormSection, ToggleGroup, TextAreaField } from "./FormParts";
import PhotoUpload from "../shared/PhotoUpload";

function LookAheadDeclarationSection({ form, updateField, photoUrls, projectId, onPhotoUpload, onPhotoRemove, onPhotoError, onPhotoUploadingChange, onPhotoItemsChange }) {
  return (
    <>
      <FormSection title="Look Ahead" accentColor="var(--field-accent-sitevisit)">
        <div className="field-form-2col">
          <TextAreaField label="Top 3 Activities — Next Week (optional)" value={form.nextWeekTop3} onChange={(v) => updateField("nextWeekTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
          <TextAreaField label="Top 3 Activities — Week +2 (optional)" value={form.weekAfterTop3} onChange={(v) => updateField("weekAfterTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
        </div>
        <ToggleGroup
          name="activities-blocked"
          label="Any risks blocking the above activities?"
          options={["No", "Yes"]}
          value={form.activitiesBlocked}
          onChange={(v) => updateField("activitiesBlocked", v)}
          colorMap={{
            "No":  { bg: "var(--field-bg-subtle)", color: "var(--field-text-body)", border: "var(--field-text-muted)" },
            "Yes": { bg: "var(--field-danger-bg)", color: "var(--field-danger-fg-dark)", border: "var(--field-danger-border)" },
          }}
        />
        {form.activitiesBlocked === "Yes" && (
          <TextAreaField label="Delay Reason & Mitigation" value={form.delayReason} onChange={(v) => updateField("delayReason", v)} placeholder="Describe the reason and planned mitigation..." rows={3} />
        )}
      </FormSection>

      <FormSection title="Declaration & Comments" accentColor="var(--field-accent-slate)">
        <TextAreaField label="Final Comments or Pending Issues (optional)" value={form.finalComments} onChange={(v) => updateField("finalComments", v)} placeholder="Any comments, open issues, or pending actions for this week..." rows={4} />

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 10 }}>Site Photos</div>
          <PhotoUpload projectId={projectId} existingPaths={photoUrls} onUpload={onPhotoUpload} onRemove={onPhotoRemove} onError={onPhotoError} onUploadingChange={onPhotoUploadingChange} onItemsChange={onPhotoItemsChange} />
          {photoUrls.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--field-text-muted)", marginTop: 8 }}>{photoUrls.length} photo{photoUrls.length > 1 ? "s" : ""} attached</p>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", minHeight: 44 }}>
          <div
            data-testid="declaration-checkbox"
            role="checkbox"
            tabIndex={0}
            aria-checked={form.declarationConfirmed}
            aria-required="true"
            onClick={() => updateField("declarationConfirmed", !form.declarationConfirmed)}
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); updateField("declarationConfirmed", !form.declarationConfirmed); } }}
            style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
              border: `2px solid ${form.declarationConfirmed ? "var(--field-accent-contractor)" : "var(--field-border-strong)"}`,
              background: form.declarationConfirmed ? "var(--field-accent-contractor)" : "var(--field-bg-card)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            {form.declarationConfirmed && <span style={{ color: "var(--field-text-on-accent)", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: "var(--field-text-body)", lineHeight: 1.6, fontWeight: 500 }}>
            I confirm that the reported information reflects the actual site status and is accurate to the best of my knowledge.
          </span>
        </label>
      </FormSection>
    </>
  );
}

export default LookAheadDeclarationSection;
