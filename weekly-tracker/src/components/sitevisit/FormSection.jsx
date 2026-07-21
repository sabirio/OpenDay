const ACCENT = "var(--field-accent-sitevisit)";

function FormSection({ title, accentColor = ACCENT, note, children }) {
  return (
    <div style={{ background: "var(--field-bg-card)", border: "1px solid var(--field-border)", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "var(--field-shadow)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--field-bg-subtle)", background: "var(--field-bg-faint)" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
          {title}
        </h3>
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
