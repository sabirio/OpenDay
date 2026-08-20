import Modal from "../shared/Modal";
import { Button, CONTROL_CLASS, Eyebrow, Field, Surface } from "../shared/UiPrimitives.jsx";
import { InlineAlert } from "../shared/UiPatterns.jsx";

export default function GcInvitationModal({
  project,
  email,
  status,
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
      className="modal w-full max-w-md overflow-hidden p-0"
    >
      <div className="border-b border-ui-border px-7 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>GC Portal Invitation</Eyebrow>
            <h2 id="gc-invitation-title" className="mt-1 text-xl font-bold text-ui-primary">
              {project.shoppingMallName || project.storeCode}
            </h2>
            <p className="mt-1 text-sm text-ui-muted">
              {project.storeCode} - {project.city}, {project.country}
            </p>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            aria-label="Close invitation"
            className="shrink-0 px-2 text-lg"
          >
            ×
          </Button>
        </div>
      </div>

      <div className="px-7 py-6">
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: "Contractor", value: project.generalContractor || "-" },
            { label: "Opening", value: project.targetOpeningDate || "-" },
            { label: "Status", value: project.projectStatus || "-" },
          ].map(({ label, value }) => (
            <Surface key={label} as="div" className="bg-ui-accent-subtle px-3 py-2.5">
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-ui-muted">{label}</div>
              <div className="truncate text-xs font-semibold text-ui-primary">{value}</div>
            </Surface>
          ))}
        </div>

        <div className="mb-2">
          <Field label="Contractor email">
            <input
              type="email"
              value={email}
              onChange={event => {
                onEmailChange(event.target.value);
                onStatusReset();
              }}
              className={CONTROL_CLASS}
              placeholder="gc@company.com"
              autoFocus
            />
          </Field>
        </div>

        <p className="mb-5 mt-2 text-xs leading-5 text-ui-muted">
          The same email can be used across multiple projects - the contractor will see all assigned projects after login.
        </p>

        {status === "sent" && (
          <InlineAlert tone="positive" className="mb-5 leading-5">
            <strong>Invite sent</strong><br />
            Magic link sent to <strong>{email}</strong>. The contractor will be logged in directly.
          </InlineAlert>
        )}
        {status === "access_granted" && (
          <InlineAlert tone="neutral" className="mb-5 leading-5">
            <strong>Access granted</strong><br />
            This contractor is already registered. They will see this project on their next login.
          </InlineAlert>
        )}
        {status === "error" && (
          <InlineAlert className="mb-5 leading-5">
            <strong>Something went wrong</strong><br />
            Check the email address and try again.
          </InlineAlert>
        )}

        <div className="flex justify-end gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={onInvite}
            disabled={!emailValid || status === "sending"}
            className="min-w-32"
          >
            {status === "sending"
              ? "Sending..."
              : status === "sent"
                ? "Resend Invite"
                : status === "access_granted"
                  ? "Resend Link"
                  : "Send Invite"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
