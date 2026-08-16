-- 114_boq_contractor_consultant_quantities.sql
-- Preserve the contractor quantity as the commercial pricing quantity and add
-- a separate consultant-reviewed quantity to every immutable BOQ revision.

BEGIN;

ALTER TABLE public.project_boq_items
  ADD COLUMN IF NOT EXISTS consultant_quantity numeric(20,6)
  CHECK (consultant_quantity IS NULL OR consultant_quantity >= 0);

CREATE OR REPLACE FUNCTION private.apply_project_boq_consultant_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_item jsonb;
  v_quantity text;
BEGIN
  v_payload := NULLIF(pg_catalog.current_setting('openday.project_boq_price_breakdown', true), '')::jsonb;
  IF v_payload IS NULL THEN RETURN NEW; END IF;

  SELECT item INTO v_item
  FROM pg_catalog.jsonb_array_elements(v_payload) item
  WHERE item->>'lineId' = NEW.line_id::text;
  IF v_item IS NULL THEN RETURN NEW; END IF;

  v_quantity := NULLIF(v_item->>'consultantQuantity', '');
  IF v_quantity IS NULL THEN
    NEW.consultant_quantity := NULL;
  ELSIF v_quantity !~ '^[0-9]+(?:\.[0-9]+)?$' OR v_quantity::numeric < 0 THEN
    RAISE EXCEPTION 'INVALID_CONSULTANT_QUANTITY' USING ERRCODE = '22023';
  ELSE
    NEW.consultant_quantity := v_quantity::numeric;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boq_items_apply_consultant_quantity ON public.project_boq_items;
CREATE TRIGGER project_boq_items_apply_consultant_quantity
  BEFORE INSERT ON public.project_boq_items
  FOR EACH ROW EXECUTE FUNCTION private.apply_project_boq_consultant_quantity();

REVOKE ALL ON FUNCTION private.apply_project_boq_consultant_quantity()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
