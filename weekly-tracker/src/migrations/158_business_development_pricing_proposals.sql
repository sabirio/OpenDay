-- 158_business_development_pricing_proposals.sql
-- Organization Rate Cards, exact Pricing, and immutable customer Proposal revisions.
BEGIN;

CREATE TABLE public.organization_rate_card_entries(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  role_name text NOT NULL CHECK(btrim(role_name)<>'' AND char_length(role_name)<=160),
  discipline text CHECK(discipline IS NULL OR(btrim(discipline)<>'' AND char_length(discipline)<=160)),
  internal_cost_rate numeric(18,2) NOT NULL CHECK(internal_cost_rate>=0),
  selling_rate numeric(18,2) CHECK(selling_rate IS NULL OR selling_rate>=0),
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  valid_from date NOT NULL,
  valid_to date CHECK(valid_to IS NULL OR valid_to>=valid_from),
  status text NOT NULL DEFAULT'ACTIVE' CHECK(status IN('ACTIVE','INACTIVE')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,role_name,discipline,currency_code,valid_from)
);
CREATE INDEX organization_rate_card_entries_org_idx ON public.organization_rate_card_entries(organization_id,status,valid_from DESC);

CREATE TABLE public.estimate_pricings(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  estimate_id uuid NOT NULL REFERENCES public.delivery_estimates(id) ON DELETE RESTRICT,
  pricing_method text NOT NULL CHECK(pricing_method IN('COST_PLUS','TARGET_MARGIN','FIXED_PRICE','RATE_BASED')),
  adjustment_value numeric(9,4),
  basis_quantity numeric(18,6),
  rate_amount numeric(18,2),
  fixed_price numeric(18,2),
  estimated_delivery_cost numeric(18,2) NOT NULL CHECK(estimated_delivery_cost>0),
  selling_price numeric(18,2) NOT NULL CHECK(selling_price>0),
  expected_profit numeric(18,2) NOT NULL,
  expected_margin numeric(9,4) NOT NULL,
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  status text NOT NULL DEFAULT'DRAFT' CHECK(status IN('DRAFT','INTERNAL_REVIEW','APPROVED')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,estimate_id)
);
CREATE INDEX estimate_pricings_org_status_idx ON public.estimate_pricings(organization_id,status,updated_at DESC);

