-- ═══════════════════════════════════════════════════════════════════════════
-- CF Tracker — SQL Seed Script  (Supabase / PostgreSQL)
-- Paste into Supabase SQL Editor and click Run.
--
-- Step 1  delete all rows (FK order: children first)
-- Step 2  insert 3 test projects
-- Step 3  insert mock gantt tasks (5-phase sequential schedule per project)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Step 1: Clean up ────────────────────────────────────────────────────────

TRUNCATE TABLE
  contractor_report_wps,
  contractor_reports,
  site_visit_wps,
  site_visit_discrepancies,
  site_visits,
  project_gantt_tasks,
  projects
CASCADE;

-- ─── Step 2: Create projects ──────────────────────────────────────────────────
-- Using fixed UUIDs so the gantt INSERT below can reference them without
-- needing RETURNING. Change them if you prefer gen_random_uuid().

DO $$
DECLARE
  p1 uuid := '11111111-0000-0000-0000-000000000001';
  p2 uuid := '11111111-0000-0000-0000-000000000002';
  p3 uuid := '11111111-0000-0000-0000-000000000003';

  -- Project 1 dates (Healthy — 20 days in, 50 days to go)
  p1_start  date := CURRENT_DATE - INTERVAL '20 days';
  p1_end    date := CURRENT_DATE + INTERVAL '40 days';
  p1_open   date := CURRENT_DATE + INTERVAL '50 days';

  -- Project 2 dates (At Risk — 60 days in, 20 days to open)
  p2_start  date := CURRENT_DATE - INTERVAL '60 days';
  p2_end    date := CURRENT_DATE + INTERVAL '10 days';
  p2_open   date := CURRENT_DATE + INTERVAL '20 days';

  -- Project 3 dates (Future — starts in 5 days)
  p3_start  date := CURRENT_DATE + INTERVAL '5 days';
  p3_end    date := CURRENT_DATE + INTERVAL '90 days';
  p3_open   date := CURRENT_DATE + INTERVAL '100 days';

  -- Each project has 5 mock phases, each ~14 days, sequential.
  -- Phase durations (days): Demo=14, Rough-In=14, Floor=14, Finishing=14, Commissioning=8
  -- Total = 64 days  →  fits within all 3 project timelines.

  -- ── Project 1 task dates (start = p1_start) ────────────────────────────────
  p1_t1s date; p1_t1e date;   -- Demolition
  p1_t2s date; p1_t2e date;   -- Rough-In
  p1_t3s date; p1_t3e date;   -- Floor Tiling
  p1_t4s date; p1_t4e date;   -- Finishing
  p1_t5s date; p1_t5e date;   -- Commissioning

  -- ── Project 2 task dates ───────────────────────────────────────────────────
  p2_t1s date; p2_t1e date;
  p2_t2s date; p2_t2e date;
  p2_t3s date; p2_t3e date;
  p2_t4s date; p2_t4e date;
  p2_t5s date; p2_t5e date;

  -- ── Project 3 task dates ───────────────────────────────────────────────────
  p3_t1s date; p3_t1e date;
  p3_t2s date; p3_t2e date;
  p3_t3s date; p3_t3e date;
  p3_t4s date; p3_t4e date;
  p3_t5s date; p3_t5e date;

