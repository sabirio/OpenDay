-- 157_business_development_estimate_foundation.sql
-- Organization-scoped Opportunity and confidential Delivery Estimate foundation.
BEGIN;

CREATE TABLE public.commercial_opportunities(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
  opportunity_number text NOT NULL CHECK(opportunity_number~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'),
  title text NOT NULL CHECK(btrim(title)<>''AND char_length(title)<=240),
  client_name text NOT NULL CHECK(btrim(client_name)<>''AND char_length(client_name)<=240),
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  status text NOT NULL DEFAULT'DRAFT'CHECK(status IN('DRAFT','QUALIFYING','ESTIMATING','PROPOSAL','SENT','WON','LOST')),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,opportunity_number)
);
CREATE INDEX commercial_opportunities_org_status_idx ON public.commercial_opportunities(organization_id,status,updated_at DESC);

CREATE TABLE public.delivery_estimates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
  opportunity_id uuid NOT NULL REFERENCES public.commercial_opportunities(id)ON DELETE RESTRICT,
  estimate_number text NOT NULL CHECK(estimate_number~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'),
  title text NOT NULL CHECK(btrim(title)<>''AND char_length(title)<=240),
  currency_code text NOT NULL CHECK(currency_code~'^[A-Z]{3}$'),
  status text NOT NULL DEFAULT'DRAFT'CHECK(status IN('DRAFT','INTERNAL_REVIEW','APPROVED','ARCHIVED')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,estimate_number)
);
CREATE INDEX delivery_estimates_org_opportunity_idx ON public.delivery_estimates(organization_id,opportunity_id,updated_at DESC);

