const ACCENT = "var(--field-accent-sitevisit)";

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "var(--field-neutral-bg)", color: "var(--field-neutral-fg)", border: "var(--field-neutral-border)", gcBg: "var(--field-neutral-bg-subtle)", gcColor: "var(--field-neutral-fg)", gcBorder: "var(--field-neutral-border-subtle)" },
  { value: "Not Started",    label: "Not Started",    bg: "var(--field-bg-subtle)", color: "var(--field-text-secondary)", border: "var(--field-border-strong)", gcBg: "var(--field-bg-faint-alt)", gcColor: "var(--field-text-muted)", gcBorder: "var(--field-border)" },
  { value: "In Progress",    label: "In Progress",    bg: "var(--field-warning-bg)", color: "var(--field-warning-fg)", border: "var(--field-warning-border)", gcBg: "var(--field-warning-bg-subtle)", gcColor: "var(--field-warning-fg)", gcBorder: "var(--field-warning-border)" },
  { value: "Completed",      label: "Completed",      bg: "var(--field-success-bg)", color: "var(--field-success-fg)", border: "var(--field-success-border)", gcBg: "var(--field-success-bg)", gcColor: "var(--field-success-fg)", gcBorder: "var(--field-success-border)" },
];

function LegacyPMTaskRow({ wpId, taskName, entry, gcEntry, onChange }) {
  const e        = entry || { observedStatus: "" };
  const gcStatus = gcEntry?.status || null;

  return (
    <div data-testid="pm-task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid var(--field-bg-subtle)", padding: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "var(--field-text-body)", lineHeight: 1.35, minWidth: 0 }}>
          {taskName}
        </span>

        {/* Status buttons — PM selection is bold/solid; GC reference is tinted with a "GC" chip */}
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {WP_STATUS_OPTS.map((opt) => {
            const isPM = e.observedStatus === opt.value;
            const isGC = gcStatus === opt.value && !isPM;
            return (
              <button key={opt.value} type="button"
                data-testid={`pm-status-btn-${opt.value}`}
                onClick={() => onChange({ ...e, observedStatus: opt.value })}
                style={{
                  position: "relative",
                  padding: "4px 9px", borderRadius: 6, fontSize: 11,
                  border: isPM ? `1.5px solid ${opt.border}` : isGC ? `1px solid ${opt.gcBorder}` : "1px solid var(--field-border)",
                  background: isPM ? opt.bg : isGC ? opt.gcBg : "white",
                  color: isPM ? opt.color : isGC ? opt.gcColor : "var(--field-text-muted)",
                  fontWeight: isPM ? 700 : 400,
                  cursor: "pointer", whiteSpace: "nowrap", outline: "none",
                }}>
                {opt.label}
                {isGC && (
                  <span style={{
                    position: "absolute", top: -6, right: -4,
                    fontSize: 8, fontWeight: 800, lineHeight: 1.2,
                    background: ACCENT, color: "white",
                    padding: "1px 3px", borderRadius: 3,
                    letterSpacing: "0.02em", pointerEvents: "none",
                  }}>GC</span>
                )}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default LegacyPMTaskRow;
