-- Migration 003: add pm_schedule_assessment to site_visits

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS pm_schedule_assessment TEXT;
