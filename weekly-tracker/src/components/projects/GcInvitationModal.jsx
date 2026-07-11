import Modal from "../shared/Modal";

export default function GcInvitationModal({
  project,
  email,
  status,
  inputStyle,
  onEmailChange,
  onStatusReset,
  onInvite,
  onClose,
  initialEmail = "",
}) {
  if (!project) return null;

  const emailValid = email && email.includes("@");
  const isDirty = email !== initialEmail;

  return (
    <Modal
      onClose={onClose}
      titleId="gc-invitation-title"
      isDirty={isDirty}
      dirtyMessage="Discard this invitation email change?"
      style={{ maxWidth: 460, width: "95vw", padding: 0, overflow: "hidden" }}
    >
        <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                GC Portal Invitation
              </p>
              <h2 id="gc-invitation-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
                {project.shoppingMallName || project.storeCode}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {project.storeCode} - {project.city}, {project.country}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1, flexShrink: 0 }}
            >x</button>
          </div>
        </div>

        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Contractor", value: project.generalContractor || "-" },
              { label: "Opening", value: project.targetOpeningDate || "-" },
              { label: "Status", value: project.projectStatus || "-" },
            ].map(({ label, value }) => (
              <div key={label} style={{ flex: 1, background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Contractor Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { onEmailChange(e.target.value); onStatusReset(); }}
              style={{ ...inputStyle, fontSize: 14 }}
              placeholder="gc@company.com"
              autoFocus
            />
          </div>

          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 20px", lineHeight: 1.5 }}>
            The same email can be used across multiple projects - the contractor will see all assigned projects after login.
          </p>

          {status === "sent" && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--status-done-bg)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13, color: "var(--status-done)", lineHeight: 1.5 }}>
              <strong>Invite sent</strong><br />
              Magic link sent to <strong>{email}</strong>. The contractor will be logged in directly.
            </div>
          )}
          {status === "access_granted" && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--accent-subtle)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13, color: "var(--accent)", lineHeight: 1.5 }}>
              <strong>Access granted</strong><br />
              This contractor is already registered. They will see this project on their next login.
            </div>
          )}
          {status === "error" && (
            <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--status-alert-bg)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13, color: "var(--status-alert)", lineHeight: 1.5 }}>
              <strong>Something went wrong</strong><br />
              Check the email address and try again.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="secondary-button" onClick={onClose}>Cancel</button>
            <button
              className="primary-button"
              onClick={onInvite}
              disabled={!emailValid || status === "sending"}
              style={{ opacity: !emailValid ? 0.45 : 1, minWidth: 130 }}
            >
              {status === "sending"
                ? "Sending..."
                : status === "sent"
                  ? "Resend Invite"
                  : status === "access_granted"
                    ? "Resend Link"
                    : "Send Invite"}
            </button>
          </div>
        </div>
    </Modal>
  );
}
