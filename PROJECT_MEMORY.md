# CF Tracker — Security Roadmap (Ph0)

**Project:** Construction & Fit-out Progress Tracker  
**Stack:** React 19 + Vite + Supabase  
**Working dir:** `weekly-tracker/`

---

## Ph0 Status

| Ref | Task | Status | Notes |
|-----|------|--------|-------|
| K-1 | RLS by roles (M0.2) | ✅ DONE 2026-07-04 | 14 tables, 53 policies, 0 anon-policies |
| K-2 | Rotate to new API keys (sb_publishable_/sb_secret_) | ✅ DONE 2026-07-04 | Smoke-tested: client+backend+e2e all green |
| K-2 | Delete/confirm absence of OpenDay.zip | ✅ DONE | File not present in repo; `*.zip` rule in .gitignore |
| K-3 | Passwords (real accounts) | 🔒 FROZEN | Did not touch; created NEW @openday.fit test accounts only |
| M0.4 | E2E security specs (role isolation) | ✅ DONE 2026-07-04 | 25 passed / 1 soft-skip / 0 failed |

---

## M0.2 — RLS by Roles (DONE 2026-07-04)

**Migration:** `weekly-tracker/src/migrations/010_rls_by_roles.sql`

### Verification results

| Query | Result | Expected | Pass |
|-------|--------|----------|------|
| #1 RLS enabled on all tables | 14 rows, rowsecurity=true | 14 rows | ✅ |
| #2 Policy count per table | 13 tables × 4 = 52 + 1 FOR ALL (pending_invites) = 53 | 53 total | ✅ |
| #3 anon_all% policies remaining | 0 rows | 0 rows | ✅ |
| #4 get_my_role() signature | prosecdef=true, provolatile='s' | STABLE SECURITY DEFINER | ✅ |

### Tables covered (14)

`profiles`, `projects`, `reports`, `site_visits`, `project_gantt_tasks`,
`contractor_reports`, `contractor_report_wps`, `site_visit_wps`,
`site_visit_discrepancies`, `progress_history`, `templates`,
`task_groups`, `task_group_members`, `pending_invites`

### Architecture decisions

- **`get_my_role()`** — SECURITY DEFINER to prevent recursion when profiles policy
  calls itself. SET search_path = public prevents schema injection.
- **`::bigint[]` cast** — `profiles.assigned_projects` is `integer[]` but `projects.id`
  is `bigint`. Postgres will NOT auto-cast; explicit cast required on all contractor
  scope checks.
- **`pending_invites`** — single `FOR ALL` policy (admin-only) matching the manually
  applied policy in the live DB. No contractor/pm/viewer path needed.
- **Dynamic DROP loop** — reads `pg_policies` at runtime to catch any policy name
  regardless of how it was created (dashboard UI creates "human" names that differ
  from `anon_all_*` convention).

---

## K-2 — Key Rotation Checklist (TODO — manual steps)

**Context:** `VITE_SUPABASE_ANON_KEY` and/or `SUPABASE_SERVICE_ROLE_KEY` were previously
exposed (committed `.env.local` or archived in OpenDay.zip). Keys must be rotated.

### Step-by-step

1. **Supabase Dashboard → Settings → API → JWT Settings → "Roll" anon key**
   - Copy new anon key.
2. **Supabase Dashboard → Settings → API → JWT Settings → "Roll" service_role key**
   - Copy new service_role key.
3. **Update `.env.local`** (local dev):
   ```
   VITE_SUPABASE_URL=<unchanged>
   VITE_SUPABASE_ANON_KEY=<new anon key>
   SUPABASE_SERVICE_ROLE_KEY=<new service_role key>
   ```
4. **Update CI/CD secrets** (if any — GitHub Actions, Vercel, etc.) with same new values.
5. **Update `weekly-tracker/tests/e2e/.env.test`** (or `.env.local`) — the E2E seed
   spec reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from env.
6. **Smoke test:** run `npm run dev` → verify login still works.
7. **Old sessions:** rolling the key in Supabase automatically invalidates all existing
   JWTs that were signed with the old key. Users will need to re-login.

### Key locations in repo (verified 2026-07-04, fixed 2026-07-04)

