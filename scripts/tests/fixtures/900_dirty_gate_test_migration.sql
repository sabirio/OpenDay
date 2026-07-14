-- Test-only fixture. Exists solely so scripts/tests/production-migration-executor.tests.ps1
-- can prove Assert-MigrationFileTrackedAndClean / Test-ManifestMigrationsTrackedAndClean
-- against a real, git-tracked file without ever touching a historical or Snag List
-- migration. The test transiently appends a line to this file in the working tree and
-- restores it via `git checkout -- <path>` in a finally block - this file's committed
-- content never changes as a result of running the test suite.
SELECT 1;
