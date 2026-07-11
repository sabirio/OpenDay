# Staging Pre-deployment Baseline

Status: deployment package prepared; target unavailable.

- Candidate migration path: `000`, `010`, `012–027`; 011 excluded.
- Candidate application gate: npm ci, lint, typecheck, architecture, tests, build.
- Required safety command before any remote inspection or write: `node scripts/staging/assertStagingTarget.mjs`.
- Required remote prechecks: environment fingerprint, backup/recovery, migration history, schema/RLS/RPC/grant/bucket drift and dry-run.
- Required frontend prechecks: staging-only variables, no production/local URL, valid redirects and Preview-only alias.

No remote baseline values are fabricated because no staging target exists.
