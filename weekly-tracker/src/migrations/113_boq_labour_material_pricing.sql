-- 113_boq_labour_material_pricing.sql
-- Split BOQ pricing into Labour and Material while retaining unit_rate as a
-- compatibility total for existing aggregation and tender-comparison models.

BEGIN;

ALTER TABLE public.project_boq_items
  ADD COLUMN IF NOT EXISTS labour_rate numeric(20,6) CHECK (labour_rate IS NULL OR labour_rate >= 0),
  ADD COLUMN IF NOT EXISTS material_rate numeric(20,6) CHECK (material_rate IS NULL OR material_rate >= 0);
ALTER TABLE public.project_boq_items DISABLE TRIGGER project_boq_items_immutable;
UPDATE public.project_boq_items
SET material_rate = unit_rate
WHERE unit_rate IS NOT NULL AND labour_rate IS NULL AND material_rate IS NULL;
ALTER TABLE public.project_boq_items ENABLE TRIGGER project_boq_items_immutable;

ALTER TABLE public.project_tender_bid_draft_items
  ADD COLUMN IF NOT EXISTS labour_rate numeric(20,6) CHECK (labour_rate IS NULL OR labour_rate >= 0),
  ADD COLUMN IF NOT EXISTS material_rate numeric(20,6) CHECK (material_rate IS NULL OR material_rate >= 0);
UPDATE public.project_tender_bid_draft_items
SET material_rate = unit_rate
WHERE unit_rate IS NOT NULL AND labour_rate IS NULL AND material_rate IS NULL;

ALTER TABLE public.project_tender_bid_submission_items
  ADD COLUMN IF NOT EXISTS labour_rate numeric(20,6) CHECK (labour_rate IS NULL OR labour_rate >= 0),
  ADD COLUMN IF NOT EXISTS material_rate numeric(20,6) CHECK (material_rate IS NULL OR material_rate >= 0);
ALTER TABLE public.project_tender_bid_submission_items DISABLE TRIGGER project_tender_bid_submission_items_immutable;
UPDATE public.project_tender_bid_submission_items
SET material_rate = unit_rate
WHERE unit_rate IS NOT NULL AND labour_rate IS NULL AND material_rate IS NULL;
ALTER TABLE public.project_tender_bid_submission_items ENABLE TRIGGER project_tender_bid_submission_items_immutable;

CREATE OR REPLACE FUNCTION private.apply_project_boq_price_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_item jsonb;
BEGIN
  v_payload := NULLIF(pg_catalog.current_setting('openday.project_boq_price_breakdown', true), '')::jsonb;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  SELECT item INTO v_item FROM jsonb_array_elements(v_payload) item WHERE item->>'lineId' = NEW.line_id::text;
  IF v_item IS NULL THEN RETURN NEW; END IF;
  IF v_item ? 'labourRate' OR v_item ? 'materialRate' THEN
    NEW.labour_rate := NULLIF(v_item->>'labourRate', '')::numeric;
    NEW.material_rate := NULLIF(v_item->>'materialRate', '')::numeric;
  ELSE
    NEW.labour_rate := NULL;
    NEW.material_rate := NEW.unit_rate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_boq_items_apply_price_breakdown ON public.project_boq_items;
CREATE TRIGGER project_boq_items_apply_price_breakdown
  BEFORE INSERT ON public.project_boq_items
  FOR EACH ROW EXECUTE FUNCTION private.apply_project_boq_price_breakdown();
