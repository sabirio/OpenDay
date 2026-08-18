-- 117_tender_bid_contractor_consultant_quantities.sql
-- Tender bidders own Contractor Quantity. Consultant Quantity remains the
-- immutable value from the issued BOQ and pricing uses Contractor Quantity.

BEGIN;

ALTER TABLE public.project_tender_bid_draft_items
  ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE public.project_tender_bid_draft_items
  DROP CONSTRAINT IF EXISTS project_tender_bid_draft_items_quantity_check;
ALTER TABLE public.project_tender_bid_draft_items
  ADD CONSTRAINT project_tender_bid_draft_items_quantity_check
  CHECK (quantity IS NULL OR quantity > 0);

ALTER TABLE public.project_tender_bid_submission_items
  ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE public.project_tender_bid_submission_items
  DROP CONSTRAINT IF EXISTS project_tender_bid_submission_items_quantity_check;
ALTER TABLE public.project_tender_bid_submission_items
  ADD CONSTRAINT project_tender_bid_submission_items_quantity_check
  CHECK (quantity IS NULL OR quantity > 0);

CREATE OR REPLACE FUNCTION private.apply_tender_bid_contractor_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_payload jsonb; v_item jsonb;
BEGIN
  v_payload := NULLIF(pg_catalog.current_setting('openday.tender_bid_contractor_quantity', true), '')::jsonb;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  SELECT item INTO v_item
  FROM pg_catalog.jsonb_array_elements(v_payload) item
  WHERE item->>'lineId' = NEW.line_id::text;
  IF v_item IS NULL THEN RETURN NEW; END IF;
  NEW.quantity := NULLIF(v_item->>'quantity', '')::numeric;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tender_bid_draft_items_apply_contractor_quantity
  ON public.project_tender_bid_draft_items;
CREATE TRIGGER tender_bid_draft_items_apply_contractor_quantity
  BEFORE INSERT ON public.project_tender_bid_draft_items
  FOR EACH ROW EXECUTE FUNCTION private.apply_tender_bid_contractor_quantity();
REVOKE ALL ON FUNCTION private.apply_tender_bid_contractor_quantity()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid)
  RENAME TO save_my_tender_bid_draft_quantity_locked_legacy;
REVOKE ALL ON FUNCTION public.save_my_tender_bid_draft_quantity_locked_legacy(bigint,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_my_tender_bid_draft(
  p_bid_round_id bigint, p_items jsonb, p_expected_revision integer,
  p_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE item->>'quantity' IS NOT NULL
      AND (item->>'quantity' !~ '^[0-9]+(?:\.[0-9]+)?$'
        OR (item->>'quantity')::numeric <= 0)
  ) THEN
    RAISE EXCEPTION 'INVALID_CONTRACTOR_QUANTITY' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('openday.tender_bid_contractor_quantity', p_items::text, true);
  RETURN public.save_my_tender_bid_draft_quantity_locked_legacy(
    p_bid_round_id, p_items, p_expected_revision, p_client_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_my_tender_bid_draft(bigint,jsonb,integer,uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_tender_bid_round_workspace(p_tender_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_access public.project_tender_bidder_access%ROWTYPE;
  v_round public.project_tender_bid_rounds%ROWTYPE;
  v_setup public.project_tender_setup_versions%ROWTYPE;
  v_draft public.project_tender_bid_drafts%ROWTYPE;
  v_previous_round_id bigint;
  v_submission_id bigint;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO v_round FROM public.project_tender_bid_rounds
    WHERE tender_id=p_tender_id AND status='OPEN' ORDER BY round_number DESC LIMIT 1;
  IF v_round.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_access FROM public.project_tender_bidder_access
    WHERE tender_id=p_tender_id AND bidder_user_id=v_uid AND status='ACTIVE'
      AND tender_setup_version_id=v_round.tender_setup_version_id;
  IF v_access.tender_id IS NULL THEN RAISE EXCEPTION 'TENDER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_setup FROM public.project_tender_setup_versions WHERE id=v_round.tender_setup_version_id;
  SELECT * INTO v_draft FROM public.project_tender_bid_drafts
    WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT id INTO v_submission_id FROM public.project_tender_bid_submissions
    WHERE bid_round_id=v_round.id AND participant_id=v_access.participant_id;
  SELECT submission.bid_round_id INTO v_previous_round_id
    FROM public.project_tender_bid_submissions submission
    JOIN public.project_tender_bid_rounds prior ON prior.id=submission.bid_round_id
    WHERE submission.tender_id=p_tender_id
      AND submission.participant_id=v_access.participant_id
      AND prior.round_number<v_round.round_number
    ORDER BY prior.round_number DESC LIMIT 1;

  SELECT jsonb_build_object(
    'bidRoundId',v_round.id,'roundNumber',v_round.round_number,
    'deadlineAt',v_round.deadline_at,'draftRevision',COALESCE(v_draft.revision,0),
    'submitted',v_submission_id IS NOT NULL,'currencyCode',v_setup.currency_code,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'lineId',source.line_id,'workGroupId',source.work_group_id,
      'description',source.description,'unit',source.unit,
      'contractorQuantity',CASE
        WHEN v_draft.id IS NOT NULL THEN draft_item.quantity
        WHEN previous_submission.id IS NOT NULL THEN previous_item.quantity
        ELSE source.quantity END,
      'consultantQuantity',source.consultant_quantity,
      'quantity',CASE
        WHEN v_draft.id IS NOT NULL THEN draft_item.quantity
        WHEN previous_submission.id IS NOT NULL THEN previous_item.quantity
        ELSE source.quantity END,
      'labourRate',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.labour_rate ELSE previous_item.labour_rate END,
      'materialRate',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.material_rate ELSE previous_item.material_rate END,
      'previousLabourRate',previous_item.labour_rate,
      'previousMaterialRate',previous_item.material_rate,
      'bidderNote',CASE WHEN v_draft.id IS NOT NULL THEN draft_item.bidder_note ELSE previous_item.bidder_note END,
      'sortOrder',source.sort_order
    ) ORDER BY source.sort_order,source.line_id)
      FROM public.project_boq_items source
      JOIN public.project_tender_scope_work_groups scope
        ON scope.tender_setup_version_id=v_setup.id AND scope.work_group_id=source.work_group_id
      LEFT JOIN public.project_tender_bid_draft_items draft_item
        ON draft_item.bid_draft_id=v_draft.id AND draft_item.line_id=source.line_id
      LEFT JOIN public.project_tender_bid_submissions previous_submission
        ON previous_submission.bid_round_id=v_previous_round_id
        AND previous_submission.participant_id=v_access.participant_id
      LEFT JOIN public.project_tender_bid_submission_items previous_item
        ON previous_item.bid_submission_id=previous_submission.id AND previous_item.line_id=source.line_id
      WHERE source.boq_version_id=v_setup.issued_boq_version_id),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_tender_bid_round_workspace(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tender_bid_round_workspace(uuid)
  TO authenticated;

COMMIT;
