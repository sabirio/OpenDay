import { FormSection, ToggleGroup, ChipGroup, TextAreaField } from "./FormParts";

const riskOptions = [
  { label: "Resource Availability",          description: "Shortage of manpower, equipment, or site supervision within the next 2–3 weeks." },
  { label: "Material or Equipment Delivery", description: "Material not fully delivered, not ordered, or delivery dates are uncertain." },
  { label: "Regulatory Compliance",          description: "Permit, inspection, approval, or authority action may delay works." },
  { label: "Coordination",                   description: "Misalignment or delay from Landlord, Mall, Consultant, or subcontractors." },
  { label: "Safety or External Factors",     description: "Safety observations, incidents, bank holidays or restrictions." },
];

const riskOwners = ["Landlord", "General Contractor", "Consultant", "Authorities", "Client"];

function ScheduleRiskSection({ form, updateField, toggleCheckbox }) {
  return (
    <>
      <FormSection title="Project Schedule Status" accentColor="var(--field-accent-slate)">
        <ToggleGroup
          name="schedule-status"
          label="Is the project on track vs the agreed schedule?"
          options={["On Track", "At Risk", "Critical"]}
          value={form.projectScheduleStatus}
          onChange={(v) => updateField("projectScheduleStatus", v)}
          colorMap={{
            "On Track": { bg: "var(--field-success-bg)", color: "var(--field-success-fg-dark)", border: "var(--field-success-border)" },
            "At Risk":  { bg: "var(--field-warning-bg)", color: "var(--field-warning-fg-dark)", border: "var(--field-warning-border)" },
            "Critical": { bg: "var(--field-danger-bg)", color: "var(--field-danger-fg-dark)", border: "var(--field-danger-fg)" },
          }}
        />
      </FormSection>

      {(form.projectScheduleStatus === "At Risk" || form.projectScheduleStatus === "Critical") && (
        <FormSection title="Risk Details" accentColor="var(--field-danger-fg)">
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 10 }}>Main Risk Indication</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {riskOptions.map(({ label, description }) => {
                const active = (form.risks || []).includes(label);
                return (
                  <label key={label} onClick={() => toggleCheckbox("risks", label)} style={{
                    display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
                    borderRadius: 10, cursor: "pointer", background: active ? "var(--field-danger-bg)" : "transparent",
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                      border: `2px solid ${active ? "var(--field-danger-fg)" : "var(--field-border-strong)"}`,
                      background: active ? "var(--field-danger-fg)" : "white",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "white" }} />}
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)" }}>{label}</span>
                      <span style={{ fontSize: 13, color: "var(--field-text-secondary)" }}> — {description}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          <ChipGroup label="Risk Owner" options={riskOwners} values={form.riskOwners}
            onToggle={(v) => toggleCheckbox("riskOwners", v)}
            activeBg="var(--field-warning-bg)" activeColor="var(--field-warning-fg-dark)" activeBorder="var(--field-warning-border)" />
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 10 }}>Risk Scale</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { label: "Low", bg: "var(--field-success-bg)", color: "var(--field-success-fg-dark)", border: "var(--field-success-border)" },
                { label: "Medium", bg: "var(--field-warning-bg)", color: "var(--field-warning-fg-dark)", border: "var(--field-warning-border)" },
                { label: "High", bg: "var(--field-danger-bg)", color: "var(--field-danger-fg-dark)", border: "var(--field-danger-border)" },
              ].map(({ label, bg, color, border }) => {
                const sel = form.riskScale === label;
                return (
                  <button key={label} type="button" onClick={() => updateField("riskScale", label)} style={{
                    padding: "9px 24px", borderRadius: 10,
                    border: `2px solid ${sel ? border : "var(--field-border)"}`,
                    background: sel ? bg : "white",
                    color: sel ? color : "var(--field-text-muted)",
                    fontSize: 14, fontWeight: sel ? 700 : 400, cursor: "pointer",
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <TextAreaField label="Short Description" value={form.riskDescription} onChange={(v) => updateField("riskDescription", v)} placeholder="Describe the risk and planned mitigation..." rows={3} />
        </FormSection>
      )}
    </>
  );
}

export default ScheduleRiskSection;
