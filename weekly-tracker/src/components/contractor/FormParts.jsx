// ── Generic reusable form building blocks ──────────────────────────────────

import { useId } from "react";
import AnalyticalSection from "../shared/detail/AnalyticalSection.jsx";

export function FormSection({ title, accentColor = "var(--field-accent-contractor)", badge, children }) {
  return (
    <AnalyticalSection
      title={title}
      accessory={badge}
      className="contractor-report-section"
      data-accent-color={accentColor}
    >
      <div className="contractor-report-section-content">{children}</div>
    </AnalyticalSection>
  );
}

export function ToggleGroup({ name, label, options, value, onChange, colorMap }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div id={name ? `${name}-label` : undefined} style={{ fontSize: 13, color: "var(--field-text-body)", fontWeight: 500, marginBottom: 10 }}>{label}</div>}
      <div role="group" aria-labelledby={label && name ? `${name}-label` : undefined} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {options.map((opt) => {
          const sel = value === opt;
          const c = colorMap?.[opt] || {};
          return (
            <button key={opt} type="button"
              data-testid={name ? `toggle-${name}-${opt}` : undefined}
              aria-pressed={sel}
              onClick={() => onChange(opt)} style={{
              minHeight: 44, padding: "9px 24px", borderRadius: 10,
              border: `2px solid ${sel ? (c.border || "var(--field-accent-contractor)") : "var(--field-border)"}`,
              background: sel ? (c.bg || "var(--field-success-bg)") : "var(--field-bg-card)",
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
  const groupId = useId();
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <div id={groupId} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 10 }}>{label}</div>}
      <div role="group" aria-labelledby={label ? groupId : undefined} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((opt) => {
          const sel = values.includes(opt);
          return (
            <button key={opt} type="button" aria-pressed={sel} onClick={() => onToggle(opt)} style={{
              minHeight: 44, padding: "7px 14px", borderRadius: 20,
              border: `1px solid ${sel ? activeBorder : "var(--field-border-strong)"}`,
              background: sel ? activeBg : "var(--field-bg-card)",
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

// UX-audit fix (2026-07-21): ScheduleRiskSection.jsx and SupportWorksSection.jsx
// each independently reimplemented this multi-select row as a <label onClick>
// wrapping a purely decorative div — not focusable, no role/aria-checked, not
// operable by keyboard or announced by a screen reader. Extracted as one
// accessible component (role="checkbox" + tabIndex + onKeyDown on the whole
// clickable row, matching the working single-checkbox pattern already used in
// LookAheadDeclarationSection.jsx) instead of fixing the same bug twice.
export function CheckboxListItem({ label, description, active, onToggle, activeBg, activeBorder }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onToggle}
      style={{
        width: "100%", minHeight: 44, display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px",
        border: "none", borderRadius: 10, cursor: "pointer", background: active ? activeBg : "transparent",
        font: "inherit", textAlign: "left",
      }}
    >
      <div aria-hidden="true" style={{
        width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        border: `2px solid ${active ? activeBorder : "var(--field-border-strong)"}`,
        background: active ? activeBorder : "var(--field-bg-card)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {active && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--field-bg-card)" }} />}
      </div>
      <div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--field-text-heading)" }}>{label}</span>
        {description ? <span style={{ fontSize: 13, color: "var(--field-text-secondary)" }}> — {description}</span> : null}
      </div>
    </button>
  );
}

export function TextAreaField({ label, value, onChange, rows = 4, placeholder = "", required = false }) {
  const id = useId();
  return (
    <div style={{ marginBottom: 20 }}>
      {label && <label htmlFor={id} style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--field-text-label)", marginBottom: 8 }}>{label}{required ? " *" : ""}</label>}
      <textarea
        id={id}
        required={required}
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