CREATE TABLE public.commercial_proposals(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES public.commercial_opportunities(id) ON DELETE RESTRICT,
  pricing_id uuid NOT NULL REFERENCES public.estimate_pricings(id) ON DELETE RESTRICT,
  proposal_number text NOT NULL CHECK(proposal_number~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'),
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  status text NOT NULL DEFAULT'DRAFT' CHECK(status IN('DRAFT','INTERNAL_REVIEW','APPROVED_FOR_ISSUE','SENT','REVISED','ACCEPTED','AWARDED','LOST','REJECTED')),
  current_revision integer NOT NULL DEFAULT 1 CHECK(current_revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,proposal_number)
);
CREATE INDEX commercial_proposals_org_status_idx ON public.commercial_proposals(organization_id,status,updated_at DESC);

CREATE TABLE public.commercial_proposal_revisions(
  proposal_id uuid NOT NULL REFERENCES public.commercial_proposals(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK(revision>0),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  pricing_id uuid NOT NULL REFERENCES public.estimate_pricings(id) ON DELETE RESTRICT,
  total_amount numeric(18,2) NOT NULL CHECK(total_amount>=0),
  validity_days integer NOT NULL CHECK(validity_days BETWEEN 1 AND 365),
  commercial_terms text CHECK(commercial_terms IS NULL OR char_length(commercial_terms)<=10000),
  revision_reason text NOT NULL CHECK(btrim(revision_reason)<>'' AND char_length(revision_reason)<=1000),
  pricing_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(proposal_id,revision)
);

CREATE TABLE public.commercial_proposal_sections(
  proposal_id uuid NOT NULL,
  revision integer NOT NULL,
  id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK(btrim(title)<>'' AND char_length(title)<=240),
  description text CHECK(description IS NULL OR char_length(description)<=4000),
  amount numeric(18,2) NOT NULL CHECK(amount>=0),
  sort_order integer NOT NULL CHECK(sort_order>0),
  PRIMARY KEY(proposal_id,revision,id),
  UNIQUE(proposal_id,revision,sort_order),
  FOREIGN KEY(proposal_id,revision) REFERENCES public.commercial_proposal_revisions(proposal_id,revision) ON DELETE RESTRICT
);

ALTER TABLE public.business_development_events DROP CONSTRAINT business_development_events_event_type_check;
ALTER TABLE public.business_development_events ADD CONSTRAINT business_development_events_event_type_check CHECK(event_type IN(
  'OPPORTUNITY_CREATED','OPPORTUNITY_UPDATED','ESTIMATE_CREATED','ESTIMATE_UPDATED',
  'RATE_CARD_CREATED','RATE_CARD_UPDATED','PRICING_CREATED','PRICING_UPDATED','PROPOSAL_REVISION_CREATED','PROPOSAL_STATUS_CHANGED'
));

CREATE OR REPLACE FUNCTION private.commercial_revision_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION'COMMERCIAL_REVISION_IMMUTABLE' USING ERRCODE='55000'; END$$;
CREATE TRIGGER commercial_proposal_revisions_immutable BEFORE UPDATE OR DELETE ON public.commercial_proposal_revisions
FOR EACH ROW EXECUTE FUNCTION private.commercial_revision_immutable();
CREATE TRIGGER commercial_proposal_sections_immutable BEFORE UPDATE OR DELETE ON public.commercial_proposal_sections
FOR EACH ROW EXECUTE FUNCTION private.commercial_revision_immutable();

CREATE OR REPLACE FUNCTION private.business_development_workspace_json(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object(
    'organizationId',p_organization_id,
    'opportunities',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'opportunityId',o.id,'opportunityNumber',o.opportunity_number,'title',o.title,'clientName',o.client_name,
      'currencyCode',o.currency_code,'status',o.status,'ownerUserId',o.owner_user_id,'revision',o.revision,'updatedAt',o.updated_at
    )ORDER BY o.updated_at DESC)FROM public.commercial_opportunities o WHERE o.organization_id=p_organization_id),'[]'::jsonb),
    'estimates',CASE WHEN public.has_organization_capability(p_organization_id,'estimating.delivery',now())THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'estimateId',e.id,'opportunityId',e.opportunity_id,'estimateNumber',e.estimate_number,'title',e.title,
        'currencyCode',e.currency_code,'status',e.status,'revision',e.revision,
        'internalLabourCost',COALESCE(t.internal_labour,0),'externalCost',COALESCE(t.external_cost,0),
        'otherDirectCost',COALESCE(t.other_direct,0),'estimatedDeliveryCost',COALESCE(t.delivery_cost,0),
        'items',COALESCE(t.items,'[]'::jsonb),'updatedAt',e.updated_at
      )ORDER BY e.updated_at DESC)
      FROM public.delivery_estimates e LEFT JOIN LATERAL(
        SELECT sum(i.amount)FILTER(WHERE i.category='INTERNAL_LABOUR')internal_labour,
          sum(i.amount)FILTER(WHERE i.category='EXTERNAL_COST')external_cost,
          sum(i.amount)FILTER(WHERE i.category='OTHER_DIRECT_COST')other_direct,sum(i.amount)delivery_cost,
          jsonb_agg(jsonb_build_object('itemId',i.id,'category',i.category,'description',i.description,'discipline',i.discipline,
            'employeeGrade',i.employee_grade,'supplierName',i.supplier_name,'quantity',i.quantity,'unit',i.unit,
            'unitCostRate',i.unit_cost_rate,'amount',i.amount,'note',i.note,'sortOrder',i.sort_order)ORDER BY i.sort_order)items
        FROM public.delivery_estimate_items i WHERE i.estimate_id=e.id
      )t ON true WHERE e.organization_id=p_organization_id
    ),'[]'::jsonb)ELSE'[]'::jsonb END,
    'rateCards',CASE WHEN public.has_organization_capability(p_organization_id,'pricing.commercial',now())THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('rateCardId',r.id,'roleName',r.role_name,'discipline',r.discipline,
        'internalCostRate',r.internal_cost_rate,'sellingRate',r.selling_rate,'currencyCode',r.currency_code,
        'validFrom',r.valid_from,'validTo',r.valid_to,'status',r.status,'revision',r.revision)ORDER BY r.role_name,r.valid_from DESC)
      FROM public.organization_rate_card_entries r WHERE r.organization_id=p_organization_id
    ),'[]'::jsonb)ELSE'[]'::jsonb END,
    'pricings',CASE WHEN public.has_organization_capability(p_organization_id,'pricing.commercial',now())THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('pricingId',p.id,'estimateId',p.estimate_id,'pricingMethod',p.pricing_method,
        'adjustmentValue',p.adjustment_value,'basisQuantity',p.basis_quantity,'rateAmount',p.rate_amount,'fixedPrice',p.fixed_price,
        'estimatedDeliveryCost',p.estimated_delivery_cost,'sellingPrice',p.selling_price,'expectedProfit',p.expected_profit,
        'expectedMargin',p.expected_margin,'currencyCode',p.currency_code,'status',p.status,'revision',p.revision,'updatedAt',p.updated_at)
        ORDER BY p.updated_at DESC)FROM public.estimate_pricings p WHERE p.organization_id=p_organization_id
    ),'[]'::jsonb)ELSE'[]'::jsonb END,
    'proposals',CASE WHEN public.has_organization_capability(p_organization_id,'proposals.issue',now())THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('proposalId',p.id,'opportunityId',p.opportunity_id,'pricingId',p.pricing_id,
        'proposalNumber',p.proposal_number,'title',p.title,'currencyCode',p.currency_code,'status',p.status,
        'revision',p.current_revision,'totalAmount',r.total_amount,'validityDays',r.validity_days,
        'commercialTerms',r.commercial_terms,'revisionReason',r.revision_reason,'sections',COALESCE(s.sections,'[]'::jsonb),
        'updatedAt',p.updated_at)ORDER BY p.updated_at DESC)
      FROM public.commercial_proposals p JOIN public.commercial_proposal_revisions r ON r.proposal_id=p.id AND r.revision=p.current_revision
      LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('sectionId',s.id,'title',s.title,'description',s.description,
        'amount',s.amount,'sortOrder',s.sort_order)ORDER BY s.sort_order)sections FROM public.commercial_proposal_sections s
        WHERE s.proposal_id=p.id AND s.revision=p.current_revision)s ON true WHERE p.organization_id=p_organization_id
    ),'[]'::jsonb)ELSE'[]'::jsonb END
  );
