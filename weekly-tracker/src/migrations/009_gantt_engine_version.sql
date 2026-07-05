-- ============================================================
-- [HISTORICAL - DO NOT RUN ON FRESH DATABASE]
-- This migration was applied during initial development.
-- For fresh installs, use 000_baseline.sql instead.
-- Kept for historical reference only.
-- ============================================================

-- Migration 009: engine version stamp on projects
-- Tracks which engine version generated the saved Gantt.
-- NULL means generated before this column existed (treated as stale).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_engine_version INT;