REVOKE ALL ON FUNCTION private.apply_project_boq_price_breakdown() FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  RENAME TO save_project_boq_revision_unit_rate_legacy;
REVOKE ALL ON FUNCTION public.save_project_boq_revision_unit_rate_legacy(bigint,uuid,text,text,jsonb,integer,text,uuid)
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
DECLARE v_normalized jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE (item->>'labourRate' IS NOT NULL AND (item->>'labourRate' !~ '^[0-9]+(?:\.[0-9]+)?$' OR (item->>'labourRate')::numeric < 0))
       OR (item->>'materialRate' IS NOT NULL AND (item->>'materialRate' !~ '^[0-9]+(?:\.[0-9]+)?$' OR (item->>'materialRate')::numeric < 0))
  ) THEN
    RAISE EXCEPTION 'INVALID_BOQ_PRICE_COMPONENT' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(item || jsonb_build_object(
    'unitRate', CASE
      WHEN item ? 'labourRate' OR item ? 'materialRate' THEN
        CASE WHEN item->>'labourRate' IS NULL AND item->>'materialRate' IS NULL THEN NULL
          ELSE COALESCE((item->>'labourRate')::numeric, 0) + COALESCE((item->>'materialRate')::numeric, 0) END
      ELSE NULLIF(item->>'unitRate', '')::numeric
    END
  ) ORDER BY ordinal)
  INTO v_normalized
  FROM jsonb_array_elements(p_items) WITH ORDINALITY source(item, ordinal);

  PERFORM set_config('openday.project_boq_price_breakdown', p_items::text, true);
  RETURN public.save_project_boq_revision_unit_rate_legacy(
    p_project_id, p_boq_id, p_title, p_currency_code, v_normalized,
    p_expected_latest_revision, p_revision_note, p_client_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_project_boq_revision(bigint,uuid,text,text,jsonb,integer,text,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.apply_tender_bid_price_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_payload jsonb; v_item jsonb;
BEGIN
  v_payload := NULLIF(pg_catalog.current_setting('openday.tender_bid_price_breakdown', true), '')::jsonb;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  SELECT item INTO v_item FROM jsonb_array_elements(v_payload) item WHERE item->>'lineId' = NEW.line_id::text;
  IF v_item IS NULL THEN RETURN NEW; END IF;
  IF v_item ? 'labourRate' OR v_item ? 'materialRate' THEN
    NEW.labour_rate := NULLIF(v_item->>'labourRate', '')::numeric;
    NEW.material_rate := NULLIF(v_item->>'materialRate', '')::numeric;
  ELSE
    NEW.labour_rate := NULL;
    NEW.material_rate := NEW.unit_rate;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tender_bid_draft_items_apply_price_breakdown ON public.project_tender_bid_draft_items;
CREATE TRIGGER tender_bid_draft_items_apply_price_breakdown
  BEFORE INSERT ON public.project_tender_bid_draft_items
  FOR EACH ROW EXECUTE FUNCTION private.apply_tender_bid_price_breakdown();
REVOKE ALL ON FUNCTION private.apply_tender_bid_price_breakdown() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.copy_tender_submission_price_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT source.labour_rate, source.material_rate
  INTO NEW.labour_rate, NEW.material_rate
  FROM public.project_tender_bid_draft_items source
  WHERE source.bid_round_id = NEW.bid_round_id
    AND source.participant_id = NEW.participant_id
    AND source.line_id = NEW.line_id
  ORDER BY source.bid_draft_id DESC LIMIT 1;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tender_bid_submission_items_copy_price_breakdown ON public.project_tender_bid_submission_items;
CREATE TRIGGER tender_bid_submission_items_copy_price_breakdown
  BEFORE INSERT ON public.project_tender_bid_submission_items
  FOR EACH ROW EXECUTE FUNCTION private.copy_tender_submission_price_breakdown();
REVOKE ALL ON FUNCTION private.copy_tender_submission_price_breakdown() FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid)
  RENAME TO save_my_tender_bid_draft_unit_rate_legacy;
REVOKE ALL ON FUNCTION public.save_my_tender_bid_draft_unit_rate_legacy(bigint,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_my_tender_bid_draft(
  p_bid_round_id bigint, p_items jsonb, p_expected_revision integer, p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_normalized jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE (item->>'labourRate' IS NOT NULL AND (item->>'labourRate' !~ '^[0-9]+(?:\.[0-9]+)?$' OR (item->>'labourRate')::numeric < 0))
       OR (item->>'materialRate' IS NOT NULL AND (item->>'materialRate' !~ '^[0-9]+(?:\.[0-9]+)?$' OR (item->>'materialRate')::numeric < 0))
  ) THEN
    RAISE EXCEPTION 'INVALID_BID_PRICE_COMPONENT' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(item || jsonb_build_object(
    'unitRate', CASE
      WHEN item ? 'labourRate' OR item ? 'materialRate' THEN
        CASE WHEN item->>'labourRate' IS NULL AND item->>'materialRate' IS NULL THEN NULL
          ELSE COALESCE((item->>'labourRate')::numeric, 0) + COALESCE((item->>'materialRate')::numeric, 0) END
      ELSE NULLIF(item->>'unitRate', '')::numeric
    END
  ) ORDER BY ordinal)
  INTO v_normalized
  FROM jsonb_array_elements(p_items) WITH ORDINALITY source(item, ordinal);
  PERFORM set_config('openday.tender_bid_price_breakdown', p_items::text, true);
  RETURN public.save_my_tender_bid_draft_unit_rate_legacy(
    p_bid_round_id, v_normalized, p_expected_revision, p_client_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_tender_bid_round_workspace(p_tender_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid();v_access public.project_tender_bidder_access%ROWTYPE;v_round public.project_tender_bid_rounds%ROWTYPE;v_setup public.project_tender_setup_versions%ROWTYPE;v_draft public.project_tender_bid_drafts%ROWTYPE;v_previous_round_id bigint;v_submission_id bigint;v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds WHERE tender_id=p_tender_id AND status='OPEN' ORDER BY round_number DESC LIMIT 1;
  IF v_round.id IS NULL THEN RETURN NULL;END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACTIVE' AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT id INTO v_submission_id FROM public.project_tender_bid_submissions WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT submission.bid_round_id INTO v_previous_round_id FROM public.project_tender_bid_submissions submission JOIN public.project_tender_bid_rounds prior ON prior.id=submission.bid_round_id WHERE submission.tender_id=p_tender_id AND submission.participant_id=v_access.participant_id AND prior.round_number<v_round.round_number ORDER BY prior.round_number DESC LIMIT 1;
  SELECT jsonb_build_object('bidRoundId',v_round.id,'roundNumber',v_round.round_number,'deadlineAt',v_round.deadline_at,'draftRevision',COALESCE(v_draft.revision,0),'submitted',v_submission_id IS NOT NULL,'currencyCode',v_setup.currency_code,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('lineId',source.line_id,'workGroupId',source.work_group_id,'description',source.description,'unit',source.unit,'quantity',source.quantity,
      'labourRate',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.labour_rate ELSE previous_item.labour_rate END,
      'materialRate',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.material_rate ELSE previous_item.material_rate END,
      'previousLabourRate',previous_item.labour_rate,'previousMaterialRate',previous_item.material_rate,
      'bidderNote',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.bidder_note ELSE previous_item.bidder_note END,'sortOrder',source.sort_order)ORDER BY source.sort_order,source.line_id)
      FROM public.project_boq_items source
      JOIN public.project_tender_scope_work_groups scope ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id
      LEFT JOIN public.project_tender_bid_draft_items draft_item ON draft_item.bid_draft_id=v_draft.id AND draft_item.line_id=source.line_id
      LEFT JOIN public.project_tender_bid_submissions previous_submission ON previous_submission.bid_round_id=v_previous_round_id AND previous_submission.participant_id=v_access.participant_id
      LEFT JOIN public.project_tender_bid_submission_items previous_item ON previous_item.bid_submission_id=previous_submission.id AND previous_item.line_id=source.line_id
      WHERE source.boq_version_id=v_setup.issued_boq_version_id),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;$$;
REVOKE ALL ON FUNCTION public.get_my_tender_bid_round_workspace(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tender_bid_round_workspace(uuid) TO authenticated;

COMMIT;