$$;

CREATE OR REPLACE FUNCTION public.save_organization_rate_card_entry(
  p_organization_id uuid,p_rate_card_id uuid,p_role_name text,p_discipline text,p_internal_cost_rate numeric,
  p_selling_rate numeric,p_currency_code text,p_valid_from date,p_valid_to date,p_status text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.organization_rate_card_entries%ROWTYPE;v_request public.business_development_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'pricing.commercial');
  IF p_rate_card_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision<0 OR btrim(COALESCE(p_role_name,''))=''
    OR p_internal_cost_rate<0 OR(p_selling_rate IS NOT NULL AND p_selling_rate<0)OR p_currency_code!~'^[A-Z]{3}$'
    OR p_valid_from IS NULL OR(p_valid_to IS NOT NULL AND p_valid_to<p_valid_from)OR p_status NOT IN('ACTIVE','INACTIVE')THEN
    RAISE EXCEPTION'INVALID_RATE_CARD_ENTRY'USING ERRCODE='22023';END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'rateCardId',p_rate_card_id,'roleName',btrim(p_role_name),
    'discipline',NULLIF(btrim(COALESCE(p_discipline,'')),''),'internalCostRate',p_internal_cost_rate,'sellingRate',p_selling_rate,
    'currencyCode',p_currency_code,'validFrom',p_valid_from,'validTo',p_valid_to,'status',p_status,'expectedRevision',p_expected_revision);
  INSERT INTO public.business_development_command_requests(actor_id,operation,client_request_id,request_payload)
    VALUES(v_actor,'rate_card.save',p_client_request_id,v_payload)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.business_development_command_requests WHERE actor_id=v_actor AND operation='rate_card.save'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_IDEMPOTENCY_CONFLICT'USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision=0 THEN
    INSERT INTO public.organization_rate_card_entries(id,organization_id,role_name,discipline,internal_cost_rate,selling_rate,currency_code,valid_from,valid_to,status,created_by,updated_by)
    VALUES(p_rate_card_id,p_organization_id,btrim(p_role_name),NULLIF(btrim(COALESCE(p_discipline,'')),''),p_internal_cost_rate,p_selling_rate,p_currency_code,p_valid_from,p_valid_to,p_status,v_actor,v_actor)RETURNING*INTO v_row;
  ELSE
    UPDATE public.organization_rate_card_entries SET role_name=btrim(p_role_name),discipline=NULLIF(btrim(COALESCE(p_discipline,'')),''),
      internal_cost_rate=p_internal_cost_rate,selling_rate=p_selling_rate,currency_code=p_currency_code,valid_from=p_valid_from,
      valid_to=p_valid_to,status=p_status,revision=revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=p_rate_card_id AND organization_id=p_organization_id AND revision=p_expected_revision RETURNING*INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION'RATE_CARD_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
  END IF;
  v_result:=jsonb_build_object('rateCardId',v_row.id,'revision',v_row.revision,'status',v_row.status);
  INSERT INTO public.business_development_events(organization_id,event_type,revision,snapshot,actor_id,client_request_id)
  VALUES(p_organization_id,CASE WHEN p_expected_revision=0 THEN'RATE_CARD_CREATED'ELSE'RATE_CARD_UPDATED'END,v_row.revision,to_jsonb(v_row),v_actor,p_client_request_id);
  UPDATE public.business_development_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END$$;

