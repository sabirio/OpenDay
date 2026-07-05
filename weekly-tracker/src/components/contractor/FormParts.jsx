// ── Generic reusable form building blocks ──────────────────────────────────

export function FormSection({ title, accentColor = "#2f855a", badge, children }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "12px 22px", borderBottom: "1px solid #f3f4f6", borderLeft: `4px solid ${accentColor}`, background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</h3>
        {badge}
      </div>
      <div style={{ padding: "20px 22px" }}>{children}</div>
    </div>
  );
}

export function ToggleGroup({ name, label, options, value, onChange, colorMap }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 13, color: "#374151", fontWeight: 500, marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const sel = value === opt;
          const c = colorMap?.[opt] || {};
          return (
            <button key={opt} type="button"
              data-testid={name ? `toggle-${name}-${opt}` : undefined}
              onClick={() => onChange(opt)} style={{
              padding: "9px 24px", borderRadius: 10,
              border: `2px solid ${sel ? (c.border || "#2f855a") : "#e5e7eb"}`,
              background: sel ? (c.bg || "#dcfce7") : "white",
              color: sel ? (c.color || "#166534") : "#9ca3af",
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

export function ChipGroup({ label, options, values, onToggle, activeBg = "#dcfce7", activeColor = "#166534", activeBorder = "#86efac" }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>{label}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const sel = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
              padding: "7px 14px", borderRadius: 20,
              border: `1px solid ${sel ? activeBorder : "#d1d5db"}`,
              background: sel ? activeBg : "white",
              color: sel ? activeColor : "#6b7280",
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
      {label && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>{label}</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 14px",
          border: "1px solid #d1d5db", borderRadius: 10,
          fontSize: 13, color: "#374151", resize: "vertical",
          outline: "none", fontFamily: "inherit", lineHeight: 1.6,
          background: "#fafafa", boxSizing: "border-box",
        }}
        onFocus={(e) => { e.target.style.borderColor = "#2f855a"; e.target.style.boxShadow = "0 0 0 3px rgba(47,133,90,0.1)"; }}
        onBlur={(e) => { e.target.style.borderColor = "#d1d5db"; e.target.style.boxShadow = "none"; }}
      />
    </div>
  );
}
