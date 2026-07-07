-- 024_drop_dead_weight_overrides_column.sql
-- Drops projects.weight_overrides (F-05, diagnostic-audit finding) — a
-- top-level jsonb column defined in 000_baseline.sql that has never been
-- read or written by any application code. The real, live weight-override
-- mechanism is the nested `scope.weightOverrides` field inside the
-- `projects.scope` jsonb column (see evaluateProjectState.js's
-- `project?.scope?.weightOverrides`), which is a completely separate,
-- unrelated column and is NOT touched by this migration.
--
-- Zero-consumer proof: `grep -rn "weight_overrides" src/` (snake_case, as it
-- appears in the DB) returns exactly one hit anywhere in the codebase — the
-- `ALTER TABLE ... ADD COLUMN` in 000_baseline.sql itself. No SELECT list,
-- no service/DTO mapping, no read, no write, in any .js/.jsx file. Its
-- continued existence is a trap for a future developer who might assume a
-- column named `weight_overrides` on the `projects` table is the live
-- override mechanism, when it silently does nothing.
--
-- NOT applied automatically — review and run this yourself, per this
-- project's existing convention (see 010_rls_by_roles.sql /
-- 014_site_photos_storage.sql / 015_audit_log.sql / 016_updated_at.sql
-- headers). Idempotent: safe to re-run (IF EXISTS), and safe to run even if
-- 000_baseline.sql's original ADD COLUMN was never applied to this database.

ALTER TABLE projects
  DROP COLUMN IF EXISTS weight_overrides;
