-- ============================================================
-- [HISTORICAL - DO NOT RUN ON FRESH DATABASE]
-- This migration was applied during initial development.
-- For fresh installs, use 000_baseline.sql instead.
-- Kept for historical reference only.
-- ============================================================

-- Migration 008: RLS policy for progress_history
-- Run manually in Supabase SQL Editor.
--
-- Root cause: 007_progress_history.sql created the table without RLS setup.
-- Supabase enables RLS on all new tables by default at the project level,
-- so the table got RLS ON but zero policies — silently blocking all anon/
-- authenticated inserts from the app client.
--
-- Pattern matches the other tables in 002_gantt_system.sql.
-- Safe to re-run (DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$).

ALTER TABLE progress_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "anon_all_progress_history"
    ON progress_history FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
