/**
 * One-time backfill: populate progress_history for all existing reports.
 *
 * Run once from the project root:
 *   npx vite-node src/migrations/backfillProgressHistory.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (no VITE_ prefix).
 * The service-role key bypasses RLS so the script can read all rows.
 * It is loaded here via loadEnv and never reaches the browser bundle.
 *
 * Idempotent: deletes ALL existing progress_history rows first, then reinserts.
 * Safe to re-run if something goes wrong mid-way.
 *
 * Uses the same engine path as the screen:
 *   computeWPCumulativeStatuses + calculateProjectProgressResult
 * No new progress math — replaying history chronologically per project.
 */

import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';
import { computeWPCumulativeStatuses, computeCumulativeStatuses } from '../utils/reportUtils.js';
import { calculateProjectProgressResult } from '../engines/progressEngine.js';

// ── Load ALL vars from .env.local ('' prefix = no filter) ─────────────────────
const env = loadEnv('', process.cwd(), '');

const supabaseUrl      = env.VITE_SUPABASE_URL;
const serviceRoleKey   = env.SUPABASE_SERVICE_ROLE_KEY;

// Confirmation logs — verify correct project before touching any data
console.log('URL:      ', supabaseUrl);
console.log('Key prefix:', serviceRoleKey ? serviceRoleKey.slice(0, 12) + '…' : '(missing!)');
console.log();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Service-role client — bypasses RLS. Used only in this local script.
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

// ── ISO week number — same algorithm reportService.js's now-removed create() used ──
function isoWeekNumber(dateStr) {
  const d   = new Date(dateStr);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

// ── Map snake_case DB row → camelCase shape engines expect ────────────────────
function toEngineReport(row) {
  return {
    reportingDate:        row.reporting_date          || null,
    submittedAt:          row.submitted_at            || null,
    workPackageStatuses:  row.work_package_statuses   || null,
    currentPhase:         row.current_phase           || null,
    currentPhases:        row.current_phases          || [],
    demolitionStatus:     row.demolition_status       || null,
    constructionStatuses: row.construction_statuses   || {},
    testingStatuses:      row.testing_statuses        || {},
    handoverStatuses:     row.handover_statuses       || {},
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function backfill() {
  console.log('=== progress_history backfill ===\n');

  // Step 1 — Clear all existing rows
  console.log('Clearing existing progress_history rows…');
  const { error: delErr } = await supabase
    .from('progress_history')
    .delete()
    .neq('id', 0); // neq filter required by Supabase; matches all rows
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
  console.log('Cleared.\n');

  // Step 2 — Fetch all projects
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id, store_code')
    .order('id', { ascending: true });
  if (pErr) throw new Error(`Projects fetch failed: ${pErr.message}`);
  console.log(`Found ${projects.length} projects.\n`);

  // Step 3 — Fetch all reports (only columns engines need)
  const { data: allReports, error: rErr } = await supabase
    .from('reports')
    .select(`
      id,
      project_id,
      reporting_date,
      submitted_at,
      work_package_statuses,
      current_phase,
      current_phases,
      demolition_status,
      construction_statuses,
      testing_statuses,
      handover_statuses
    `)
    .order('reporting_date', { ascending: true, nullsFirst: false });
  if (rErr) throw new Error(`Reports fetch failed: ${rErr.message}`);
  console.log(`Found ${allReports.length} total reports.\n`);

  // Step 4 — Walk each project chronologically, compute cumulative progress
  let totalInserted = 0;

  for (const project of projects) {
    const projRows = allReports
      .filter(r => r.project_id === project.id)
      .sort((a, b) =>
        new Date(a.reporting_date || a.submitted_at) -
        new Date(b.reporting_date || b.submitted_at)
      );

    if (projRows.length === 0) continue;

    const historyRows = [];

    for (let i = 0; i < projRows.length; i++) {
      // Cumulative slice: all reports up to and including this one
      const slice        = projRows.slice(0, i + 1).map(toEngineReport);
      const wpCum        = computeWPCumulativeStatuses(slice);
      const legCum       = computeCumulativeStatuses(slice);
      const { progress } = calculateProjectProgressResult(wpCum, legCum);

      const dateStr = projRows[i].reporting_date || projRows[i].submitted_at;

      historyRows.push({
        project_id:       project.id,
        week_number:      isoWeekNumber(dateStr),
        overall_progress: progress,
        spi:              null,
        snapshot:         null,
        recorded_at:      new Date(dateStr).toISOString(),
      });
    }

    const { error: insErr } = await supabase
      .from('progress_history')
      .insert(historyRows);

    if (insErr) {
      console.error(`  ✖  ${project.store_code ?? project.id}: ${insErr.message}`);
    } else {
      const pcts = historyRows.map(r => r.overall_progress + '%').join(' → ');
      console.log(`  ✔  ${project.store_code ?? project.id}: ${historyRows.length} rows  [${pcts}]`);
      totalInserted += historyRows.length;
    }
  }

  console.log(`\nDone. ${totalInserted} rows inserted across ${projects.length} projects.`);
  console.log('Reload the app — projects with ≥2 reports will now show a real deltaVsLastWeek.\n');
}

backfill().catch(err => {
  console.error('\nBackfill failed:', err.message ?? err);
  process.exit(1);
});
