# Production Pre-deployment Baseline

Status: **INCOMPLETE — stopped at backup gate**.

The production identity is confirmed from authenticated read-only discovery. Current frontend deployment is `dpl_EZ8Uuq5okmiGqpBRLExLXvb1KdAr` on `noryxapp`, status Ready, with aliases `openday.fit` and `www.openday.fit`.

Supabase backup discovery returned PITR disabled and zero physical backups. Migration history, schema inventory, row/object counts and migration dry-run were intentionally not collected through a production database connection. No production row data was exported.
