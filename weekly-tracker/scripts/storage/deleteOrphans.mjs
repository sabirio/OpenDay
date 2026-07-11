// Sprint 5 — Phase 6: Storage orphan cleanup.
//
// Deliberately NOT "re-run findOrphanCandidates.mjs and delete whatever it
// finds" — that would remove the human review step entirely. This script
// only deletes paths a human has explicitly listed in a file (presumably
// after reviewing findOrphanCandidates.mjs's output), and re-validates
// every one of them (still not referenced, still old enough, still under
// the given project) immediately before deleting, in case anything
// changed since that file was written.
//
// Dry-run by default. Nothing is deleted unless --execute is passed.
//
// SAFETY — same explicit-env-var-only rule as findOrphanCandidates.mjs,
// see that file's header for why (docs/INCIDENT_2026-07-10_PRODUCTION_SIDE_EFFECT.md).
//   ORPHAN_SUPABASE_URL / ORPHAN_SUPABASE_SERVICE_ROLE_KEY / ORPHAN_DB_URL
//
// Required flags (no defaults, no wildcard-root deletion — every run is
// scoped to exactly one project):
//   --project=<id>         every path in --paths-file must start with
//                          "<id>/" — anything else is refused, not skipped
//   --paths-file=<path>    one storage path per line, blank lines and
//                          lines starting with # are ignored
//   --reason="<text>"      free-text operator note, written into the audit log
//
// Optional:
//   --min-age-days=7       re-checked at delete time (default matches
//                          findOrphanCandidates.mjs's own default)
//   --execute              actually delete; omit for a dry-run (default)
//
// Usage (dry-run — always safe, prints what would happen):
//   ORPHAN_SUPABASE_URL=... ORPHAN_SUPABASE_SERVICE_ROLE_KEY=... ORPHAN_DB_URL=... \
//     node scripts/storage/deleteOrphans.mjs --project=900001 \
//       --paths-file=./orphans-to-delete.txt --reason="reviewed 2026-07-11, confirmed abandoned drafts"
//
// Usage (actually delete, after reviewing the dry-run output):
//   ... node scripts/storage/deleteOrphans.mjs --project=900001 \
//       --paths-file=./orphans-to-delete.txt --reason="..." --execute
//
// Every run (dry-run or --execute) writes a timestamped JSON audit record
// to scripts/storage/audit-log/ — see docs/STORAGE_ORPHAN_RUNBOOK.md.

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const BUCKET = 'site-photos';
const DEFAULT_MIN_AGE_DAYS = 7;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { project: null, pathsFile: null, reason: null, minAgeDays: DEFAULT_MIN_AGE_DAYS, execute: false };
  for (const arg of argv) {
    if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg.startsWith('--paths-file=')) args.pathsFile = arg.slice('--paths-file='.length);
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg.startsWith('--min-age-days=')) args.minAgeDays = Number(arg.slice('--min-age-days='.length));
    else if (arg === '--execute') args.execute = true;
  }
  return args;
}

function requireArgs(args) {
  const missing = [];
  if (!args.project) missing.push('--project=<id>');
  if (!args.pathsFile) missing.push('--paths-file=<path>');
  if (!args.reason) missing.push('--reason="<text>"');
  if (missing.length > 0) {
    console.error(`REFUSING TO RUN: missing required flag(s): ${missing.join(', ')}\n`);
    console.error('Every run must be scoped to one project, list exact paths a human reviewed,');
    console.error('and record why — no wildcard-root deletion, no auto-detect-and-delete.');
    process.exit(1);
  }
}

