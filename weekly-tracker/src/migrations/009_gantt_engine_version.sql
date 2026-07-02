-- Migration 009: engine version stamp on projects
-- Tracks which engine version generated the saved Gantt.
-- NULL means generated before this column existed (treated as stale).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS gantt_engine_version INT;
