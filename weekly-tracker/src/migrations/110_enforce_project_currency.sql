-- Project currency is selected once at project creation and inherited by
-- downstream commercial workspaces. Existing projects predate this contract,
-- so only missing values are backfilled with the current local default.
UPDATE public.projects
SET currency_code = 'KZT'
WHERE currency_code IS NULL OR btrim(currency_code) = '';

ALTER TABLE public.projects
  ALTER COLUMN currency_code SET DEFAULT 'KZT',
  ALTER COLUMN currency_code SET NOT NULL;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_currency_code_allowed;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_currency_code_allowed
  CHECK (currency_code IN ('KZT', 'USD', 'EUR'));
