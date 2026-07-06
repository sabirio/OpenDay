export default function StickySubmitBar({ onSubmit, disabled = false, label = "Submit Weekly Report" }) {
  return (
    <>
      <div className="field-form-sticky-submit-spacer" />
      <div className="field-form-sticky-submit">
        <button
          type="button"
          data-testid="save-contractor-report"
          onClick={onSubmit}
          disabled={disabled}
          style={{
            width: "100%", minHeight: 44, padding: "16px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg, var(--field-accent-contractor) 0%, var(--field-success-fg) 100%)",
            color: "white", fontSize: 16, fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.02em",
            opacity: disabled ? 0.65 : 1,
            boxShadow: "0 4px 14px rgba(47, 133, 90, 0.35)",
          }}
        >
          {label}
        </button>
      </div>
    </>
  );
}
