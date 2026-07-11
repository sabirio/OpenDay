// Sprint 5 — Phase 6: Storage orphan candidate identification.
//
// Read-only by default. Lists objects in the `site-photos` bucket that
// are NOT referenced by any known DB row (contractor_reports.photo_urls,
// site_visits.photos, site_visits.photo_urls) and are older than a safety
// threshold. (site_visit_discrepancies has no photo/evidence column — the
// live schema was checked, not assumed.)
//
// SAFETY — target selection is deliberately explicit, no fallback file:
//   This project's weekly-tracker/.env.local points at the LIVE
//   openday.fit production project (see docs/CERTIFICATION_ENVIRONMENT.md
//   and docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md — an earlier
//   script in this same session accidentally wrote to production because
//   it silently read that file). This script NEVER reads .env.local or
//   any VITE_ variable. It requires three env vars to be set explicitly on
//   the command line every run:
//     ORPHAN_SUPABASE_URL              — for the Storage listing API
//     ORPHAN_SUPABASE_SERVICE_ROLE_KEY — for the Storage listing API
//     ORPHAN_DB_URL                    — a direct Postgres connection,
//       for the contractor_reports/site_visits reference check. Storage's
//       service-role key alone is NOT enough for this: `service_role` has
//       BYPASSRLS but was never GRANTed base SELECT on these tables (only
//       `authenticated` was, in migration 026) — a real, confirmed
//       local-environment finding, not a bug in
//       this script. PostgREST/supabase-js would hit "permission denied"
//       on these tables even with the service-role key; a direct
//       superuser-authenticated connection string sidesteps that, exactly
//       like scripts/certification/lib.mjs's psql() helper already does
//       for the same reason.
//   There is no default for any of the three. If any is missing, the
//   script refuses to run and prints instructions rather than guessing.
//
// Usage (local, read-only, all projects):
//   ORPHAN_SUPABASE_URL=http://127.0.0.1:54321 \
//   ORPHAN_SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key> \
//   ORPHAN_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//     node scripts/storage/findOrphanCandidates.mjs
//
// Usage (scope to one project, custom age threshold):
//   ... node scripts/storage/findOrphanCandidates.mjs --project=900001 --min-age-days=3
//
// Usage (JSON output, for piping into another tool):
//   ... node scripts/storage/findOrphanCandidates.mjs --json
//
// This script NEVER deletes anything — see deleteOrphans.mjs for the
// separate, explicitly-guarded cleanup command.

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const BUCKET = 'site-photos';
// 7 days matches this app's own existing staleness convention
// (MissingReportsModal.jsx already treats "no report in 7 days" as the
// missing/overdue threshold) — not an arbitrary number. Chosen specifically
// to comfortably exceed any realistic field-workflow duration (autosave is
// a 500ms local-storage debounce, not relevant to this threshold at all;
// what matters is how long a real user might leave an in-progress,
// unsubmitted report/visit with photos already uploaded before returning
// to finish it — a multi-day field assignment interruption is plausible,
// an object still unreferenced after 7 days is not).
const DEFAULT_MIN_AGE_DAYS = 7;

function parseArgs(argv) {
  const args = { project: null, minAgeDays: DEFAULT_MIN_AGE_DAYS, json: false };
  for (const arg of argv) {
    if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg.startsWith('--min-age-days=')) args.minAgeDays = Number(arg.slice('--min-age-days='.length));
    else if (arg === '--json') args.json = true;
  }
  return args;
}

function requireEnv() {
  const url = process.env.ORPHAN_SUPABASE_URL;
  const key = process.env.ORPHAN_SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.ORPHAN_DB_URL;
  if (!url || !key || !dbUrl) {
    console.error(
      'REFUSING TO RUN: this script requires 3 explicit env vars, no fallback file is read.\n\n' +
      '  ORPHAN_SUPABASE_URL=<url> \\\n' +
      '  ORPHAN_SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \\\n' +
      '  ORPHAN_DB_URL=<postgres-connection-string> \\\n' +
      '    node scripts/storage/findOrphanCandidates.mjs\n\n' +
      'This is deliberate: weekly-tracker/.env.local points at the live openday.fit\n' +
      'production project (see docs/CERTIFICATION_ENVIRONMENT.md). This script never\n' +
      'reads that file or any VITE_ variable, specifically to prevent a repeat of the\n' +
      'incident in docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md.'
    );
    process.exit(1);
  }
  return { url, key, dbUrl };
}

