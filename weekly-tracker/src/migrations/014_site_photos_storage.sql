-- 014_site_photos_storage.sql
-- Mobile field forms: photo capture for SiteVisitReport + ContractorReport.
--
-- NOT applied automatically — review and run this yourself via the Supabase
-- dashboard SQL editor or CLI. Creating a Storage bucket + RLS policies is a
-- live change to shared infrastructure.
--
-- Correction vs. the original brief: the brief's RLS policies only checked
-- `bucket_id = 'site-photos'`, which would let ANY authenticated user read
-- and write ANY path in the bucket — not "their own folder" as intended.
-- Upload paths are `${user.id}/${projectId}/...` (see PhotoUpload.jsx), so
-- the policies below additionally check that the first path segment
-- (storage.foldername(name)[1]) matches auth.uid(), which is what actually
-- enforces per-user folders.

INSERT INTO storage.buckets (id, name, public)
VALUES ('site-photos', 'site-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload to their own site-photos folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'site-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read their own site-photos folder"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'site-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- photo_urls stores Storage object paths (not public URLs — the bucket is
-- private; a viewer must request a signed URL for the path when it actually
-- displays the photo).
ALTER TABLE contractor_reports
  ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';

ALTER TABLE site_visits
  ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';
