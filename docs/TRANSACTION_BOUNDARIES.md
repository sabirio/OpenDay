# Transaction boundaries

## Contractor Report command

- Inputs: project, report date, unique client request ID, validated WP collection, report/canonical snapshot metadata and evidence paths.
- Writes: contractor report header, WP rows, progress-history snapshot, Gantt progress cache; audit trigger on header.
- Invariant: all rows reference the same authenticated actor/project/company and one source request.
- Success: return existing or newly committed header/items/history identity.
- Rollback: any validation/authorization/child/cache error aborts the function transaction.
- Idempotency: unique `(submitted_by, client_request_id)`; replay returns existing result.

File bytes are outside this transaction. Only already-uploaded object paths are referenced.

## PM Site Visit command

- Inputs: project/report/date, client request ID, observations with explicit source progress/status and discrepancy metadata, notes/evidence paths.
- Writes: site visit header, WP observations, discrepancy summaries, a source-linked progress-history event, Gantt discrepancy cache; audit trigger on header.
- Invariant: authenticated Admin/PM can access the project; observations are unique and belong to active project Gantt WPs; sign/version is explicit.
- Success: all SQL records commit and one persisted result is returned.
- Rollback: any invalid item or SQL failure aborts all records.
- Idempotency: unique `(visited_by, client_request_id)`; replay returns the committed result.

## Project mutation

Projects remain single-row commands with existing RLS/audit. Gantt task generation is a separate derived-cache command and is not falsely represented as one project SQL transaction.