CREATE OR REPLACE FUNCTION public.save_estimate_pricing(
  p_organization_id uuid,p_pricing_id uuid,p_estimate_id uuid,p_pricing_method text,p_adjustment_value numeric,
  p_basis_quantity numeric,p_rate_amount numeric,p_fixed_price numeric,p_status text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.estimate_pricings%ROWTYPE;v_estimate public.delivery_estimates%ROWTYPE;
  v_request public.business_development_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;v_cost numeric(18,2);v_selling numeric(18,2);v_profit numeric(18,2);v_margin numeric(9,4);
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'pricing.commercial');
  SELECT*INTO v_estimate FROM public.delivery_estimates WHERE id=p_estimate_id AND organization_id=p_organization_id;
  SELECT COALESCE(sum(amount),0)INTO v_cost FROM public.delivery_estimate_items WHERE estimate_id=p_estimate_id;
  IF p_pricing_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision<0 OR v_estimate.id IS NULL OR v_estimate.status<>'APPROVED'
    OR v_cost<=0 OR p_pricing_method NOT IN('COST_PLUS','TARGET_MARGIN','FIXED_PRICE','RATE_BASED')
    OR p_status NOT IN('DRAFT','INTERNAL_REVIEW','APPROVED')THEN RAISE EXCEPTION'INVALID_ESTIMATE_PRICING'USING ERRCODE='22023';END IF;
  IF p_pricing_method='COST_PLUS'AND(p_adjustment_value IS NULL OR p_adjustment_value<0)THEN RAISE EXCEPTION'INVALID_PRICING_MARKUP'USING ERRCODE='22023';
  ELSIF p_pricing_method='TARGET_MARGIN'AND(p_adjustment_value IS NULL OR p_adjustment_value<0 OR p_adjustment_value>=100)THEN RAISE EXCEPTION'INVALID_PRICING_MARGIN'USING ERRCODE='22023';
  ELSIF p_pricing_method='FIXED_PRICE'AND(p_fixed_price IS NULL OR p_fixed_price<=0)THEN RAISE EXCEPTION'INVALID_PRICING_FIXED_PRICE'USING ERRCODE='22023';
  ELSIF p_pricing_method='RATE_BASED'AND(p_basis_quantity IS NULL OR p_basis_quantity<=0 OR p_rate_amount IS NULL OR p_rate_amount<=0)THEN RAISE EXCEPTION'INVALID_PRICING_RATE_BASIS'USING ERRCODE='22023';END IF;
  v_selling:=CASE p_pricing_method WHEN'COST_PLUS'THEN round(v_cost*(1+p_adjustment_value/100),2)
    WHEN'TARGET_MARGIN'THEN round(v_cost/(1-p_adjustment_value/100),2)WHEN'FIXED_PRICE'THEN round(p_fixed_price,2)
    WHEN'RATE_BASED'THEN round(p_basis_quantity*p_rate_amount,2)END;
  v_profit:=v_selling-v_cost;v_margin:=CASE WHEN v_selling=0 THEN 0 ELSE round(v_profit/v_selling*100,4)END;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'pricingId',p_pricing_id,'estimateId',p_estimate_id,'method',p_pricing_method,
    'adjustment',p_adjustment_value,'basisQuantity',p_basis_quantity,'rateAmount',p_rate_amount,'fixedPrice',p_fixed_price,'status',p_status,'expectedRevision',p_expected_revision);
  INSERT INTO public.business_development_command_requests(actor_id,operation,client_request_id,request_payload)
    VALUES(v_actor,'pricing.save',p_client_request_id,v_payload)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.business_development_command_requests WHERE actor_id=v_actor AND operation='pricing.save'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_IDEMPOTENCY_CONFLICT'USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision=0 THEN
    INSERT INTO public.estimate_pricings(id,organization_id,estimate_id,pricing_method,adjustment_value,basis_quantity,rate_amount,fixed_price,
      estimated_delivery_cost,selling_price,expected_profit,expected_margin,currency_code,status,created_by,updated_by)
    VALUES(p_pricing_id,p_organization_id,p_estimate_id,p_pricing_method,p_adjustment_value,p_basis_quantity,p_rate_amount,p_fixed_price,
      v_cost,v_selling,v_profit,v_margin,v_estimate.currency_code,p_status,v_actor,v_actor)RETURNING*INTO v_row;
  ELSE
    UPDATE public.estimate_pricings SET pricing_method=p_pricing_method,adjustment_value=p_adjustment_value,basis_quantity=p_basis_quantity,
      rate_amount=p_rate_amount,fixed_price=p_fixed_price,estimated_delivery_cost=v_cost,selling_price=v_selling,expected_profit=v_profit,
      expected_margin=v_margin,status=p_status,revision=revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=p_pricing_id AND organization_id=p_organization_id AND estimate_id=p_estimate_id AND revision=p_expected_revision RETURNING*INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION'PRICING_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
  END IF;
  v_result:=jsonb_build_object('pricingId',v_row.id,'revision',v_row.revision,'status',v_row.status,'sellingPrice',v_row.selling_price,'expectedMargin',v_row.expected_margin);
  INSERT INTO public.business_development_events(organization_id,estimate_id,event_type,revision,snapshot,actor_id,client_request_id)
  VALUES(p_organization_id,p_estimate_id,CASE WHEN p_expected_revision=0 THEN'PRICING_CREATED'ELSE'PRICING_UPDATED'END,v_row.revision,to_jsonb(v_row),v_actor,p_client_request_id);
  UPDATE public.business_development_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END$$;