function requireEnv() {
  const url = process.env.ORPHAN_SUPABASE_URL;
  const key = process.env.ORPHAN_SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.ORPHAN_DB_URL;
  if (!url || !key || !dbUrl) {
    console.error(
      'REFUSING TO RUN: requires ORPHAN_SUPABASE_URL, ORPHAN_SUPABASE_SERVICE_ROLE_KEY, ' +
      'ORPHAN_DB_URL — no fallback file is read. See findOrphanCandidates.mjs header for why.'
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

function fetchReferencedPaths(dbUrl, projectFilter) {
  const referenced = new Set();
  const projectClause = `WHERE project_id = ${Number(projectFilter)}`;
  for (const [table, col] of [['contractor_reports', 'photo_urls'], ['site_visits', 'photos'], ['site_visits', 'photo_urls']]) {
    const out = psql(dbUrl, `SELECT unnest(${col}) FROM public.${table} ${projectClause};`);
    for (const line of out.split('\n')) if (line.trim()) referenced.add(line.trim());
  }
  return referenced;
}

function loadPaths(filePath, project) {
  const raw = readFileSync(filePath, 'utf8');
  const paths = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const invalid = paths.filter(p => !p.startsWith(`${project}/`));
  if (invalid.length > 0) {
    console.error(`REFUSING TO RUN: ${invalid.length} path(s) in ${filePath} do not start with "${project}/":`);
    for (const p of invalid) console.error(`  ${p}`);
    console.error('\nEvery path must belong to the --project you specified. Fix the file or the flag.');
    process.exit(1);
  }
  return paths;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const { url, key, dbUrl } = requireEnv();

  console.log(`Target Supabase project: ${url}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log(`Scope: project ${args.project} only`);
  console.log(`Reason: ${args.reason}`);
  console.log(`Mode: ${args.execute ? 'EXECUTE (will actually delete)' : 'DRY-RUN (nothing will be deleted)'}\n`);

  const candidatePaths = loadPaths(args.pathsFile, args.project);
  console.log(`${candidatePaths.length} path(s) listed in ${args.pathsFile}.\n`);

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const referencedNow = fetchReferencedPaths(dbUrl, args.project);
  const minAgeMs = args.minAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const toDelete = [];
  const skipped = [];

  for (const p of candidatePaths) {
    if (referencedNow.has(p)) { skipped.push({ path: p, reason: 're-check: now referenced by a DB row — no longer an orphan' }); continue; }

    const dir = p.split('/').slice(0, -1).join('/');
    const filename = p.split('/').pop();
    const { data: listing, error } = await admin.storage.from(BUCKET).list(dir, { limit: 1000 });
    if (error) { skipped.push({ path: p, reason: `re-check failed: ${error.message}` }); continue; }
    const entry = (listing ?? []).find(f => f.name === filename);
    if (!entry) { skipped.push({ path: p, reason: 're-check: object no longer exists in Storage (already gone)' }); continue; }

    const ageMs = entry.created_at ? now - new Date(entry.created_at).getTime() : 0;
    if (ageMs < minAgeMs) { skipped.push({ path: p, reason: `re-check: only ${(ageMs / 86400000).toFixed(1)} days old, below the ${args.minAgeDays}-day minimum` }); continue; }

    toDelete.push(p);
  }

  console.log(`After re-validation: ${toDelete.length} to delete, ${skipped.length} skipped.\n`);
  for (const s of skipped) console.log(`  SKIP  ${s.path} — ${s.reason}`);

  let deleted = [];
  let deleteErrors = [];
  if (args.execute && toDelete.length > 0) {
    const { data, error } = await admin.storage.from(BUCKET).remove(toDelete);
    if (error) {
      deleteErrors.push(error.message);
      console.error(`\nDELETE FAILED: ${error.message}`);
    } else {
      deleted = (data ?? []).map(d => d.name ?? d.path ?? d);
      console.log(`\nDeleted ${deleted.length} object(s).`);
    }
  } else if (toDelete.length > 0) {
    console.log('\nDRY-RUN — would delete:');
    for (const p of toDelete) console.log(`  ${p}`);
    console.log('\nRe-run with --execute to actually delete these.');
  }

  mkdirSync(path.join(__dirname, 'audit-log'), { recursive: true });
  const auditPath = path.join(__dirname, 'audit-log', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(auditPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    project: args.project,
    reason: args.reason,
    mode: args.execute ? 'execute' : 'dry-run',
    minAgeDays: args.minAgeDays,
    pathsFile: args.pathsFile,
    candidateCount: candidatePaths.length,
    deleted,
    skipped,
    deleteErrors,
  }, null, 2));
  console.log(`\nAudit record written: ${auditPath}`);
}

main().catch(err => {
  console.error('DELETE SCRIPT FAILED:', err.message);
  process.exit(1);
});
