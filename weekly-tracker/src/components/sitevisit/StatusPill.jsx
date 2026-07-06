const STATUS_PILL_STYLE = {
  "Not Applicable": { bg: "var(--field-neutral-bg)", color: "var(--field-neutral-fg)" },
  "Not Started":    { bg: "var(--field-bg-subtle)", color: "var(--field-text-secondary)" },
  "In Progress":    { bg: "var(--field-warning-bg)", color: "var(--field-warning-fg)" },
  "Completed":      { bg: "var(--field-success-bg)", color: "var(--field-success-fg)" },
  "Delayed":        { bg: "var(--field-delayed-bg)", color: "var(--field-delayed-fg)" }, // legacy display only
};

function StatusPill({ status }) {
  if (!status) return <span style={{ color: "var(--field-border-strong)", fontSize: 12 }}>—</span>;
  const style = STATUS_PILL_STYLE[status] || { bg: "var(--field-bg-subtle)", color: "var(--field-text-secondary)" };
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
      {status}
    </span>
  );
}

export default StatusPill;
