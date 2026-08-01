-- 042_master_catalog_schema_v2.sql
-- Slice 5C — Master Catalog contract foundation: widen the existing
-- retail-fitout-v2 template shape CHECK constraint (041) to additionally
-- accept schemaVersion 2 (Master Catalog) rows, without weakening the
-- existing schemaVersion 1 (legacy) requirement in any way.
--
-- Exact current constraint (041_versioned_scope_templates.sql,
-- "templates_versioned_scope_data_check"):
--   family IS DISTINCT FROM 'retail-fitout-v2'
--   OR (
--     jsonb_typeof(data) = 'object'
--     AND data->>'schemaVersion' = '1'
--     AND data->>'model' = 'zoned'
--     AND data->>'templateType' = 'retail-fitout-v2'
--     AND jsonb_typeof(data->'zones') = 'array'
--     AND jsonb_typeof(data->'dependencies') = 'array'
--   )
--
-- Exact reason it rejects schemaVersion 2: the constraint hard-requires
-- data->>'schemaVersion' = '1' for every row in the 'retail-fitout-v2'
-- family — any row with schemaVersion 2 (even a structurally perfect Master
-- Catalog template) would violate it and be rejected at INSERT/UPDATE time.
--
-- Exact proposed additive change: replace the single schemaVersion-1-only
-- branch with (schemaVersion 1 branch, byte-for-byte unchanged) OR (a new,
-- separate schemaVersion 2 branch requiring the same zoned-model shape PLUS
-- a structurally valid defaultScope.workPackageIds array). Deep semantic
-- validation (default-id uniqueness/existence, catalogClass enum,
-- applicabilityTags vocabulary) intentionally stays at the application
-- layer (versionedScopeTemplate.js's validateMasterCatalogTemplateData),
-- matching this constraint's own existing precedent — 041's v1 branch only
-- ever checked gross shape (jsonb_typeof/equality), never deep WP-level
-- content.
--
-- Scope discipline: this migration does NOT invalidate v1, does NOT rewrite
-- any existing template row, does NOT insert a v2 catalog template (no real
-- 221-WP Master Catalog content — that is a future, separate, approved
-- slice), and does NOT touch RLS (041's policies are unconditioned on
-- schemaVersion and remain exactly as they are).
--
-- Rollback:
--   DROP CONSTRAINT IF EXISTS templates_versioned_scope_data_check on
--   public.templates, then re-run 041's original CREATE CONSTRAINT
--   statement verbatim (reproduced in that file's own header). Safe at any
--   time this migration is applied, since no schemaVersion-2 row is ever
--   inserted by this migration itself.

BEGIN;

ALTER TABLE public.templates
  DROP CONSTRAINT IF EXISTS templates_versioned_scope_data_check;

ALTER TABLE public.templates
  ADD CONSTRAINT templates_versioned_scope_data_check
  CHECK (
    family IS DISTINCT FROM 'retail-fitout-v2'
    OR (
      jsonb_typeof(data) = 'object'
      AND (
        (
          -- schemaVersion 1 (legacy) — byte-for-byte the 041 branch, unchanged.
          data->>'schemaVersion' = '1'
          AND data->>'model' = 'zoned'
          AND data->>'templateType' = 'retail-fitout-v2'
          AND jsonb_typeof(data->'zones') = 'array'
          AND jsonb_typeof(data->'dependencies') = 'array'
        )
        OR (
          -- schemaVersion 2 (Master Catalog) — new, additive branch. Same
          -- zoned-model shape plus a required, structurally-valid
          -- defaultScope.workPackageIds array (the canonical
          -- default-selection source of truth — see
          -- versionedScopeTemplate.js). Deep semantic validation (id
          -- uniqueness/existence, catalogClass, applicabilityTags) is
          -- deliberately application-layer, not a DB constraint, matching
          -- this constraint's own existing v1 precedent.
          --
          -- Wrapped in COALESCE(..., false): a Postgres CHECK constraint
          -- treats a NULL expression result as "satisfied" (not rejected).
          -- Any of these ->/->> lookups returns SQL NULL when the
          -- corresponding key is simply absent (not merely wrong-typed) —
          -- e.g. a row with no "defaultScope" key at all would otherwise
          -- make this whole AND-chain evaluate to NULL and silently pass.
          -- The v1 branch above is deliberately left exactly as 041 wrote
          -- it (byte-for-byte, including this same latent NULL-propagation
          -- characteristic) — this fix only applies to the new v2 branch.
          COALESCE(
            data->>'schemaVersion' = '2'
            AND data->>'model' = 'zoned'
            AND data->>'templateType' = 'retail-fitout-v2'
            AND jsonb_typeof(data->'zones') = 'array'
            AND jsonb_typeof(data->'dependencies') = 'array'
            AND jsonb_typeof(data->'defaultScope') = 'object'
            AND jsonb_typeof(data->'defaultScope'->'workPackageIds') = 'array',
            false
          )
        )
      )
    )
  )
  NOT VALID;

-- VALIDATE re-checks every existing row against the new (widened) check.
-- Every existing row is schemaVersion 1 (no schemaVersion-2 row exists yet,
-- confirmed: this migration inserts none), so every row still satisfies the
-- unchanged first branch — this is expected to pass instantly with zero
-- rows rewritten.
ALTER TABLE public.templates
  VALIDATE CONSTRAINT templates_versioned_scope_data_check;

COMMIT;
