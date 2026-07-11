# Draft Persistence Model

Contractor drafts remain local-only and contain construction operational data; localStorage is not encrypted and must not contain access tokens, secrets, `File` objects, signed URLs, or object URLs.

Key: `openday:contractor-report:v1:<encoded-user-id>:<encoded-project-id>:<encoded-report-period>`.

Envelope fields: `schemaVersion`, `workflowType`, `userId`, `projectId`, `reportDate`, `reportPeriod`, `clientRequestId`, `formData`, `workPackageRows`, recoverable `evidenceItems`, `createdAt`, and `updatedAt`.

- Schema version: 1.
- Isolation: user + project + report period are mandatory.
- Autosave: 500 ms debounce after a meaningful edit.
- Expiration policy: drafts older than 14 days are marked stale, not deleted automatically.
- Corrupt/incompatible drafts: never partially restored or submitted; recovery UI explains the problem and offers removal.
- Legacy `contractor_draft_<project>` data: cannot be safely user-matched, so it is offered for removal and never restored.
- Recovery normalizes evidence to persisted storage paths. Browser `File`, blob URL, uploading, and submitting states are not restored.
- Cleanup: only after confirmed backend success/replay, or explicit user discard.

## PM Site Visit

PM uses the shared `workflowDraftStore` envelope/key inspection infrastructure with a PM adapter. Key context includes visit date and source contractor report. Payload adds PM observations plus `currentItemId`, `currentGroupId`, and `activeFilter`. Stale policy, corrupt/incompatible behavior, uploaded-path-only recovery, debounce, user/project isolation, and confirmed-success cleanup match Contractor Report.