CREATE OR REPLACE FUNCTION public.save_commercial_proposal_revision(
  p_organization_id uuid,p_proposal_id uuid,p_pricing_id uuid,p_proposal_number text,p_title text,p_currency_code text,
  p_validity_days integer,p_commercial_terms text,p_revision_reason text,p_sections jsonb,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_proposal public.commercial_proposals%ROWTYPE;v_pricing public.estimate_pricings%ROWTYPE;v_opportunity_id uuid;
  v_request public.business_development_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;v_section jsonb;v_total numeric(18,2):=0;v_revision integer;
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'proposals.issue');
  SELECT p.*INTO v_pricing FROM public.estimate_pricings p WHERE p.id=p_pricing_id AND p.organization_id=p_organization_id AND p.status='APPROVED';
  SELECT e.opportunity_id INTO v_opportunity_id FROM public.delivery_estimates e WHERE e.id=v_pricing.estimate_id AND e.organization_id=p_organization_id;
  IF p_proposal_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision<0 OR v_pricing.id IS NULL OR v_opportunity_id IS NULL
    OR upper(btrim(COALESCE(p_proposal_number,'')))!~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'OR btrim(COALESCE(p_title,''))=''
    OR p_currency_code<>v_pricing.currency_code OR p_validity_days NOT BETWEEN 1 AND 365 OR btrim(COALESCE(p_revision_reason,''))=''
    OR jsonb_typeof(p_sections)<>'array'OR jsonb_array_length(p_sections)=0 THEN RAISE EXCEPTION'INVALID_COMMERCIAL_PROPOSAL'USING ERRCODE='22023';END IF;
  FOR v_section IN SELECT value FROM jsonb_array_elements(p_sections)LOOP
    IF COALESCE(v_section->>'sectionId','')!~'^[0-9a-fA-F-]{36}$'OR btrim(COALESCE(v_section->>'title',''))=''
      OR COALESCE(v_section->>'amount','')!~'^\d+(\.\d{1,2})?$'THEN RAISE EXCEPTION'INVALID_COMMERCIAL_PROPOSAL_SECTION'USING ERRCODE='22023';END IF;
    v_total:=v_total+(v_section->>'amount')::numeric;
  END LOOP;
  IF round(v_total,2)<>v_pricing.selling_price THEN RAISE EXCEPTION'PROPOSAL_TOTAL_MUST_MATCH_APPROVED_PRICE'USING ERRCODE='22023';END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'proposalId',p_proposal_id,'pricingId',p_pricing_id,
    'number',upper(btrim(p_proposal_number)),'title',btrim(p_title),'currency',p_currency_code,'validityDays',p_validity_days,
    'commercialTerms',p_commercial_terms,'revisionReason',btrim(p_revision_reason),'sections',p_sections,'expectedRevision',p_expected_revision);
  INSERT INTO public.business_development_command_requests(actor_id,operation,client_request_id,request_payload)
    VALUES(v_actor,'proposal.revision.create',p_client_request_id,v_payload)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.business_development_command_requests WHERE actor_id=v_actor AND operation='proposal.revision.create'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_IDEMPOTENCY_CONFLICT'USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision=0 THEN
    INSERT INTO public.commercial_proposals(id,organization_id,opportunity_id,pricing_id,proposal_number,title,currency_code,created_by,updated_by)
    VALUES(p_proposal_id,p_organization_id,v_opportunity_id,p_pricing_id,upper(btrim(p_proposal_number)),btrim(p_title),p_currency_code,v_actor,v_actor)RETURNING*INTO v_proposal;
    v_revision:=1;
  ELSE
    UPDATE public.commercial_proposals SET pricing_id=p_pricing_id,proposal_number=upper(btrim(p_proposal_number)),title=btrim(p_title),
      status='REVISED',current_revision=current_revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=p_proposal_id AND organization_id=p_organization_id AND current_revision=p_expected_revision
      AND status NOT IN('ACCEPTED','AWARDED','LOST','REJECTED')RETURNING*INTO v_proposal;
    IF v_proposal.id IS NULL THEN RAISE EXCEPTION'PROPOSAL_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
    v_revision:=v_proposal.current_revision;
  END IF;
  INSERT INTO public.commercial_proposal_revisions(proposal_id,revision,organization_id,pricing_id,total_amount,validity_days,commercial_terms,revision_reason,pricing_snapshot,created_by)
  VALUES(p_proposal_id,v_revision,p_organization_id,p_pricing_id,v_pricing.selling_price,p_validity_days,NULLIF(btrim(COALESCE(p_commercial_terms,'')),''),
    btrim(p_revision_reason),to_jsonb(v_pricing),v_actor);
  INSERT INTO public.commercial_proposal_sections(proposal_id,revision,id,organization_id,title,description,amount,sort_order)
  SELECT p_proposal_id,v_revision,(s->>'sectionId')::uuid,p_organization_id,btrim(s->>'title'),NULLIF(btrim(COALESCE(s->>'description','')),''),
    (s->>'amount')::numeric,ordinality::integer FROM jsonb_array_elements(p_sections)WITH ORDINALITY source(s,ordinality);
  v_result:=jsonb_build_object('proposalId',p_proposal_id,'revision',v_revision,'status',v_proposal.status,'totalAmount',v_pricing.selling_price);
  INSERT INTO public.business_development_events(organization_id,opportunity_id,estimate_id,event_type,revision,snapshot,actor_id,client_request_id)
  VALUES(p_organization_id,v_opportunity_id,v_pricing.estimate_id,'PROPOSAL_REVISION_CREATED',v_revision,
    jsonb_build_object('proposal',to_jsonb(v_proposal),'revision',v_revision,'sections',p_sections,'totalAmount',v_pricing.selling_price),v_actor,p_client_request_id);
  UPDATE public.business_development_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END$$;

