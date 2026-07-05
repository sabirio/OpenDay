const ACCENT = "#0891b2";

const WP_STATUS_OPTS = [
  { value: "Not Applicable", label: "Not Applicable", bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe", gcBg: "#faf8ff", gcColor: "#7c3aed", gcBorder: "#ede9fe" },
  { value: "Not Started",    label: "Not Started",    bg: "#f3f4f6", color: "#6b7280", border: "#d1d5db", gcBg: "#f9fafb", gcColor: "#9ca3af", gcBorder: "#e5e7eb" },
  { value: "In Progress",    label: "In Progress",    bg: "#fef3c7", color: "#d97706", border: "#fde68a", gcBg: "#fefce8", gcColor: "#d97706", gcBorder: "#fde68a" },
  { value: "Completed",      label: "Completed",      bg: "#dcfce7", color: "#16a34a", border: "#86efac", gcBg: "#f0fdf4", gcColor: "#16a34a", gcBorder: "#bbf7d0" },
];

function LegacyPMTaskRow({ wpId, taskName, entry, gcEntry, onChange }) {
  const e        = entry || { observedStatus: "" };
  const gcStatus = gcEntry?.status || null;

  return (
    <div data-testid="pm-task-row" data-wp-id={wpId} data-task-name={taskName} style={{ borderBottom: "1px solid #f3f4f6", padding: "9px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>

        {/* Task name */}
        <span style={{ flex: "1 1 180px", fontSize: 13, color: "#374151", lineHeight: 1.35, minWidth: 0 }}>
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
                  border: isPM ? `1.5px solid ${opt.border}` : isGC ? `1px solid ${opt.gcBorder}` : "1px solid #e5e7eb",
                  background: isPM ? opt.bg : isGC ? opt.gcBg : "white",
                  color: isPM ? opt.color : isGC ? opt.gcColor : "#9ca3af",
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
