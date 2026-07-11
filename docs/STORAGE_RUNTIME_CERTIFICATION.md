# Storage Runtime Certification — Sprint 4.5, Stage 9

Real uploads/reads/deletes through real authenticated `supabase.storage`
clients against the local `site-photos` bucket — not mocked, not read from
policy SQL alone. Script:
`weekly-tracker/scripts/certification/certifyStorage.mjs`. Run via
`npm run test:storage`. **22/22 checks passed.**

| Scenario | Expected | Actual | Status |
|---|---|---|---|
| ST-01 valid upload (assigned user, trusted path) | object created, private, correct path, authorized read works | upload succeeded at the exact path convention (`{project}/{yyyy-mm}/{userId}_{ts}.png`); uploader's own `list()` finds it | PASS |
| ST-02 foreign tenant path upload | denied | denied | PASS |
| ST-03 foreign tenant read | denied | `list()` returns no matching object; direct `download()` denied | PASS |
| ST-04 foreign tenant delete | denied | object still present after the attempt (confirmed via an authorized read from the owning tenant, not just the response shape) | PASS |
| ST-04b own-tenant delete (positive case) | authorized own-tenant user uploads, confirms present, deletes, authorized lookup confirms absent; cross-tenant and anon delete attempts on the same still-live object remain denied throughout | full lifecycle matched exactly: setup upload succeeded; present-before-delete confirmed; cross-tenant delete attempt had no effect (still present); anonymous delete attempt had no effect (still present); own-tenant delete succeeded; authorized lookup confirmed absence; direct `download()` of the deleted object failed (genuinely gone, not just missing from `list()`) | PASS — 7 checks |
| ST-05 invalid MIME type | rejected, server-side | rejected | PASS — enforced by `storage.buckets.allowed_mime_types` (017), confirmed present in Stage 3, confirmed enforced here at runtime |
| ST-06 file > 5MB | rejected, server-side | rejected | PASS — enforced by `storage.buckets.file_size_limit=5242880` (017), confirmed present in Stage 3, confirmed enforced here at runtime |
| ST-07 duplicate filename | no silent overwrite | second upload to the identical path rejected (`upsert:false` default); real app paths include a per-upload timestamp, making an accidental collision practically impossible | PASS |
| ST-08 upload succeeded, DB finalize failed | draft retains object path; finalize retry-safe; no duplicate evidence row; object pending/orphan until finalize | **FINDING** — see below | Documented, not fixed |
| ST-09 DB intent exists, upload failed | recovery/cleanup state | **FINDING** — see below | Documented, not fixed |
| ST-10 orphan identification | controlled query can find orphans, no auto-delete | confirmed: bucket contents are listable/enumerable by an authorized user, giving the query surface a reconciliation job would need | PASS (capability confirmed; no automated job exists) |

## Enforcement layer (where each rule actually lives)

- **MIME type / file size**: `storage.buckets` row (`017_site_photos_bucket_v2.sql`), enforced by Supabase Storage server-side — not merely a client-side `<input accept>` check. Confirmed both statically (Stage 3 schema query) and dynamically (this stage's actual rejected uploads).
- **Tenant/project scoping**: `storage.objects` RLS policies (`020_rls_company_role_hardening.sql`), calling `public.can_access_project()` against the path's leading folder segment.
- **Upload/delete ownership**: same policies, `split_part(storage.filename(name), '_', 1) = auth.uid()::text`.

## ST-08/ST-09 finding — no cross-system transaction between Storage and the DB

Object storage and Postgres are two independent systems; there is no
2-phase-commit between "file landed in the bucket" and "a DB row references
it." A client that uploads successfully and then fails before whatever
finalize step exists (e.g. before an atomic RPC call that would record the
photo URL) leaves a real, non-deleted object with no DB reference — an
orphan. Symmetrically, a DB-side "intent" (if one is ever recorded before
upload) can outlive a failed upload. This is inherent to the
architecture, not something migration 025 introduced or was scoped to
fix, and there is no automated finalize-retry or orphan-sweep job in this
migration chain today. Object paths already carry enough information
(`project_id`, `user_id`, timestamp) to reconcile orphans via a controlled
query (ST-10 confirms the query surface works) — building that
reconciliation job is future work, not a Sprint 4.5 certification gap.

## Verdict

**PASS**, with the ST-08/09 architectural gap explicitly documented rather
than silently accepted. Upload, own-tenant delete (ST-04b, added in a
Sprint 4.5 continuation pass — ST-04 previously only covered the
cross-tenant negative case), cross-tenant denial, MIME/size enforcement,
and orphan-query capability are all confirmed by real Storage API calls.
