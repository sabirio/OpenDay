# Upload Workflow UI

Per-file states are `queued`, `uploading`, `uploaded`, and `failed`; the workflow reducer additionally understands `compressing` and `finalizing` for future compatible adapters.

| State/scenario | UI | Recovery |
| --- | --- | --- |
| invalid MIME | JPEG/PNG/WebP requirement announced | choose another file |
| empty/over 20 MB source | precise error announced | choose a valid smaller file |
| queued/uploading | preview with busy overlay; submit blocked | wait |
| uploaded | thumbnail or restored “uploaded photo” tile | remove if needed |
| failed | item remains visible with Retry | retry same in-memory file or remove/reselect |
| refreshed draft | persisted private storage paths restored; no blob/File restoration | existing evidence remains attached |

Compression/upload still has a 20-second timeout and one automatic transient retry. Private storage paths—not signed URLs—are persisted. Preview URLs are revoked on removal/unmount. Storage and PostgreSQL are not one transaction; orphan reconciliation remains outside this sprint.

PM Site Visit now passes existing paths and per-file items into the same shared component. Pending shared upload states block PM submit. Current schema relates evidence to the visit header, not an individual WP observation; per-observation evidence relation would require a schema/RPC change and is not claimed.