CREATE TABLE public.delivery_estimate_items(
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
  estimate_id uuid NOT NULL REFERENCES public.delivery_estimates(id)ON DELETE CASCADE,
  category text NOT NULL CHECK(category IN('INTERNAL_LABOUR','EXTERNAL_COST','OTHER_DIRECT_COST')),
  description text NOT NULL CHECK(btrim(description)<>''AND char_length(description)<=500),
  discipline text CHECK(discipline IS NULL OR(btrim(discipline)<>''AND char_length(discipline)<=160)),
  employee_grade text CHECK(employee_grade IS NULL OR(btrim(employee_grade)<>''AND char_length(employee_grade)<=160)),
  supplier_name text CHECK(supplier_name IS NULL OR(btrim(supplier_name)<>''AND char_length(supplier_name)<=240)),
  quantity numeric(18,6)NOT NULL CHECK(quantity>0),
  unit text NOT NULL CHECK(btrim(unit)<>''AND char_length(unit)<=40),
  unit_cost_rate numeric(18,2)NOT NULL CHECK(unit_cost_rate>=0),
  amount numeric(18,2)GENERATED ALWAYS AS(round(quantity*unit_cost_rate,2))STORED,
  note text CHECK(note IS NULL OR char_length(note)<=2000),
  sort_order integer NOT NULL CHECK(sort_order>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(category<>'INTERNAL_LABOUR'OR(discipline IS NOT NULL AND employee_grade IS NOT NULL)),
  UNIQUE(estimate_id,sort_order),
  UNIQUE(estimate_id,id)
);
CREATE INDEX delivery_estimate_items_estimate_idx ON public.delivery_estimate_items(estimate_id,sort_order);

CREATE TABLE public.business_development_command_requests(
  id bigserial PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  operation text NOT NULL,
  client_request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(actor_id,operation,client_request_id)
);

CREATE TABLE public.business_development_events(
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id)ON DELETE RESTRICT,
  opportunity_id uuid REFERENCES public.commercial_opportunities(id)ON DELETE RESTRICT,
  estimate_id uuid REFERENCES public.delivery_estimates(id)ON DELETE RESTRICT,
  event_type text NOT NULL CHECK(event_type IN('OPPORTUNITY_CREATED','OPPORTUNITY_UPDATED','ESTIMATE_CREATED','ESTIMATE_UPDATED')),
  revision integer NOT NULL CHECK(revision>0),
  snapshot jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id)ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_development_events_org_idx ON public.business_development_events(organization_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION private.business_development_events_immutable()RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$BEGIN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_EVENTS_IMMUTABLE'USING ERRCODE='55000';END$$;
CREATE TRIGGER business_development_events_immutable BEFORE UPDATE OR DELETE ON public.business_development_events
FOR EACH ROW EXECUTE FUNCTION private.business_development_events_immutable();

CREATE OR REPLACE FUNCTION private.require_business_development_writer(p_organization_id uuid,p_capability_id text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor uuid:=auth.uid();
BEGIN
  PERFORM public.require_organization_capability(p_organization_id,p_capability_id,now());
  IF NOT EXISTS(SELECT 1 FROM public.organization_memberships membership
    WHERE membership.organization_id=p_organization_id AND membership.user_id=v_actor
      AND membership.status='ACTIVE'AND membership.access_role IN('Admin','PM','Consultant'))THEN
    RAISE EXCEPTION'BUSINESS_DEVELOPMENT_WRITE_FORBIDDEN'USING ERRCODE='42501';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION private.business_development_workspace_json(p_organization_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object(
    'organizationId',p_organization_id,
    'opportunities',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'opportunityId',opportunity.id,'opportunityNumber',opportunity.opportunity_number,
      'title',opportunity.title,'clientName',opportunity.client_name,'currencyCode',opportunity.currency_code,
      'status',opportunity.status,'ownerUserId',opportunity.owner_user_id,'revision',opportunity.revision,
      'updatedAt',opportunity.updated_at)ORDER BY opportunity.updated_at DESC)
      FROM public.commercial_opportunities opportunity WHERE opportunity.organization_id=p_organization_id),'[]'::jsonb),
    'estimates',CASE WHEN public.has_organization_capability(p_organization_id,'estimating.delivery',now())THEN
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'estimateId',estimate.id,'opportunityId',estimate.opportunity_id,'estimateNumber',estimate.estimate_number,
        'title',estimate.title,'currencyCode',estimate.currency_code,'status',estimate.status,'revision',estimate.revision,
        'internalLabourCost',COALESCE(total.internal_labour,0),'externalCost',COALESCE(total.external_cost,0),
        'otherDirectCost',COALESCE(total.other_direct,0),'estimatedDeliveryCost',COALESCE(total.delivery_cost,0),
        'items',COALESCE(total.items,'[]'::jsonb),'updatedAt',estimate.updated_at)ORDER BY estimate.updated_at DESC)
      FROM public.delivery_estimates estimate LEFT JOIN LATERAL(
        SELECT sum(item.amount)FILTER(WHERE item.category='INTERNAL_LABOUR')internal_labour,
          sum(item.amount)FILTER(WHERE item.category='EXTERNAL_COST')external_cost,
          sum(item.amount)FILTER(WHERE item.category='OTHER_DIRECT_COST')other_direct,sum(item.amount)delivery_cost,
          jsonb_agg(jsonb_build_object('itemId',item.id,'category',item.category,'description',item.description,
            'discipline',item.discipline,'employeeGrade',item.employee_grade,'supplierName',item.supplier_name,
            'quantity',item.quantity,'unit',item.unit,'unitCostRate',item.unit_cost_rate,'amount',item.amount,
            'note',item.note,'sortOrder',item.sort_order)ORDER BY item.sort_order)items
        FROM public.delivery_estimate_items item WHERE item.estimate_id=estimate.id
      )total ON true WHERE estimate.organization_id=p_organization_id),'[]'::jsonb)ELSE'[]'::jsonb END);
$$;

