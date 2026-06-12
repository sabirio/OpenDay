-- Migration 005: Add gc_status to site_visit_wps
-- Stores the GC's task status at submission time so Dashboard can compare
-- status-rank (not just numeric progress) when rendering discrepancy results.

ALTER TABLE site_visit_wps
  ADD COLUMN IF NOT EXISTS gc_status TEXT DEFAULT 'not_started';