function psql(dbUrl, sql) {
  return execFileSync(
    'psql',
    [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` } }
  ).trim();
}


// Path convention (017's header, confirmed in Sprint 4.5 Storage
// certification): {project_id}/{year-month}/{userId}_{timestamp}.ext
function parsePath(fullPath) {
  const m = fullPath.match(/^(\d+)\/(\d{4}-\d{2})\/([0-9a-fA-F-]{36})_(\d+)\.[a-zA-Z0-9]+$/);
  if (!m) return { projectId: null, yearMonth: null, uploaderId: null, timestampMs: null, pathValid: false };
  return { projectId: m[1], yearMonth: m[2], uploaderId: m[3], timestampMs: Number(m[4]), pathValid: true };
}

async function listAllObjects(admin, projectFilter) {
  const results = [];
  const { data: topLevel, error: topErr } = await admin.storage.from(BUCKET).list('', { limit: 1000 });
  if (topErr) throw new Error(`Failed to list bucket root: ${topErr.message}`);

  const projectFolders = (topLevel ?? [])
    .filter(entry => entry.id === null || entry.name) // folders have no `id`/metadata in some storage-js versions; keep permissive
    .map(entry => entry.name)
    .filter(name => /^\d+$/.test(name))
    .filter(name => !projectFilter || name === String(projectFilter));

  for (const projectId of projectFolders) {
    const { data: monthFolders, error: monthErr } = await admin.storage.from(BUCKET).list(projectId, { limit: 1000 });
    if (monthErr) { console.warn(`  WARN: could not list ${projectId}/: ${monthErr.message}`); continue; }
    for (const month of (monthFolders ?? [])) {
      const monthPath = `${projectId}/${month.name}`;
      const { data: files, error: fileErr } = await admin.storage.from(BUCKET).list(monthPath, { limit: 1000 });
      if (fileErr) { console.warn(`  WARN: could not list ${monthPath}/: ${fileErr.message}`); continue; }
      for (const file of (files ?? [])) {
        if (!file.name || file.id === null && file.metadata === undefined) continue; // skip nested "folders" defensively
        const fullPath = `${monthPath}/${file.name}`;
        results.push({ fullPath, createdAt: file.created_at, updatedAt: file.updated_at, sizeBytes: file.metadata?.size ?? null });
      }
    }
  }
  return results;
}

// Direct Postgres read (not the REST client — see the file header for why:
// service_role has BYPASSRLS but no base GRANT on these tables). This is a
// read-only SELECT; nothing here can mutate data.
function fetchReferencedPaths(dbUrl, projectFilter) {
  const referenced = new Set();
  const projectClause = projectFilter ? `WHERE project_id = ${Number(projectFilter)}` : '';

  const crOut = psql(dbUrl, `SELECT unnest(photo_urls) FROM public.contractor_reports ${projectClause};`);
  for (const line of crOut.split('\n')) if (line.trim()) referenced.add(line.trim());

  // site_visits carries two evidence columns (`photos` and `photo_urls`) —
  // confirmed by reading the live schema, not assumed. Which one the
  // current atomic RPC actually writes to wasn't independently re-verified
  // here, so both are checked conservatively: a path is only ever flagged
  // as an orphan candidate if it appears in *neither*.
  const svPhotosOut = psql(dbUrl, `SELECT unnest(photos) FROM public.site_visits ${projectClause};`);
  for (const line of svPhotosOut.split('\n')) if (line.trim()) referenced.add(line.trim());
  const svPhotoUrlsOut = psql(dbUrl, `SELECT unnest(photo_urls) FROM public.site_visits ${projectClause};`);
  for (const line of svPhotoUrlsOut.split('\n')) if (line.trim()) referenced.add(line.trim());

  return referenced;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { url, key, dbUrl } = requireEnv();

  console.log(`Target Supabase project: ${url}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Project filter: ${args.project ?? '(all projects)'}`);
  console.log(`Minimum age: ${args.minAgeDays} day(s)`);
  console.log('Mode: READ-ONLY (this script never deletes anything)\n');

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const objects = await listAllObjects(admin, args.project);
  const referencedPaths = fetchReferencedPaths(dbUrl, args.project);

  const now = Date.now();
  const minAgeMs = args.minAgeDays * 24 * 60 * 60 * 1000;

  const candidates = [];
  for (const obj of objects) {
    if (referencedPaths.has(obj.fullPath)) continue; // referenced — not an orphan candidate, regardless of age
    const parsed = parsePath(obj.fullPath);
    const ageMs = obj.createdAt ? now - new Date(obj.createdAt).getTime() : null;
    const ageDays = ageMs !== null ? +(ageMs / (24 * 60 * 60 * 1000)).toFixed(1) : null;
    if (ageDays === null || ageMs < minAgeMs) continue; // too young to safely call abandoned — a real in-progress upload, not an orphan candidate

    candidates.push({
      path: obj.fullPath,
      projectId: parsed.projectId,
      uploaderId: parsed.uploaderId,
      createdAt: obj.createdAt,
      ageDays,
      sizeBytes: obj.sizeBytes,
      reason: parsed.pathValid
        ? 'not referenced by any contractor_reports/site_visits row, older than threshold'
        : 'path does not match the expected {project}/{yyyy-mm}/{uuid}_{ts}.ext convention — flagged for manual review, not auto-assumed orphan',
    });
  }

  if (args.json) {
    console.log(JSON.stringify({ scannedObjects: objects.length, referencedCount: referencedPaths.size, candidates }, null, 2));
    return;
  }

  console.log(`Scanned ${objects.length} object(s), ${referencedPaths.size} distinct referenced path(s) across all evidence columns.\n`);
  if (candidates.length === 0) {
    console.log('No orphan candidates found.');
    return;
  }
  console.log(`${candidates.length} orphan candidate(s):\n`);
  console.log('PATH | PROJECT | UPLOADER | AGE (days) | SIZE | REASON');
  for (const c of candidates) {
    console.log(`${c.path} | ${c.projectId ?? '?'} | ${c.uploaderId ?? '?'} | ${c.ageDays} | ${c.sizeBytes ?? '?'}B | ${c.reason}`);
  }
  console.log('\nThis list identifies candidates only — nothing was deleted. See docs/STORAGE_ORPHAN_RUNBOOK.md for the next steps.');
}

main().catch(err => {
  console.error('ORPHAN SCAN FAILED:', err.message);
  process.exit(1);
});
