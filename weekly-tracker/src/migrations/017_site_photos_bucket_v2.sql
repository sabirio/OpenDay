-- 017_site_photos_bucket_v2.sql
-- Photofix v2: proper bucket config + path restructure
-- ({project_id}/{year-month}/{user_id}_{timestamp}.jpg) + delete support.
--
-- NOT applied automatically — review and run this yourself, per this
-- project's existing convention (014/015/016 headers).
--
-- Correction vs. the original brief: the brief's RLS check was
--   (storage.foldername(name))[3] = auth.uid()::text
-- storage.foldername(name) returns only the FOLDER segments of the path
-- (everything except the final filename). For
-- `{project_id}/{year-month}/{user_id}_{timestamp}.jpg` that's exactly two
-- segments — ['project_id', 'year-month'] — there is no [3]; indexing past
-- the end of a Postgres array returns NULL, and `NULL = auth.uid()::text`
-- is NULL, never TRUE. As written, this policy would reject every INSERT
-- and DELETE unconditionally — nobody could ever upload or delete a photo.
-- The user_id lives in the FILENAME here, not its own folder segment, so
-- the ownership check has to pull it out of storage.filename(name) instead:
--   split_part(storage.filename(name), '_', 1) = auth.uid()::text
-- (auth.uid() is a hyphenated UUID, never contains '_', so split on the
-- first '_' cleanly separates it from the trailing _timestamp.jpg part.)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-photos',
  'site-photos',
  false,
  5242880,  -- 5MB per file, enforced server-side as a ceiling even though
            -- the client compresses before upload (see compressImage.js)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "authenticated can upload site photos" ON storage.objects;
DROP POLICY IF EXISTS "authenticated can read site photos"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated can delete own photos"  ON storage.objects;
-- Also drop the v1 policy names from 014_site_photos_storage.sql, in case
-- both migrations are applied to the same project.
DROP POLICY IF EXISTS "Users can upload to their own site-photos folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own site-photos folder"      ON storage.objects;

CREATE POLICY "authenticated can upload site photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'site-photos' AND
  split_part(storage.filename(name), '_', 1) = auth.uid()::text
);

-- Read: any authenticated user can view photos (PM/GC/Admin all need to see
-- each other's site photos — unlike upload/delete this isn't folder-scoped).
CREATE POLICY "authenticated can read site photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-photos');

CREATE POLICY "authenticated can delete own photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'site-photos' AND
  split_part(storage.filename(name), '_', 1) = auth.uid()::text
);
