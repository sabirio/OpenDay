# Idempotent Retry UX

The same `client_request_id` represents one business submission.

| Scenario | UI behavior | Request ID |
| --- | --- | --- |
| validation failure | accessible summary, focus moves to summary, form retained | unchanged |
| upload pending | submit disabled with visible upload label | unchanged |
| network/timeout | persistent retryable error, draft retained | unchanged |
| retry | one in-flight request; duplicate click ignored | unchanged |
| authorization/fatal failure | persistent non-retryable error, data retained | unchanged |
| idempotent replay | success explains earlier report was confirmed and no duplicate created | retired after confirmation |
| normal success | persisted success view, draft removed | retired |

Success is never inferred from a lost response. The application waits for the service result, which carries the RPC `idempotentReplay` flag and persisted report identity.

PM Site Visit uses the same lifecycle. `submitSiteVisitModel` returns persisted visit identity plus `idempotentReplay`; a replay shows “already confirmed” and does not rotate the request ID until confirmation.
