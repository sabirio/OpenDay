import { FormSection, ToggleGroup, CheckboxListItem, TextAreaField } from "./FormParts";

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
      <FormSection title="Client Support Required" accentColor="var(--field-accent-blue-fg2)">
        <ToggleGroup
          name="support-required"
          label="Is any support required from the Client Project Manager?"
          options={["No", "Yes"]}
          value={form.supportRequired}
          onChange={(v) => updateField("supportRequired", v)}
          colorMap={{
            "No":  { bg: "var(--field-bg-subtle)", color: "var(--field-text-body)", border: "var(--field-text-muted)" },
            "Yes": { bg: "var(--field-accent-blue-bg)", color: "var(--field-accent-blue-fg)", border: "var(--field-accent-blue-border)" },
          }}
        />
        {form.supportRequired === "Yes" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 12 }}>Support Type</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {supportTypes.map(({ label, description }) => (
                  <CheckboxListItem
                    key={label}
                    label={label}
                    description={description}
                    active={(form.supportTypes || []).includes(label)}
                    onToggle={() => toggleCheckbox("supportTypes", label)}
                    activeBg="var(--field-accent-blue-subtle)"
                    activeBorder="var(--field-accent-blue-fg2)"
                  />
                ))}
              </div>
            </div>
            <TextAreaField label="Support Description" value={form.supportDescription} onChange={(v) => updateField("supportDescription", v)} placeholder="What support is needed and why..." rows={3} />
          </>
        )}
      </FormSection>

      <FormSection title="Additional Works" accentColor="var(--field-accent-orange-fg)">
        <ToggleGroup
          name="additional-works"
          label="Are there any additional works with potential cost impact?"
          options={["No", "Yes"]}
          value={form.additionalWorks}
          onChange={(v) => updateField("additionalWorks", v)}
          colorMap={{
            "No":  { bg: "var(--field-bg-subtle)", color: "var(--field-text-body)", border: "var(--field-text-muted)" },
            "Yes": { bg: "var(--field-accent-orange-bg)", color: "var(--field-accent-orange-fg-dark)", border: "var(--field-accent-orange-border)" },
          }}
        />
        {form.additionalWorks === "Yes" && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label htmlFor="additional-works-reason" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Main Reason for Additional Works</label>
              <select
                id="additional-works-reason"
                value={form.additionalWorksParty}
                onChange={(e) => updateField("additionalWorksParty", e.target.value)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--field-border-strong)", fontSize: 13, background: "var(--field-bg-card)", width: "100%", maxWidth: 320, cursor: "pointer", outline: "none" }}
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
              <label htmlFor="additional-works-cost" style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>Estimated Additional Cost</label>
              <input
                id="additional-works-cost"
                type="text"
                value={form.additionalWorksCost}
                onChange={(e) => updateField("additionalWorksCost", e.target.value)}
                placeholder="e.g. 1 000 EUR"
                style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--field-border-strong)", fontSize: 13, background: "var(--field-bg-card)", outline: "none" }}
              />
            </div>
          </>
        )}
      </FormSection>
    </>
  );
}

export default SupportWorksSection;
