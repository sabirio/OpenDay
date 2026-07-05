export default function PhotoErrorAlert({ message }) {
  if (!message) return null;

  return (
    <div style={{ background: "#fff1f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#991b1b" }}>
      {message}
    </div>
  );
}
