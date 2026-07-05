-- ============================================================
-- [HISTORICAL - DO NOT RUN ON FRESH DATABASE]
-- This migration was applied during initial development.
-- For fresh installs, use 000_baseline.sql instead.
-- Kept for historical reference only.
-- ============================================================

-- Migration 006: Add scope JSONB to projects
-- Stores the configured project scope: { preset, phases: [...], workPackages: [...] }
-- null = full scope (all phases and work packages active — backward compatible default).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scope JSONB DEFAULT NULL;
