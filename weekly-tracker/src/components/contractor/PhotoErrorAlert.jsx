export default function PhotoErrorAlert({ message }) {
  if (!message) return null;

  return (
    <div role="alert" aria-live="assertive" style={{ background: "var(--field-danger-bg)", border: "1px solid var(--field-danger-border)", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "var(--field-danger-fg-dark)" }}>
      {message}
    </div>
  );
}
