// Local-only Simplification Phase 3B / 3B.1 / 3C.1 / 4B.1 extension.
// Applies the hash-pinned 046-050 set on top of the canonical fresh-install
// baseline:
//   046: schedule_ownership_mode column (default AUTO_GENERATED) +
//        save_contractor_schedule_draft SECURITY DEFINER RPC.
//   047: replaces 046's RPC body only (same signature) to accept
//        human-facing inclusive Finish dates instead of the internal
//        exclusive boundary — see 047's own header for the full contract
//        change and rationale.
//   048: replaces 047's RPC body only (same signature) to remove the
//        can_write_project()-based admin/pm authorization branch —
//        Contractor Draft ownership is Contractor-only — see 048's own
//        header for the full rationale.
//   049: adds project_schedule_versions/project_schedule_version_tasks
//        (versioned submission/review/baseline foundation) + the
//        submit_contractor_schedule / request_schedule_changes /
//        approve_schedule_submission SECURITY DEFINER RPCs + the canonical
//        contractor_schedule_lifecycle_status() helper — see 049's own
//        header for the full storage model and rationale.
//   050: replaces 048's save_contractor_schedule_draft body only (same
//        signature) to add the lifecycle lock — Save Draft is rejected once
//        a submission is PENDING_REVIEW or APPROVED — see 050's own header.
//
// Deliberately NOT part of resetAndDeploy.mjs's always-on canonical chain —
// same posture as the Master Catalog slices (042-045) and, further back,
// the Snag List (030-035) and Import Foundation (037-040) batches: every
// post-041 feature addition in this repository uses this exact opt-in
// pattern (own apply script + own cert:reset:<feature> command), not
// canonicalMigrationPath.included, which is tied to the separate
// production-only composite-security-certification.ps1 pipeline (requires
// a real production backup/commit/manifest this repo's local tooling
// cannot and must not fabricate). Audited and confirmed as the intended
// pattern during Simplification Phase 3B.1 — this is foundation work,
// reproducible via `npm run cert:reset:contractor-schedule`, not something
// every fresh local environment gets by default until a later phase
// activates the Contractor Schedule workflow for real.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget } from './localTargetGuard.mjs';

const DB_URL = process.env.CERT_DB_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '..', '..', 'src', 'migrations');
const migrations = [
  ['046_contractor_schedule_draft_foundation.sql', '989d09af15d4ed2d216cd0d0f51805ea8a080dc789cb3f1149289e0e738b2fa8'],
  ['047_contractor_schedule_human_date_semantics.sql', '7e3fea282eac83a588b20b76440572402218f7c99f0c001afab43ec9f9213b68'],
  ['048_contractor_schedule_ownership_enforcement.sql', '339862f93bba8d4839b8e4aececb99ed9f0cf95151b6c6a900d3e8b973efc7f0'],
  ['049_contractor_schedule_submission_lifecycle.sql', 'a963cf161009a0ac648ccac93333ec765b729de2cff7232e3b2a64e75010e20e'],
  ['050_contractor_schedule_draft_lifecycle_lock.sql', '1cc114d59219cc1e31f5e4102a46f0446c95196297bc18cd694b4bda60627bb4'],
];

assertLocalTarget({
  apiUrl: process.env.CERT_SUPABASE_URL,
  dbUrl: DB_URL,
  enabled: process.env.LOCAL_FIXTURE_MODE,
  projectId: process.env.LOCAL_SUPABASE_PROJECT_ID,
});

for (const [file, expectedHash] of migrations) {
  const migrationPath = path.join(migrationsDir, file);
  const canonicalBytes = Buffer.from(readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n'));
  const actualHash = createHash('sha256').update(canonicalBytes).digest('hex');
  if (actualHash !== expectedHash) {
    throw new Error(`REFUSING LOCAL DEPLOY: hash mismatch for ${file}`);
  }

  process.stdout.write(`  ${file} ... `);
  execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath], {
    stdio: 'pipe',
    env: { ...process.env, PATH: `C:\\Program Files\\PostgreSQL\\100\\bin;${process.env.PATH}` },
    cwd: migrationsDir,
  });
  console.log('OK');
}

console.log('Local Contractor Schedule Draft foundation applied through 050 (submission lifecycle: Submit/Request Changes/Approve + Draft lifecycle lock); existing AUTO_GENERATED projects unaffected, workflow not yet activated.');
