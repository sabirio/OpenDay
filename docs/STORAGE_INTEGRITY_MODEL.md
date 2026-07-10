# Storage integrity model

**Update 2026-07-10 (Sprint 4.5):** the model below was design/static
analysis when written. It has since been runtime-certified against a real
local Supabase Storage API — real uploads, real cross-tenant denial, real
MIME/size rejection — see `docs/STORAGE_RUNTIME_CERTIFICATION.md` (ST-01
through ST-10) for the executed evidence. The "orphan object" risk
described below was confirmed to still be real and unmitigated (ST-08/09):
no automated reconciliation job exists in this migration chain today; only
the query capability to build one was confirmed (ST-10).

Bucket: private `site-photos`, 5 MB, JPEG/PNG/WebP/HEIC. Current trusted path builder produces `{project}/{year-month}/{actor}_{timestamp}_{seq}.jpg`; migration 020 checks project access and actor-owned filename. Signed URLs are used.

Target controlled workflow:

```text
pending upload intent → upload object → finalize evidence link in Tier-1 command
→ ready; abandoned pending/object → reviewable cleanup candidate
```

Sprint 4 keeps the existing upload-first flow and passes finalized paths into atomic SQL commands. A failed SQL command can leave an orphan object; the draft retains the path for retry with the same request ID. No automatic production deletion was added. Cleanup must list old unreferenced objects under an authorized project prefix, produce a dry-run report, and require explicit execution approval.

