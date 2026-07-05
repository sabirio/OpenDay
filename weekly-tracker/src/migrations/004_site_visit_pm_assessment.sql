-- ============================================================
-- [HISTORICAL - DO NOT RUN ON FRESH DATABASE]
-- This migration was applied during initial development.
-- For fresh installs, use 000_baseline.sql instead.
-- Kept for historical reference only.
-- ============================================================

-- Migration 003: add pm_schedule_assessment to site_visits

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS pm_schedule_assessment TEXT;
