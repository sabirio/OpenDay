-- Migration 003: add pm_schedule_assessment to site_visits + pm_ahead direction to site_visit_wps

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS pm_schedule_assessment TEXT;

ALTER TABLE site_visit_wps
  ADD COLUMN IF NOT EXISTS pm_ahead BOOLEAN DEFAULT FALSE;
