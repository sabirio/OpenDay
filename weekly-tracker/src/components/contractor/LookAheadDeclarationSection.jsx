import { FormSection, ToggleGroup, TextAreaField } from "./FormParts";

function LookAheadDeclarationSection({ form, updateField }) {
  return (
    <>
      <FormSection title="Look Ahead" accentColor="#0891b2">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <TextAreaField label="Top 3 Activities — Next Week" value={form.nextWeekTop3} onChange={(v) => updateField("nextWeekTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
          <TextAreaField label="Top 3 Activities — Week +2" value={form.weekAfterTop3} onChange={(v) => updateField("weekAfterTop3", v)} placeholder={"1)\n2)\n3)"} rows={5} />
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <TextAreaField label="Pending Issues Summary" value={form.pendingIssues} onChange={(v) => updateField("pendingIssues", v)} placeholder="List any open issues or pending actions..." rows={4} />
          <TextAreaField label="Final Comments" value={form.finalComments} onChange={(v) => updateField("finalComments", v)} placeholder="Any additional comments for this week..." rows={4} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>Site Photos</div>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 10,
            border: "2px dashed #d1d5db", cursor: "pointer",
            color: "#6b7280", fontSize: 13, fontWeight: 500, background: "#fafafa",
          }}>
            <span style={{ fontSize: 18 }}>📷</span>
            {form.photos.length > 0 ? `${form.photos.length} photo${form.photos.length > 1 ? "s" : ""} selected` : "Upload site photos"}
            <input type="file" multiple accept="image/*" style={{ display: "none" }} onChange={(e) => updateField("photos", Array.from(e.target.files))} />
          </label>
          {form.photos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {form.photos.map((p, i) => (
                <span key={i} style={{ padding: "3px 10px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166634", fontSize: 12 }}>
                  {p?.name || `Photo ${i + 1}`}
                </span>
              ))}
            </div>
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
