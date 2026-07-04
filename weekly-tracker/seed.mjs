/**
 * seed.mjs — Reset & seed 3 test projects with full Gantt schedules.
 *
 * Run from the weekly-tracker/ directory:
 *   node seed.mjs
 *
 * Requirements:
 *   - Node.js 18+  (ESM + native fetch)
 *   - .env.local must exist next to this file  (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 *
 * What it does:
 *   Step 1 — deletes all rows from child→parent tables (respects FK order)
 *   Step 2 — inserts 3 projects
 *   Step 3 — calls generateAndSaveGantt logic for each project
 *   Step 4 — applies realistic mock actual_progress so SPI indicators show
 *             different states (on-track / at-risk / not-started)
 *   Step 5 — prints verification summary
 */

import { createClient }   from '@supabase/supabase-js';
import { readFileSync }   from 'fs';
import {
  buildProjectWPs,
  calculateGantt,
  calculateKeyDates,
} from './src/engines/ganttEngine.js';
import { DEPENDENCY_RULES } from './src/config/dependencyRules.js';

// ── 0. Load .env.local ────────────────────────────────────────────────────────

function loadDotEnv(path = '.env.local') {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf-8')
        .split('\n')
        .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
        .map(l => {
          const eq = l.indexOf('=');
          return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
        })
    );
  } catch {
    return {};
  }
}

const env                  = loadDotEnv();
const SUPABASE_URL         = process.env.VITE_SUPABASE_URL          || env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY  || env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Uses the service-role key to bypass RLS during cleanup + seed.
// Never use the anon key here — RLS would block DELETE on all tables.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── 1. Date helpers ───────────────────────────────────────────────────────────

const iso = d => new Date(d).toISOString().split('T')[0];
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const fwd = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// ── 2. Project definitions ────────────────────────────────────────────────────

/**
 * progressMode controls how mock actual_progress is set after Gantt generation:
 *   'on_track'   — actual ≈ planned + small buffer  →  SPI ≈ 1.0  (green)
 *   'at_risk'    — actual ≈ 60% of planned          →  SPI ≈ 0.6  (red/amber)
 *   'not_started'— actual = 0 for everything        →  SPI = N/A  (future project)
 */
const PROJECTS = [
  {
    _scenario:    'Healthy / On Track',
    _progressMode: 'on_track',

    store_code:              'TEST001',
    shopping_mall_name:      'Mega Almaty',
    city:                    'Almaty',
    country:                 'Kazakhstan',
    construction_start_date: ago(20),
    construction_end_date:   fwd(40),
    target_opening_date:     fwd(50),
    project_type:            'New Opening',
    project_status:          'Active',
    template_type:           'standard_with_demo',
    store_size_sqm:          1200,
    project_manager:         'Sabir Khairullin',
    general_contractor:      'MECA Construction',
  },
  {
    _scenario:    'At Risk / Behind Schedule',
    _progressMode: 'at_risk',

    store_code:              'TEST002',
    shopping_mall_name:      'Khan Shatyr',
    city:                    'Astana',
    country:                 'Kazakhstan',
    construction_start_date: ago(60),
    construction_end_date:   fwd(10),
    target_opening_date:     fwd(20),
    project_type:            'New Opening',
    project_status:          'Active',
    template_type:           'standard_with_demo',
    store_size_sqm:          900,
    project_manager:         'Sabir Khairullin',
    general_contractor:      'BuildPro Ltd',
  },
  {
    _scenario:    'Rebuilding / Long Timeline',
    _progressMode: 'not_started',

    store_code:              'TEST003',
    shopping_mall_name:      'Dostyk Plaza',
    city:                    'Almaty',
    country:                 'Kazakhstan',
    construction_start_date: fwd(5),
    construction_end_date:   fwd(90),
    target_opening_date:     fwd(100),
    project_type:            'Rebuilding',
    project_status:          'Active',
    template_type:           'standard_no_demo',
    store_size_sqm:          1500,
    project_manager:         'Sabir Khairullin',
    general_contractor:      'FitOut Masters',
  },
];

// ── Helper: compute planned % at reference date ───────────────────────────────