BEGIN

  -- ────────────────────────────────────────────────────────────────────────────
  -- Project 1 task date computation
  -- ────────────────────────────────────────────────────────────────────────────
  p1_t1s := p1_start;            p1_t1e := p1_t1s + 14;
  p1_t2s := p1_t1e;              p1_t2e := p1_t2s + 14;
  p1_t3s := p1_t2e;              p1_t3e := p1_t3s + 14;
  p1_t4s := p1_t3e;              p1_t4e := p1_t4s + 14;
  p1_t5s := p1_t4e;              p1_t5e := p1_t5s + 8;

  -- Project 2 task date computation
  p2_t1s := p2_start;            p2_t1e := p2_t1s + 14;
  p2_t2s := p2_t1e;              p2_t2e := p2_t2s + 14;
  p2_t3s := p2_t2e;              p2_t3e := p2_t3s + 14;
  p2_t4s := p2_t3e;              p2_t4e := p2_t4s + 14;
  p2_t5s := p2_t4e;              p2_t5e := p2_t5s + 8;

  -- Project 3 task date computation
  p3_t1s := p3_start;            p3_t1e := p3_t1s + 14;
  p3_t2s := p3_t1e;              p3_t2e := p3_t2s + 18;
  p3_t3s := p3_t2e;              p3_t3e := p3_t3s + 18;
  p3_t4s := p3_t3e;              p3_t4e := p3_t4s + 18;
  p3_t5s := p3_t4e;              p3_t5e := p3_t5s + 12;

  -- ────────────────────────────────────────────────────────────────────────────
  -- Insert projects
  -- ────────────────────────────────────────────────────────────────────────────
  INSERT INTO projects (
    id, store_code, shopping_mall_name, city, country,
    construction_start_date, construction_end_date, target_opening_date,
    project_type, project_status, template_type, store_size_sqm,
    project_manager, general_contractor,
    gantt_generated_at,
    construction_completion_date, forecast_opening_date
  ) VALUES
  -- Project 1 — Healthy
  (p1, 'TEST001', 'Mega Almaty',  'Almaty', 'Kazakhstan',
   p1_start, p1_end, p1_open,
   'New Opening', 'Active', 'standard_with_demo', 1200,
   'Sabir Khairullin', 'MECA Construction',
   NOW(), p1_t5e, p1_open),

  -- Project 2 — At Risk
  (p2, 'TEST002', 'Khan Shatyr',  'Astana', 'Kazakhstan',
   p2_start, p2_end, p2_open,
   'New Opening', 'Active', 'standard_with_demo', 900,
   'Sabir Khairullin', 'BuildPro Ltd',
   NOW(), p2_t5e, p2_open),

  -- Project 3 — Future
  (p3, 'TEST003', 'Dostyk Plaza', 'Almaty', 'Kazakhstan',
   p3_start, p3_end, p3_open,
   'Rebuilding', 'Active', 'standard_no_demo', 1500,
   'Sabir Khairullin', 'FitOut Masters',
   NOW(), p3_t5e, p3_open);

  -- ────────────────────────────────────────────────────────────────────────────
  -- Insert project_gantt_tasks  (5 phases × 3 projects = 15 rows)
  --
  -- Progress rules:
  --   Project 1 (on-track):   phases completed before today → 100%
  --                           current phase → 65%
  --                           future phases → 0%
  --   Project 2 (at-risk):    phases completed before today → 100%
  --                           current phase → 30%  (significantly behind)
  --                           future phases → 0%
  --   Project 3 (future):     everything 0%
  --
  -- actual_progress is set by a CASE expression on whether the task is
  -- fully past, in-progress, or future relative to CURRENT_DATE.
  -- ────────────────────────────────────────────────────────────────────────────
  INSERT INTO project_gantt_tasks (
    project_id, wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end, duration_days,
    is_critical, is_blocker, float_days,
    actual_progress, status, is_archived, sort_order
  )
  -- ── Project 1 tasks ──────────────────────────────────────────────────────────
  SELECT
    p1,
    wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end,
    (planned_end - planned_start) AS duration_days,
    TRUE  AS is_critical,
    FALSE AS is_blocker,
    0     AS float_days,
    -- on-track: completed if past, 65% if active, 0% if future
    CASE
      WHEN planned_end   < CURRENT_DATE THEN 100
      WHEN planned_start < CURRENT_DATE THEN 65
      ELSE 0
    END AS actual_progress,
    CASE
      WHEN planned_end   < CURRENT_DATE THEN 'completed'
      WHEN planned_start < CURRENT_DATE THEN 'in_progress'
      ELSE 'not_started'
    END AS status,
    FALSE, sort_order
  FROM (VALUES
    ('demo.strip_out',    'Demolition',        'demolition',    'Demolition',   p1_t1s, p1_t1e, 0),
    ('walls.framing',     'Rough-In Works',    'rough_in',      'Rough-In',     p1_t2s, p1_t2e, 1),
    ('floor.tiling',      'Floor Tiling',      'floor_tiling',  'Floor Tiling', p1_t3s, p1_t3e, 2),
    ('finish.walls',      'Finishing Works',   'finishes',      'Finishes',     p1_t4s, p1_t4e, 3),
    ('comm.full_test',    'Commissioning',     'commissioning', 'Commissioning',p1_t5s, p1_t5e, 4)
  ) AS t(wp_id, wp_label, phase_id, phase_label, planned_start, planned_end, sort_order)

  UNION ALL

  -- ── Project 2 tasks ──────────────────────────────────────────────────────────
  SELECT
    p2,
    wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end,
    (planned_end - planned_start),
    TRUE, FALSE, 0,
    -- at-risk: completed if past, only 30% if active (lagging)
    CASE
      WHEN planned_end   < CURRENT_DATE THEN 100
      WHEN planned_start < CURRENT_DATE THEN 30
      ELSE 0
    END,
    CASE
      WHEN planned_end   < CURRENT_DATE THEN 'completed'
      WHEN planned_start < CURRENT_DATE THEN 'in_progress'
      ELSE 'not_started'
    END,
    FALSE, sort_order
  FROM (VALUES
    ('demo.strip_out',    'Demolition',        'demolition',    'Demolition',   p2_t1s, p2_t1e, 0),
    ('walls.framing',     'Rough-In Works',    'rough_in',      'Rough-In',     p2_t2s, p2_t2e, 1),
    ('floor.tiling',      'Floor Tiling',      'floor_tiling',  'Floor Tiling', p2_t3s, p2_t3e, 2),
    ('finish.walls',      'Finishing Works',   'finishes',      'Finishes',     p2_t4s, p2_t4e, 3),
    ('comm.full_test',    'Commissioning',     'commissioning', 'Commissioning',p2_t5s, p2_t5e, 4)
  ) AS t(wp_id, wp_label, phase_id, phase_label, planned_start, planned_end, sort_order)

  UNION ALL

  -- ── Project 3 tasks ──────────────────────────────────────────────────────────
  SELECT
    p3,
    wp_id, wp_label, phase_id, phase_label,
    planned_start, planned_end,
    (planned_end - planned_start),
    TRUE, FALSE, 0,
    0, 'not_started', FALSE, sort_order  -- all future
  FROM (VALUES
    ('walls.framing',     'Rough-In Works',    'rough_in',      'Rough-In',     p3_t1s, p3_t1e, 0),
    ('floor.tiling',      'Floor Tiling',      'floor_tiling',  'Floor Tiling', p3_t2s, p3_t2e, 1),
    ('finish.walls',      'Finishing Works',   'finishes',      'Finishes',     p3_t3s, p3_t3e, 2),
    ('comm.full_test',    'Commissioning',     'commissioning', 'Commissioning',p3_t4s, p3_t4e, 3),
    ('handover.keys',     'Handover',          'handover',      'Handover',     p3_t5s, p3_t5e, 4)
  ) AS t(wp_id, wp_label, phase_id, phase_label, planned_start, planned_end, sort_order);

END $$;

-- ─── Verify ───────────────────────────────────────────────────────────────────
SELECT
  p.store_code,
  p.shopping_mall_name,
  p.construction_start_date,
  p.target_opening_date,
  p.forecast_opening_date,
  COUNT(t.id)              AS gantt_tasks,
  ROUND(AVG(t.actual_progress), 1) AS avg_actual_pct
FROM projects p
LEFT JOIN project_gantt_tasks t ON t.project_id = p.id
WHERE p.store_code IN ('TEST001','TEST002','TEST003')
GROUP BY p.id, p.store_code, p.shopping_mall_name,
         p.construction_start_date, p.target_opening_date, p.forecast_opening_date
ORDER BY p.store_code;
