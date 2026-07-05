export default function ValidationErrors({ errors }) {
  if (!errors.length) return null;

  return (
    <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8, fontSize: 13 }}>Please fix the following required fields:</div>
      <ul style={{ margin: 0, paddingLeft: 18, color: "#b91c1c", fontSize: 13, lineHeight: 1.8 }}>
        {errors.map((error) => <li key={error}>{error}</li>)}
      </ul>
    </div>
  );
}