function plannedPct(plannedStart, plannedEnd, ref = new Date()) {
  const s = new Date(plannedStart);
  const e = new Date(plannedEnd);
  if (e <= s)    return 100;
  if (ref <= s)  return 0;
  if (ref >= e)  return 100;
  return Math.min(100, ((ref - s) / (e - s)) * 100);
}

// ── Pre-flight: verify required columns exist ─────────────────────────────────

async function preflight() {
  // Try to read a single row from projects, selecting the gantt columns.
  // If the column doesn't exist, Supabase returns a 400 with a clear message.
  const { error } = await supabase
    .from('projects')
    .select('id, store_size_sqm, gantt_generated_at, template_type')
    .limit(0);

  if (error) {
    console.error('\n❌  Pre-flight failed — missing columns in `projects` table.');
    console.error('   Run the migrations in src/migrations/ (001…010) in Supabase SQL Editor first, then retry.\n');
    console.error('   Error:', error.message, '\n');
    process.exit(1);
  }

  // Check project_gantt_tasks exists
  const { error: tErr } = await supabase
    .from('project_gantt_tasks')
    .select('id')
    .limit(0);

  if (tErr) {
    console.error('\n❌  Pre-flight failed — table `project_gantt_tasks` not found.');
    console.error('   Run the migrations in src/migrations/ (001…010) in Supabase SQL Editor first, then retry.\n');
    process.exit(1);
  }

  console.log('  ✓  pre-flight passed');
}

// ── Step 1: Clean up ──────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n🧹  Step 1 — Cleaning up tables…');

  // Delete child tables first (FK order), then parents.
  // .not('id','is',null) works for BOTH integer and UUID primary keys and
  // matches every row that has a non-null id (i.e., all of them).
  const tables = [
    'contractor_report_wps',   // user spec: contractor_report_items
    'contractor_reports',
    'site_visit_wps',          // user spec: site_visit_items
    'site_visit_discrepancies',
    'site_visits',             // user spec: site_visit_reports
    'project_gantt_tasks',
    'projects',
  ];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .not('id', 'is', null);   // matches all rows regardless of ID type

    if (error) {
      const missing = error.message?.includes('schema cache') || error.code === '42P01';
      if (missing) {
        console.log(`  –  ${table}  (table not yet created — skipping)`);
      } else {
        console.warn(`  ⚠  ${table}: ${error.message}`);
      }
    } else {
      console.log(`  ✓  cleared  ${table}`);
    }
  }
}

// ── Step 2-4: Insert project + generate Gantt + mock progress ─────────────────