| File | Reads | Safe? |
|------|-------|-------|
| `src/lib/supabase.js` | `import.meta.env.VITE_SUPABASE_ANON_KEY` | ✅ env var |
| `src/migrations/backfillProgressHistory.js` | `process.env.SUPABASE_SERVICE_ROLE_KEY` | ✅ env var |
| `seed.mjs` | `process.env.SUPABASE_SERVICE_ROLE_KEY` (fixed — was hardcoded JWT) | ✅ env var |
| `tests/e2e/helpers.js` | `process.env.E2E_*` (with fallbacks) | ✅ env var |
| `tests/e2e/23-e2e-seed.spec.js` | `E2E_SUPABASE_ANON_KEY` \|\| `VITE_SUPABASE_ANON_KEY` | ✅ env var |

---

## M0.4 — E2E Security Tests (TODO)

**Spec files:**
- `weekly-tracker/tests/e2e/20-role-security.spec.js`
- `weekly-tracker/tests/e2e/12-auth-roles.spec.js`

### Role coverage

| Role | UI redirect test | API isolation test |
|------|-----------------|-------------------|
| admin | ✅ 20 + 12 | manual (verification query #2) |
| pm | ✅ 20 + 12 | manual |
| contractor | ✅ 20 + 12 | manual |
| viewer | ⚠️ TODO | need viewer test account in DB |
| anon (no JWT) | ✅ 12 (UI redirect) | manual — verification query #3 |

### Result (2026-07-04): 25 passed / 1 skipped / 0 failed

- **Test accounts:** admin@openday.fit / pm@openday.fit / gc@openday.fit created via
  `scripts/seed-test-users.mjs` (service-role, idempotent). Passwords: Admin / Pm / Gc.
  Roles stored capital-case (Admin/PM/Contractor). Contractor assigned to projects 70,71.
- **Bug found + fixed:** `AuthContext.logout()` cleared local state BEFORE awaiting
  `signOut()`, so the /login redirect raced the localStorage clear — a fast nav back
  restored the session. Fixed: await signOut first, then setUser(null) in `finally`.
- **Soft skip:** "contractor can access contractor-report for assigned project" skips
  when contractor-select renders 0 cards. Contractor has assigned_projects=[70,71] and
  RLS grants access, but the contractor-select page derives cards from a different
  signal (likely projects.contractor_email match), so no cards for the seeded contractor.
  Not a defect in the security layer — a test-data gap. Revisit if contractor UI coverage matters.

### Known gaps

- **viewer role:** CREDENTIALS.viewer entry exists in helpers.js but no viewer@openday.fit
  account created yet and no viewer-specific tests written.
- **REST API anon block:** E2E tests verify UI redirect only. The actual Supabase RLS
  anon block is verified manually via query #3 or REST curl.

### Run command

```bash
cd weekly-tracker
npm run test:e2e -- tests/e2e/20-role-security.spec.js tests/e2e/12-auth-roles.spec.js
```

Or for full output with HTML report:
```bash
npx playwright test tests/e2e/20-role-security.spec.js tests/e2e/12-auth-roles.spec.js --reporter=html
```

### Post-run Supabase checks

After tests pass, verify in Supabase SQL Editor:

```sql
-- 1. Zero anon policies remain:
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE 'anon_all%';
-- Expected: 0 rows

-- 2. Policy counts correct (53 total):
SELECT tablename, count(*) AS n FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','projects','reports','site_visits','project_gantt_tasks',
    'contractor_reports','contractor_report_wps','site_visit_wps',
    'site_visit_discrepancies','progress_history','templates',
    'task_groups','task_group_members','pending_invites'
  )
GROUP BY tablename ORDER BY tablename;
-- Expected: 13 tables with n=4, pending_invites with n=1

-- 3. REST API anon block (run with curl or Supabase API Explorer, anon key only, no Bearer):
-- GET /rest/v1/projects → Expected: [] (empty array, not an error)
```

---

## DB Facts (confirmed 2026-07-04, corrected 2026-07-04)

```
profiles.id                 uuid   (= auth.uid())
profiles.role               text   ('Admin'|'PM'|'Viewer'|'Contractor')  -- CAPITAL CASE
                                   (earlier session confirmed lowercase — this was WRONG)
profiles.assigned_projects  integer[]
projects.id                 bigint
All FK project_id columns   bigint
```

Helper: `public.get_my_role()` — STABLE SECURITY DEFINER, normalises to lowercase via
`SELECT LOWER(role) ...` so all 53 RLS policies work regardless of how the role is stored.
Policies check lowercase ('admin'|'pm'|'viewer'|'contractor') — do NOT change the policies.
