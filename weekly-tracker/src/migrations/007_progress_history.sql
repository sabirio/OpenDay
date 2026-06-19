-- Migration 007: progress_history table
-- Run manually in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS progress_history (
  id               BIGSERIAL PRIMARY KEY,
  project_id       BIGINT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  week_number      SMALLINT      NOT NULL,
  overall_progress NUMERIC(5,2),
  spi              NUMERIC(5,3),
  snapshot         JSONB,
  recorded_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progress_history_project_recorded
  ON progress_history (project_id, recorded_at DESC);
