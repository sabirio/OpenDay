# Contractor Report Workflow

## State contract

| State | Entry condition | Allowed actions | Exit |
| --- | --- | --- | --- |
| `idle` | new workflow/request ID | edit, inspect draft | editing/restoring |
| `restoring-draft` | compatible or stale draft found | continue, discard | editing |
| `editing` | user changes recoverable business data | edit, upload, validate | uploading/validating |
| `validating` | submit intent | none | validation-error/submitting |
| `validation-error` | local rules fail | edit | editing |
| `uploading` | queued/compressing/uploading item | wait | editing/ready |
| `ready` | no blockers | submit | submitting |
| `submitting` | one command in flight | none; duplicate click ignored | submitted/retryable-error/fatal-error |
| `retryable-error` | normalized network/conflict error | edit, retry same request | editing/submitting |
| `fatal-error` | auth/database non-retryable error | edit/contact support | editing |
| `submitted` | persisted result or replay confirmed | close/new report | idle |

`useContractorReportWorkflow` is the UI facade over the pure reducer. Submit status is no longer assembled from independent `submitted`/`submitting`/error booleans.

## Submission boundary

`ContractorReport.jsx` → workflow/orchestration hook → `submitContractorReportModel` → `contractorReportService.submitReport` → certified `submit_contractor_report_atomic` RPC.

The page performs no Tier-1 writes. Duplicate WP IDs are rejected before RPC. Persisted WP rows are built only from the currently scoped Gantt tasks, so stale/out-of-scope draft keys cannot be submitted. Draft cleanup occurs only after the service returns a persisted result or confirmed idempotent replay.

## Request lifecycle

New report → secure UUID → versioned autosave → submit → same UUID on retry/replay → confirmed result → draft removal → UUID retired. Validation errors never rotate the UUID.
