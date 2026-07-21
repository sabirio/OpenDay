export function LoadingReportState() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40, color: "var(--field-text-secondary)" }}>
        Loading report...
      </div>
    </div>
  );
}

export function ProjectNotFoundState({ message }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>!</div>
        <h2 style={{ color: "var(--field-text-heading)", marginBottom: 8 }}>Project not found</h2>
        <p style={{ color: "var(--field-text-secondary)" }}>{message || "This report link is invalid or the project has been removed."}</p>
      </div>
    </div>
  );
}

export function SubmittedReportState({ project, onSubmitAnother, onClose, idempotentReplay = false }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--field-bg-contractor)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--field-success-bg)", border: "2px solid var(--field-success-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 32 }}>✓</div>
        <h2 tabIndex={-1} autoFocus style={{ color: "var(--field-success-fg-dark)", marginBottom: 8, fontSize: 24 }}>{idempotentReplay ? 'Report already confirmed' : 'Report submitted'}</h2>
        <p style={{ color: "var(--field-text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
          {idempotentReplay ? 'The earlier submission was found and confirmed; no duplicate was created.' : 'Thank you. Your weekly report was persisted successfully.'} <strong>{project.storeCode} - {project.shoppingMallName}</strong>
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onSubmitAnother}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: "var(--field-accent-contractor)", color: "var(--field-text-on-accent)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Submit another report
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "12px 28px", borderRadius: 10, border: "1px solid var(--field-border-strong)", background: "var(--field-bg-card)", color: "var(--field-text-secondary)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
