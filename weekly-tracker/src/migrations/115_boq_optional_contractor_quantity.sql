-- 115_boq_optional_contractor_quantity.sql
-- Contractor quantity is optional for work that is not part of the submitted
-- scope. Pricing remains based exclusively on contractor quantity.

BEGIN;

ALTER TABLE public.project_boq_items
  ALTER COLUMN quantity DROP NOT NULL;

CREATE OR REPLACE FUNCTION private.apply_project_boq_optional_contractor_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_item jsonb;
BEGIN
  v_payload := NULLIF(pg_catalog.current_setting('openday.project_boq_optional_quantity', true), '')::jsonb;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  SELECT item INTO v_item
  FROM pg_catalog.jsonb_array_elements(v_payload) item
  WHERE item->>'lineId' = NEW.line_id::text;
  IF v_item IS NULL THEN RETURN NEW; END IF;
  NEW.quantity := NULLIF(v_item->>'quantity', '')::numeric;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boq_items_apply_optional_contractor_quantity ON public.project_boq_items;
CREATE TRIGGER project_boq_items_apply_optional_contractor_quantity
  BEFORE INSERT ON public.project_boq_items
  FOR EACH ROW EXECUTE FUNCTION private.apply_project_boq_optional_contractor_quantity();
REVOKE ALL ON FUNCTION private.apply_project_boq_optional_contractor_quantity()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  RENAME TO save_project_boq_revision_quantity_required_legacy;
REVOKE ALL ON FUNCTION public.save_project_boq_revision_quantity_required_legacy(bigint,uuid,text,text,jsonb,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_boq_revision(
  p_project_id bigint, p_boq_id uuid, p_title text, p_currency_code text,
  p_items jsonb, p_expected_latest_revision integer, p_revision_note text,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE item->>'quantity' IS NOT NULL
      AND (item->>'quantity' !~ '^[0-9]+(?:\.[0-9]+)?$' OR (item->>'quantity')::numeric <= 0)
  ) THEN
    RAISE EXCEPTION 'INVALID_CONTRACTOR_QUANTITY' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(item || jsonb_build_object(
    'quantity', COALESCE(NULLIF(item->>'quantity', '')::numeric, 1)
  ) ORDER BY ordinal)
  INTO v_normalized
  FROM jsonb_array_elements(p_items) WITH ORDINALITY source(item, ordinal);

  PERFORM set_config('openday.project_boq_optional_quantity', p_items::text, true);
  RETURN public.save_project_boq_revision_quantity_required_legacy(
    p_project_id, p_boq_id, p_title, p_currency_code, v_normalized,
    p_expected_latest_revision, p_revision_note, p_client_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  TO authenticated;

COMMIT;
