const ACCENT = "var(--field-accent-sitevisit)";

function FormSection({ title, accentColor = ACCENT, note, children }) {
  return (
    <div style={{ background: "white", border: "1px solid var(--field-border)", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--field-bg-subtle)", borderLeft: `4px solid ${accentColor}`, background: "var(--field-bg-faint)" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
      </div>
      <div style={{ padding: "20px 22px" }}>
        {note && <div style={{ fontSize: 12, color: "var(--field-text-muted)", marginBottom: 14 }}>{note}</div>}
        {children}
      </div>
    </div>
  );
}

export default FormSection;
export { ACCENT };