async function seedProject(spec) {
  const { _scenario, _progressMode, ...dbFields } = spec;
  console.log(`\n📦  Seeding "${_scenario}" (${spec.store_code})…`);

  // ── 2. Insert project row ──────────────────────────────────────────────────
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .insert([dbFields])
    .select()
    .single();

  if (pErr) {
    console.error(`  ❌  insert failed: ${pErr.message}`);
    return null;
  }
  console.log(`  ✓  project created  id=${project.id}`);

  // ── 3. Generate Gantt ──────────────────────────────────────────────────────
  try {
    const wps         = buildProjectWPs(
      spec.template_type,
      spec.construction_start_date,
      spec.target_opening_date,
      Number(spec.store_size_sqm),
    );
    const ganttResult = calculateGantt(wps, DEPENDENCY_RULES, spec.construction_start_date);
    const { constructionCompletionDate, projectedOpeningDate } = calculateKeyDates(ganttResult);
    const today       = new Date();

    // ── 4. Build task rows with mock actual_progress ───────────────────────
    const rows = ganttResult.map((wp, i) => {
      const pPct = plannedPct(wp.earlyStart, wp.earlyFinish, today);

      let actual_progress = 0;
      let status          = 'not_started';

      if (_progressMode === 'on_track') {
        // Slightly ahead of plan — clamp to 100
        actual_progress = Math.min(100, Math.round(pPct * 1.08 + 3));
        if      (actual_progress >= 100) { actual_progress = 100; status = 'completed'; }
        else if (actual_progress >    0)                           status = 'in_progress';
      } else if (_progressMode === 'at_risk') {
        // ~60% of what should have been done  →  SPI ≈ 0.60
        actual_progress = Math.round(pPct * 0.60);
        if      (actual_progress >= 100) { actual_progress = 100; status = 'completed'; }
        else if (actual_progress >    0)                           status = 'in_progress';
      }
      // 'not_started' stays at 0 / 'not_started'

      return {
        project_id:      project.id,
        wp_id:           wp.id,
        wp_label:        wp.label,
        phase_id:        wp.phaseId,
        phase_label:     wp.phaseLabel,
        planned_start:   wp.earlyStart.toISOString().split('T')[0],
        planned_end:     wp.earlyFinish.toISOString().split('T')[0],
        duration_days:   wp.duration_days,
        is_critical:     wp.isCritical,
        is_blocker:      wp.isBlocker,
        float_days:      wp.float_days,
        actual_progress,
        status,
        is_archived:     false,
        sort_order:      i,
      };
    });

    const { error: tErr } = await supabase
      .from('project_gantt_tasks')
      .insert(rows);
    if (tErr) throw tErr;

    console.log(`  ✓  ${rows.length} gantt tasks inserted`);

    // Update project with computed key dates + gantt timestamp
    const keyDateUpdate = {
      gantt_generated_at: new Date().toISOString(),
      template_type:      spec.template_type,
    };
    if (constructionCompletionDate)
      keyDateUpdate.construction_completion_date = constructionCompletionDate.toISOString().split('T')[0];
    if (projectedOpeningDate)
      keyDateUpdate.forecast_opening_date = projectedOpeningDate.toISOString().split('T')[0];

    const { error: uErr } = await supabase
      .from('projects')
      .update(keyDateUpdate)
      .eq('id', project.id);
    if (uErr) console.warn(`  ⚠  key-dates update: ${uErr.message}`);
    else      console.log(`  ✓  key dates updated  forecast=${keyDateUpdate.forecast_opening_date ?? 'n/a'}`);

    // Print quick SPI preview
    const sumPlanned = rows.reduce((s, r) => s + plannedPct(r.planned_start, r.planned_end, today), 0);
    const sumActual  = rows.reduce((s, r) => s + r.actual_progress, 0);
    const avgP       = sumPlanned / rows.length;
    const avgA       = sumActual  / rows.length;
    const spi        = avgP > 1
      ? `SPI = ${(avgA / avgP).toFixed(2)}`
      : 'SPI = N/A (project not yet started)';
    console.log(`  ℹ  ${spi}  (actual ${avgA.toFixed(1)}% vs planned ${avgP.toFixed(1)}%)`);

  } catch (err) {
    console.error(`  ❌  Gantt generation failed: ${err.message}`);
    console.error(err);
  }

  return project;
}

// ── Step 5: Verify ────────────────────────────────────────────────────────────

async function verify() {
  console.log('\n🔍  Step 5 — Verification:');

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, store_code, shopping_mall_name, gantt_generated_at, forecast_opening_date, construction_start_date')
    .order('created_at', { ascending: true });

  if (error) { console.error(`  ❌  ${error.message}`); return; }

  for (const p of projects) {
    const { count } = await supabase
      .from('project_gantt_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p.id);

    const ganttOk = p.gantt_generated_at ? '✓' : '✗';
    console.log(
      `  ${ganttOk}  ${p.store_code.padEnd(8)}` +
      `  ${p.shopping_mall_name.padEnd(22)}` +
      `  ${String(count ?? 0).padStart(2)} tasks` +
      `  start=${p.construction_start_date}` +
      `  forecast=${p.forecast_opening_date ?? '—'}`
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CF Tracker — Seed Script');
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Date:     ${new Date().toISOString().split('T')[0]}`);
  console.log('═══════════════════════════════════════════════════════');

  console.log('\nPre-flight check...');
  await preflight();

  await cleanup();

  for (const spec of PROJECTS) {
    await seedProject(spec);
  }

  await verify();

  console.log('\n✅  Seed complete.  Refresh the app — you should see 3 project cards.');
  console.log('   → Projects page: click any store code → Gantt Chart tab\n');
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