CREATE OR REPLACE FUNCTION public.get_business_development_workspace(p_organization_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM public.require_organization_capability(p_organization_id,'opportunities.pipeline',now());
  RETURN private.business_development_workspace_json(p_organization_id);
END$$;

CREATE OR REPLACE FUNCTION public.save_commercial_opportunity(
  p_organization_id uuid,p_opportunity_id uuid,p_opportunity_number text,p_title text,p_client_name text,
  p_currency_code text,p_status text,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.commercial_opportunities%ROWTYPE;v_request public.business_development_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'opportunities.pipeline');
  IF p_opportunity_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision<0
    OR upper(btrim(COALESCE(p_opportunity_number,'')))!~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'
    OR btrim(COALESCE(p_title,''))=''OR char_length(btrim(p_title))>240
    OR btrim(COALESCE(p_client_name,''))=''OR char_length(btrim(p_client_name))>240
    OR p_currency_code!~'^[A-Z]{3}$'OR p_status NOT IN('DRAFT','QUALIFYING','ESTIMATING','PROPOSAL','SENT','WON','LOST')THEN
    RAISE EXCEPTION'INVALID_COMMERCIAL_OPPORTUNITY'USING ERRCODE='22023';END IF;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'opportunityId',p_opportunity_id,'number',upper(btrim(p_opportunity_number)),
    'title',btrim(p_title),'client',btrim(p_client_name),'currency',p_currency_code,'status',p_status,'expectedRevision',p_expected_revision);
  INSERT INTO public.business_development_command_requests(actor_id,operation,client_request_id,request_payload)
    VALUES(v_actor,'opportunity.save',p_client_request_id,v_payload)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.business_development_command_requests WHERE actor_id=v_actor AND operation='opportunity.save'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_IDEMPOTENCY_CONFLICT'USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision=0 THEN
    INSERT INTO public.commercial_opportunities(id,organization_id,opportunity_number,title,client_name,currency_code,status,owner_user_id,created_by,updated_by)
      VALUES(p_opportunity_id,p_organization_id,upper(btrim(p_opportunity_number)),btrim(p_title),btrim(p_client_name),p_currency_code,p_status,v_actor,v_actor,v_actor)RETURNING*INTO v_row;
  ELSE
    UPDATE public.commercial_opportunities SET opportunity_number=upper(btrim(p_opportunity_number)),title=btrim(p_title),client_name=btrim(p_client_name),
      currency_code=p_currency_code,status=p_status,revision=revision+1,updated_by=v_actor,updated_at=now()
    WHERE id=p_opportunity_id AND organization_id=p_organization_id AND revision=p_expected_revision RETURNING*INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION'COMMERCIAL_OPPORTUNITY_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
  END IF;
  v_result:=jsonb_build_object('opportunityId',v_row.id,'revision',v_row.revision,'status',v_row.status);
  INSERT INTO public.business_development_events(organization_id,opportunity_id,event_type,revision,snapshot,actor_id,client_request_id)
    VALUES(p_organization_id,v_row.id,CASE WHEN p_expected_revision=0 THEN'OPPORTUNITY_CREATED'ELSE'OPPORTUNITY_UPDATED'END,v_row.revision,to_jsonb(v_row),v_actor,p_client_request_id);
  UPDATE public.business_development_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END$$;

