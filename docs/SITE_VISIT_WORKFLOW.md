# PM Site Visit Workflow

Flow: draft discovery → explicit recovery/new visit → source context → scoped item navigation → PM observation → evidence → review → atomic submit → retry/replay → confirmed success.

States: `idle`, `loading-source`, `restoring-draft`, `editing`, `validating`, `validation-error`, `uploading`, `reviewing`, `ready`, `submitting`, `submitted`, `retryable-error`, and `fatal-error`. Duplicate submit is ignored; retry retains the request ID; replay enters submitted.

Draft key: `openday:site-visit:v1:<user>:<project>:<visit-date>:<contractor-report>`. It stores observations, uploaded paths, request ID, current item/group/filter, timestamps, and form values. Recovery requires Continue or Discard. Old project-only drafts are never silently restored.

Gantt navigation shows one scoped item with GC status/progress beside PM input. Filters: all, incomplete, completed, discrepant. Next does not complete an item. Filters do not mutate data. Review exposes checked/incomplete/discrepant counts.

Gantt N/A is intentionally not invented: the certified observation status vocabulary has no N/A wire value. Legacy compatibility rows retain existing `Not Applicable` semantics.

Partial Gantt visits submit only explicitly observed scoped tasks. Site Visit RPC, discrepancy convention, and progress-history semantics are unchanged.
