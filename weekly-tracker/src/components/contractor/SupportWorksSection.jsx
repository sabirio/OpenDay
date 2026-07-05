import { FormSection, ToggleGroup, TextAreaField } from "./FormParts";

const supportTypes = [
  { label: "Decision",    description: "Assistance in making critical project decisions affecting schedule, budget, or scope." },
  { label: "Design",      description: "Support for design clarifications, adjustments, or approvals." },
  { label: "Approval",    description: "Help obtaining approvals for materials, methods, or changes." },
  { label: "Authorities", description: "Support in dealing with local authorities for permits, inspections, or compliance." },
  { label: "Escalation",  description: "Escalate unresolved issues to higher management for quick resolution." },
];

function SupportWorksSection({ form, updateField, toggleCheckbox }) {
  return (
    <>
      <FormSection title="Client Support Required" accentColor="#2563eb">
        <ToggleGroup
          name="support-required"
          label="Is any support required from the Client Project Manager?"
          options={["No", "Yes"]}
          value={form.supportRequired}
          onChange={(v) => updateField("supportRequired", v)}
          colorMap={{
            "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
            "Yes": { bg: "#dbeafe", color: "#1e40af", border: "#93c5fd" },
          }}
        />
        {form.supportRequired === "Yes" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 12 }}>Support Type</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {supportTypes.map(({ label, description }) => {
                  const active = (form.supportTypes || []).includes(label);
                  return (
                    <label key={label} onClick={() => toggleCheckbox("supportTypes", label)} style={{
                      display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
                      borderRadius: 10, cursor: "pointer", background: active ? "#eff6ff" : "transparent",
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                        border: `2px solid ${active ? "#2563eb" : "#d1d5db"}`,
                        background: active ? "#2563eb" : "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white" }} />}
                      </div>
                      <div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{label}</span>
                        <span style={{ fontSize: 13, color: "#6b7280" }}> — {description}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <TextAreaField label="Support Description" value={form.supportDescription} onChange={(v) => updateField("supportDescription", v)} placeholder="What support is needed and why..." rows={3} />
          </>
        )}
      </FormSection>

      <FormSection title="Additional Works" accentColor="#ea580c">
        <ToggleGroup
          name="additional-works"
          label="Are there any additional works with potential cost impact?"
          options={["No", "Yes"]}
          value={form.additionalWorks}
          onChange={(v) => updateField("additionalWorks", v)}
          colorMap={{
            "No":  { bg: "#f3f4f6", color: "#374151", border: "#9ca3af" },
            "Yes": { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
          }}
        />
        {form.additionalWorks === "Yes" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Main Reason for Additional Works</div>
              <select
                value={form.additionalWorksParty}
                onChange={(e) => updateField("additionalWorksParty", e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 13, background: "white", width: "100%", maxWidth: 320, cursor: "pointer", outline: "none" }}
              >
                <option value="">— Select —</option>
                <option>Drawings Issues</option>
                <option>Design Changes</option>
                <option>Client Request</option>
                <option>Site Condition Issue</option>
              </select>
            </div>
            <TextAreaField label="Description" value={form.additionalWorksDescription} onChange={(v) => updateField("additionalWorksDescription", v)} placeholder="Explain the project change, reason, and affected scope..." rows={4} />
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Estimated Additional Cost</div>
              <input
                type="text"
                value={form.additionalWorksCost}
                onChange={(e) => updateField("additionalWorksCost", e.target.value)}
                placeholder="e.g. 1 000 EUR"
                style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #d1d5db", fontSize: 13, background: "white", outline: "none" }}
              />
            </div>
          </>
        )}
      </FormSection>
    </>
  );
}

export default SupportWorksSection;