CREATE OR REPLACE FUNCTION public.save_delivery_estimate(
  p_organization_id uuid,p_estimate_id uuid,p_opportunity_id uuid,p_estimate_number text,p_title text,
  p_currency_code text,p_status text,p_items jsonb,p_expected_revision integer,p_client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid();v_row public.delivery_estimates%ROWTYPE;v_request public.business_development_command_requests%ROWTYPE;v_payload jsonb;v_result jsonb;v_item jsonb;v_total numeric(18,2);
BEGIN
  PERFORM private.require_business_development_writer(p_organization_id,'estimating.delivery');
  IF p_estimate_id IS NULL OR p_opportunity_id IS NULL OR p_client_request_id IS NULL OR p_expected_revision<0
    OR upper(btrim(COALESCE(p_estimate_number,'')))!~'^[A-Z0-9][A-Z0-9._/-]{1,39}$'OR btrim(COALESCE(p_title,''))=''
    OR char_length(btrim(p_title))>240 OR p_currency_code!~'^[A-Z]{3}$'OR p_status NOT IN('DRAFT','INTERNAL_REVIEW','APPROVED','ARCHIVED')
    OR jsonb_typeof(p_items)<>'array'OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION'INVALID_DELIVERY_ESTIMATE'USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.commercial_opportunities WHERE id=p_opportunity_id AND organization_id=p_organization_id AND currency_code=p_currency_code)THEN
    RAISE EXCEPTION'ESTIMATE_OPPORTUNITY_INVALID'USING ERRCODE='22023';END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)LOOP
    IF COALESCE(v_item->>'itemId','')!~'^[0-9a-fA-F-]{36}$'OR v_item->>'category'NOT IN('INTERNAL_LABOUR','EXTERNAL_COST','OTHER_DIRECT_COST')
      OR btrim(COALESCE(v_item->>'description',''))=''OR COALESCE(v_item->>'quantity','')!~'^\d+(\.\d{1,6})?$'
      OR(v_item->>'quantity')::numeric<=0 OR COALESCE(v_item->>'unitCostRate','')!~'^\d+(\.\d{1,2})?$'
      OR btrim(COALESCE(v_item->>'unit',''))=''OR(v_item->>'category'='INTERNAL_LABOUR'AND(btrim(COALESCE(v_item->>'discipline',''))=''OR btrim(COALESCE(v_item->>'employeeGrade',''))=''))THEN
      RAISE EXCEPTION'INVALID_DELIVERY_ESTIMATE_ITEM'USING ERRCODE='22023';END IF;
  END LOOP;
  v_payload:=jsonb_build_object('organizationId',p_organization_id,'estimateId',p_estimate_id,'opportunityId',p_opportunity_id,'number',upper(btrim(p_estimate_number)),
    'title',btrim(p_title),'currency',p_currency_code,'status',p_status,'items',p_items,'expectedRevision',p_expected_revision);
  INSERT INTO public.business_development_command_requests(actor_id,operation,client_request_id,request_payload)
    VALUES(v_actor,'estimate.save',p_client_request_id,v_payload)ON CONFLICT(actor_id,operation,client_request_id)DO NOTHING;
  SELECT*INTO v_request FROM public.business_development_command_requests WHERE actor_id=v_actor AND operation='estimate.save'AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION'BUSINESS_DEVELOPMENT_IDEMPOTENCY_CONFLICT'USING ERRCODE='22023';END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||jsonb_build_object('idempotentReplay',true);END IF;
  IF p_expected_revision=0 THEN INSERT INTO public.delivery_estimates(id,organization_id,opportunity_id,estimate_number,title,currency_code,status,created_by,updated_by)
    VALUES(p_estimate_id,p_organization_id,p_opportunity_id,upper(btrim(p_estimate_number)),btrim(p_title),p_currency_code,p_status,v_actor,v_actor)RETURNING*INTO v_row;
  ELSE UPDATE public.delivery_estimates SET opportunity_id=p_opportunity_id,estimate_number=upper(btrim(p_estimate_number)),title=btrim(p_title),currency_code=p_currency_code,
    status=p_status,revision=revision+1,updated_by=v_actor,updated_at=now()WHERE id=p_estimate_id AND organization_id=p_organization_id AND revision=p_expected_revision RETURNING*INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION'DELIVERY_ESTIMATE_REVISION_CONFLICT'USING ERRCODE='40001';END IF;
    DELETE FROM public.delivery_estimate_items WHERE estimate_id=p_estimate_id;
  END IF;
  INSERT INTO public.delivery_estimate_items(id,organization_id,estimate_id,category,description,discipline,employee_grade,supplier_name,quantity,unit,unit_cost_rate,note,sort_order)
  SELECT (item->>'itemId')::uuid,p_organization_id,p_estimate_id,item->>'category',btrim(item->>'description'),NULLIF(btrim(COALESCE(item->>'discipline','')),''),
    NULLIF(btrim(COALESCE(item->>'employeeGrade','')),''),NULLIF(btrim(COALESCE(item->>'supplierName','')),''),(item->>'quantity')::numeric,btrim(item->>'unit'),
    (item->>'unitCostRate')::numeric,NULLIF(btrim(COALESCE(item->>'note','')),''),ordinality::integer
  FROM jsonb_array_elements(p_items)WITH ORDINALITY AS source(item,ordinality);
  SELECT COALESCE(sum(amount),0)INTO v_total FROM public.delivery_estimate_items WHERE estimate_id=p_estimate_id;
  v_result:=jsonb_build_object('estimateId',v_row.id,'revision',v_row.revision,'status',v_row.status,'estimatedDeliveryCost',v_total);
  INSERT INTO public.business_development_events(organization_id,opportunity_id,estimate_id,event_type,revision,snapshot,actor_id,client_request_id)
    VALUES(p_organization_id,p_opportunity_id,v_row.id,CASE WHEN p_expected_revision=0 THEN'ESTIMATE_CREATED'ELSE'ESTIMATE_UPDATED'END,v_row.revision,
      jsonb_build_object('estimate',to_jsonb(v_row),'items',p_items,'estimatedDeliveryCost',v_total),v_actor,p_client_request_id);
  UPDATE public.business_development_command_requests SET response=v_result,completed_at=now()WHERE id=v_request.id;
  RETURN v_result||jsonb_build_object('idempotentReplay',false);
END$$;

ALTER TABLE public.commercial_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_estimate_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_development_command_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_development_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_opportunities,public.delivery_estimates,public.delivery_estimate_items,
  public.business_development_command_requests,public.business_development_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.business_development_command_requests_id_seq,
  public.business_development_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.business_development_events_immutable(),private.require_business_development_writer(uuid,text),
  private.business_development_workspace_json(uuid),public.get_business_development_workspace(uuid),
  public.save_commercial_opportunity(uuid,uuid,text,text,text,text,text,integer,uuid),
  public.save_delivery_estimate(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_business_development_workspace(uuid),
  public.save_commercial_opportunity(uuid,uuid,text,text,text,text,text,integer,uuid),
  public.save_delivery_estimate(uuid,uuid,uuid,text,text,text,text,jsonb,integer,uuid)TO authenticated;

COMMIT;