CREATE OR REPLACE FUNCTION public.transition_commercial_proposal(
  p_organization_id uuid,p_proposal_id uuid,p_target_status text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.commercial_proposals%ROWTYPE;v_previous text;
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'proposals.issue');
  SELECT status INTO v_previous FROM public.commercial_proposals WHERE id=p_proposal_id AND organization_id=p_organization_id AND current_revision=p_expected_revision FOR UPDATE;
  IF v_previous IS NULL OR p_client_request_id IS NULL OR NOT((v_previous='DRAFT'AND p_target_status='INTERNAL_REVIEW')
    OR(v_previous IN('INTERNAL_REVIEW','REVISED')AND p_target_status='APPROVED_FOR_ISSUE')OR(v_previous='APPROVED_FOR_ISSUE'AND p_target_status='SENT')
    OR(v_previous='SENT'AND p_target_status IN('ACCEPTED','AWARDED','LOST','REJECTED','REVISED'))
    OR(v_previous='ACCEPTED'AND p_target_status='AWARDED'))THEN RAISE EXCEPTION'INVALID_PROPOSAL_STATUS_TRANSITION'USING ERRCODE='22023';END IF;
  UPDATE public.commercial_proposals SET status=p_target_status,updated_by=v_actor,updated_at=now()
  WHERE id=p_proposal_id AND organization_id=p_organization_id RETURNING*INTO v_row;
  INSERT INTO public.business_development_events(organization_id,opportunity_id,event_type,revision,snapshot,actor_id,client_request_id)
  VALUES(p_organization_id,v_row.opportunity_id,'PROPOSAL_STATUS_CHANGED',v_row.current_revision,
    jsonb_build_object('proposalId',v_row.id,'from',v_previous,'to',v_row.status),v_actor,p_client_request_id);
  RETURN jsonb_build_object('proposalId',v_row.id,'revision',v_row.current_revision,'status',v_row.status);
END$$;

ALTER TABLE public.organization_rate_card_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_pricings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_proposal_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_proposal_sections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_rate_card_entries,public.estimate_pricings,public.commercial_proposals,
  public.commercial_proposal_revisions,public.commercial_proposal_sections FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.commercial_revision_immutable(),private.business_development_workspace_json(uuid),
  public.save_organization_rate_card_entry(uuid,uuid,text,text,numeric,numeric,text,date,date,text,integer,uuid),
  public.save_estimate_pricing(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,text,integer,uuid),
  public.save_commercial_proposal_revision(uuid,uuid,uuid,text,text,text,integer,text,text,jsonb,integer,uuid),
  public.transition_commercial_proposal(uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_organization_rate_card_entry(uuid,uuid,text,text,numeric,numeric,text,date,date,text,integer,uuid),
  public.save_estimate_pricing(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,text,integer,uuid),
  public.save_commercial_proposal_revision(uuid,uuid,uuid,text,text,text,integer,text,text,jsonb,integer,uuid),
  public.transition_commercial_proposal(uuid,uuid,text,integer,uuid) TO authenticated;

COMMIT;
