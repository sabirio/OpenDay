const STATUS_PILL_STYLE = {
  "Not Applicable": { bg: "#f5f3ff", color: "#7c3aed" },
  "Not Started":    { bg: "#f3f4f6", color: "#6b7280" },
  "In Progress":    { bg: "#fef3c7", color: "#d97706" },
  "Completed":      { bg: "#dcfce7", color: "#16a34a" },
  "Delayed":        { bg: "#fce7f3", color: "#be185d" }, // legacy display only
};

function StatusPill({ status }) {
  if (!status) return <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>;
  const style = STATUS_PILL_STYLE[status] || { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
      {status}
    </span>
  );
}

export default StatusPill;
