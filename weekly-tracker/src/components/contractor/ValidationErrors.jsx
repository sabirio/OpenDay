export default function ValidationErrors({ errors }) {
  if (!errors.length) return null;

  return (
    <div style={{ background: "var(--field-danger-bg)", border: "1px solid var(--field-danger-border)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: "var(--field-danger-fg-dark)", marginBottom: 8, fontSize: 13 }}>Please fix the following required fields:</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "var(--field-danger-fg-dark)", fontSize: 13, lineHeight: 1.8 }}>
        {errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}
