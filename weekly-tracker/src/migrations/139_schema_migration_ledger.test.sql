BEGIN;

DO $$
DECLARE
  v_mutation_blocked boolean := false;
  v_mismatch_blocked boolean := false;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.schema_migration_ledger
    WHERE migration_id = 'supported-baseline-000-132'
      AND sequence_number = 132
      AND sha256 = 'd1a1a545d755c544cf780da1b2cb220ac3b14c8aecd4325e33462e1e5be95b48'
  ) THEN RAISE EXCEPTION 'Supported baseline checkpoint is missing'; END IF;
  IF has_table_privilege('authenticated', 'public.schema_migration_ledger', 'INSERT,UPDATE,DELETE')
    OR has_function_privilege('authenticated', 'private.register_schema_migration(text,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Browser can mutate the schema migration ledger';
  END IF;
  BEGIN
    UPDATE public.schema_migration_ledger SET sha256 = repeat('0', 64)
    WHERE migration_id = 'supported-baseline-000-132';
  EXCEPTION WHEN SQLSTATE '55000' THEN v_mutation_blocked := true;
  END;
  IF NOT v_mutation_blocked THEN RAISE EXCEPTION 'Ledger update was accepted'; END IF;
  BEGIN
    PERFORM private.register_schema_migration(
      'supported-baseline-000-132', 132,
      'SUPPORTED_BASELINE_000_132@f14abab2e0051297bf3b4430be7b6984cdf64ff8', repeat('0', 64)
    );
  EXCEPTION WHEN SQLSTATE '55000' THEN v_mismatch_blocked := true;
  END;
  IF NOT v_mismatch_blocked THEN RAISE EXCEPTION 'Ledger hash mismatch was accepted'; END IF;
END;
$$;

ROLLBACK;
