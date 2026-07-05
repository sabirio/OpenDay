import { FormSection, ToggleGroup, TextAreaField } from "./FormParts";
import PhotoUpload from "../shared/PhotoUpload";

function LookAheadDeclarationSection({ form, updateField, photoUrls, projectId, onPhotoUpload, onPhotoRemove, onPhotoError }) {
  return (
    <>
      <FormSection title="Look Ahead" accentColor="#0891b2">
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
            "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
            "Yes": { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
          }}
        />
        {form.activitiesBlocked === "Yes" && (
          <TextAreaField label="Delay Reason & Mitigation" value={form.delayReason} onChange={(v) => updateField("delayReason", v)} placeholder="Describe the reason and planned mitigation..." rows={3} />
        )}
      </FormSection>

      <FormSection title="Declaration & Comments" accentColor="#475569">
        <div className="field-form-2col">
          <TextAreaField label="Pending Issues Summary (optional)" value={form.pendingIssues} onChange={(v) => updateField("pendingIssues", v)} placeholder="List any open issues or pending actions..." rows={4} />
          <TextAreaField label="Final Comments (optional)" value={form.finalComments} onChange={(v) => updateField("finalComments", v)} placeholder="Any additional comments for this week..." rows={4} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>Site Photos</div>
          <PhotoUpload projectId={projectId} onUpload={onPhotoUpload} onRemove={onPhotoRemove} onError={onPhotoError} />
          {photoUrls.length > 0 && (
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>{photoUrls.length} photo{photoUrls.length > 1 ? "s" : ""} attached</p>
          )}
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
          <div
            data-testid="declaration-checkbox"
            onClick={() => updateField("declarationConfirmed", !form.declarationConfirmed)}
            style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
              border: `2px solid ${form.declarationConfirmed ? "#2f855a" : "#d1d5db"}`,
              background: form.declarationConfirmed ? "#2f855a" : "white",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}
          >
            {form.declarationConfirmed && <span style={{ color: "white", fontSize: 13, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, fontWeight: 500 }}>
            I confirm that the reported information reflects the actual site status and is accurate to the best of my knowledge.
          </span>
        </label>
      </FormSection>
    </>
  );
}

export default LookAheadDeclarationSection;
