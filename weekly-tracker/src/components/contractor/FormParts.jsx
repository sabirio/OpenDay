// ── Generic reusable form building blocks ──────────────────────────────────

export function FormSection({ title, accentColor = "var(--field-accent-contractor)", badge, children }) {
  return (
    <div style={{ background: "white", border: "1px solid var(--field-border)", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--field-bg-subtle)", borderLeft: `4px solid ${accentColor}`, background: "var(--field-bg-faint)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
        {badge}
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

export function ToggleGroup({ name, label, options, value, onChange, colorMap }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 13, color: "var(--field-text-body)", fontWeight: 500, marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const sel = value === opt;
          const c = colorMap?.[opt] || {};
          return (
            <button key={opt} type="button"
              data-testid={name ? `toggle-${name}-${opt}` : undefined}
              onClick={() => onChange(opt)} style={{
              padding: "9px 24px", borderRadius: 10,
              border: `2px solid ${sel ? (c.border || "var(--field-accent-contractor)") : "var(--field-border)"}`,
              background: sel ? (c.bg || "var(--field-success-bg)") : "white",
              color: sel ? (c.color || "var(--field-success-fg-dark)") : "var(--field-text-muted)",
              fontSize: 14, fontWeight: sel ? 700 : 400, cursor: "pointer", transition: "all 0.12s",
            }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChipGroup({ label, options, values, onToggle, activeBg = "var(--field-success-bg)", activeColor = "var(--field-success-fg-dark)", activeBorder = "var(--field-success-border)" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const sel = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
              padding: "7px 14px", borderRadius: 20,
              border: `1px solid ${sel ? activeBorder : "var(--field-border-strong)"}`,
              background: sel ? activeBg : "white",
              color: sel ? activeColor : "var(--field-text-secondary)",
              fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer", transition: "all 0.1s",
            }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TextAreaField({ label, value, onChange, rows = 4, placeholder = "" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>{label}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 14px",
          border: "1px solid var(--field-border-strong)", borderRadius: 10,
          fontSize: 13, color: "var(--field-text-body)", resize: "vertical",
          outline: "none", fontFamily: "inherit", lineHeight: 1.6,
          background: "var(--field-bg-faint)", boxSizing: "border-box",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--field-accent-contractor)"; e.target.style.boxShadow = "0 0 0 3px rgba(47,133,90,0.1)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--field-border-strong)"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}
