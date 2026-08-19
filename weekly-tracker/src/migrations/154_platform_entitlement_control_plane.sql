-- 154_platform_entitlement_control_plane.sql
-- Phase 2/5 bridge: Platform Superadmin read models and audited, idempotent
-- commands for organization status, subscriptions and entitlement overrides.

BEGIN;

CREATE TABLE public.platform_entitlement_change_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK(event_type IN(
    'ORGANIZATION_STATUS_CHANGED','SUBSCRIPTION_CHANGED','ENTITLEMENT_CHANGED'
  )),
  capability_id text REFERENCES public.product_capability_catalog(id) ON DELETE RESTRICT,
  entitlement_source text,
  previous_data jsonb,
  new_data jsonb NOT NULL CHECK(jsonb_typeof(new_data)='object'),
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(changed_by,client_request_id)
);

CREATE INDEX platform_entitlement_events_org_time_idx
  ON public.platform_entitlement_change_events(organization_id,changed_at DESC,id DESC);

CREATE TABLE public.platform_entitlement_command_requests(
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  command_type text NOT NULL,
  request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY(actor_id,client_request_id)
);

CREATE OR REPLACE FUNCTION private.prevent_platform_entitlement_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'PLATFORM_ENTITLEMENT_EVENT_IMMUTABLE' USING ERRCODE='55000';
END;
$$;

CREATE TRIGGER platform_entitlement_change_events_immutable
BEFORE UPDATE OR DELETE ON public.platform_entitlement_change_events
FOR EACH ROW EXECUTE FUNCTION private.prevent_platform_entitlement_event_mutation();

CREATE OR REPLACE FUNCTION private.require_platform_superadmin()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_user_id uuid:=auth.uid();
BEGIN
  IF v_user_id IS NULL OR private.is_platform_superadmin(v_user_id)IS NOT TRUE THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_platform_organizations()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
BEGIN
  PERFORM private.require_platform_superadmin();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'organizationId',organization_row.id,
      'name',organization_row.name,
      'status',organization_row.status,
      'legacyCompanyId',organization_row.legacy_company_id,
      'planId',subscription.plan_id,
      'subscriptionStatus',subscription.status,
      'activeUsers',(SELECT count(*) FROM public.organization_memberships membership
        WHERE membership.organization_id=organization_row.id AND membership.status='ACTIVE'),
      'projects',(SELECT count(*) FROM public.projects project
        WHERE project.organization_id=organization_row.id),
      'updatedAt',organization_row.updated_at
    )ORDER BY organization_row.name,organization_row.id)
    FROM public.organizations organization_row
    LEFT JOIN public.organization_subscriptions subscription
      ON subscription.organization_id=organization_row.id
  ),'[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM private.require_platform_superadmin();
  SELECT jsonb_build_object(
    'organization',to_jsonb(organization_row),
    'subscription',CASE WHEN subscription.organization_id IS NULL THEN NULL ELSE to_jsonb(subscription)END,
    'entitlements',COALESCE((SELECT jsonb_agg(to_jsonb(entitlement)
      ORDER BY entitlement.capability_id,entitlement.source)
      FROM public.organization_entitlements entitlement
      WHERE entitlement.organization_id=organization_row.id),'[]'::jsonb),
    'effective',public.get_effective_organization_entitlements(organization_row.id,now()),
    'adminUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId',membership.user_id,'name',profile.name,'email',profile.email,
      'status',membership.status
    )ORDER BY profile.name,profile.email)
      FROM public.organization_memberships membership
      JOIN public.profiles profile ON profile.id=membership.user_id
      WHERE membership.organization_id=organization_row.id
        AND membership.organization_role='ORG_ADMIN'),'[]'::jsonb)
  ) INTO v_result
  FROM public.organizations organization_row
  LEFT JOIN public.organization_subscriptions subscription
    ON subscription.organization_id=organization_row.id
  WHERE organization_row.id=p_organization_id;
  IF v_result IS NULL THEN RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_organization_status(
  p_organization_id uuid,p_status text,p_expected_status text,p_client_request_id uuid
)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_actor uuid:=private.require_platform_superadmin();
  v_request public.platform_entitlement_command_requests%ROWTYPE;
  v_before public.organizations%ROWTYPE;
  v_payload jsonb;
  v_result jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_client_request_id IS NULL
    OR p_status NOT IN('ACTIVE','SUSPENDED')
    OR p_expected_status NOT IN('ACTIVE','SUSPENDED') THEN
    RAISE EXCEPTION 'INVALID_PLATFORM_ORGANIZATION_STATUS_COMMAND' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('status',p_status,'expectedStatus',p_expected_status);
  INSERT INTO public.platform_entitlement_command_requests(
    actor_id,client_request_id,organization_id,command_type,request_payload
  )VALUES(v_actor,p_client_request_id,p_organization_id,'SET_ORGANIZATION_STATUS',v_payload)
  ON CONFLICT(actor_id,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.platform_entitlement_command_requests
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.organization_id<>p_organization_id OR v_request.command_type<>'SET_ORGANIZATION_STATUS'
    OR v_request.request_payload<>v_payload THEN
    RAISE EXCEPTION 'PLATFORM_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||'{"idempotentReplay":true}'::jsonb;END IF;
  SELECT * INTO v_before FROM public.organizations WHERE id=p_organization_id FOR UPDATE;
  IF v_before.id IS NULL THEN RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF v_before.status<>p_expected_status THEN
    RAISE EXCEPTION 'ORGANIZATION_STATUS_CONFLICT' USING ERRCODE='40001';
  END IF;
  UPDATE public.organizations SET status=p_status,updated_at=now() WHERE id=p_organization_id;
  v_result:=jsonb_build_object('organizationId',p_organization_id,'status',p_status);
  INSERT INTO public.platform_entitlement_change_events(
    organization_id,event_type,previous_data,new_data,changed_by,client_request_id
  )VALUES(p_organization_id,'ORGANIZATION_STATUS_CHANGED',to_jsonb(v_before),v_result,v_actor,p_client_request_id);
  UPDATE public.platform_entitlement_command_requests SET response=v_result,completed_at=now()
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id;
  RETURN v_result||'{"idempotentReplay":false}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_organization_subscription(
  p_organization_id uuid,p_plan_id text,p_status text,p_starts_at timestamptz,
  p_ends_at timestamptz,p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_actor uuid:=private.require_platform_superadmin();
  v_request public.platform_entitlement_command_requests%ROWTYPE;
  v_before public.organization_subscriptions%ROWTYPE;
  v_payload jsonb;
  v_result jsonb;
  v_revision integer;
BEGIN
  IF p_organization_id IS NULL OR p_client_request_id IS NULL OR p_plan_id IS NULL
    OR p_status NOT IN('ACTIVE','TRIAL','SUSPENDED','CANCELLED')
    OR p_starts_at IS NULL OR(p_ends_at IS NOT NULL AND p_ends_at<=p_starts_at)
    OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RAISE EXCEPTION 'INVALID_PLATFORM_SUBSCRIPTION_COMMAND' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('planId',p_plan_id,'status',p_status,'startsAt',p_starts_at,
    'endsAt',p_ends_at,'expectedRevision',p_expected_revision);
  INSERT INTO public.platform_entitlement_command_requests(
    actor_id,client_request_id,organization_id,command_type,request_payload
  )VALUES(v_actor,p_client_request_id,p_organization_id,'SET_SUBSCRIPTION',v_payload)
  ON CONFLICT(actor_id,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.platform_entitlement_command_requests
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.organization_id<>p_organization_id OR v_request.command_type<>'SET_SUBSCRIPTION'
    OR v_request.request_payload<>v_payload THEN
    RAISE EXCEPTION 'PLATFORM_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||'{"idempotentReplay":true}'::jsonb;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE id=p_plan_id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_PLAN_NOT_AVAILABLE' USING ERRCODE='23503';END IF;
  SELECT * INTO v_before FROM public.organization_subscriptions
  WHERE organization_id=p_organization_id FOR UPDATE;
  IF(v_before.organization_id IS NULL AND p_expected_revision<>0)
    OR(v_before.organization_id IS NOT NULL AND v_before.revision<>p_expected_revision)THEN
    RAISE EXCEPTION 'SUBSCRIPTION_REVISION_CONFLICT' USING ERRCODE='40001';
  END IF;
  v_revision:=CASE WHEN v_before.organization_id IS NULL THEN 1 ELSE v_before.revision+1 END;
  INSERT INTO public.organization_subscriptions(
    organization_id,plan_id,status,starts_at,ends_at,revision,created_by,updated_at
  )VALUES(p_organization_id,p_plan_id,p_status,p_starts_at,p_ends_at,v_revision,v_actor,now())
  ON CONFLICT(organization_id)DO UPDATE SET plan_id=EXCLUDED.plan_id,status=EXCLUDED.status,
    starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,revision=EXCLUDED.revision,
    updated_at=now();
  SELECT jsonb_build_object('organizationId',organization_id,'planId',plan_id,'status',status,
    'startsAt',starts_at,'endsAt',ends_at,'revision',revision)
  INTO v_result FROM public.organization_subscriptions WHERE organization_id=p_organization_id;
  INSERT INTO public.platform_entitlement_change_events(
    organization_id,event_type,previous_data,new_data,changed_by,client_request_id
  )VALUES(p_organization_id,'SUBSCRIPTION_CHANGED',CASE WHEN v_before.organization_id IS NULL THEN NULL ELSE to_jsonb(v_before)END,
    v_result,v_actor,p_client_request_id);
  UPDATE public.platform_entitlement_command_requests SET response=v_result,completed_at=now()
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id;
  RETURN v_result||'{"idempotentReplay":false}'::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_organization_entitlement(
  p_organization_id uuid,p_capability_id text,p_source text,p_enabled boolean,
  p_config jsonb,p_starts_at timestamptz,p_expires_at timestamptz,
  p_expected_revision integer,p_client_request_id uuid
)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_actor uuid:=private.require_platform_superadmin();
  v_request public.platform_entitlement_command_requests%ROWTYPE;
  v_before public.organization_entitlements%ROWTYPE;
  v_payload jsonb;
  v_result jsonb;
  v_revision integer;
BEGIN
  IF p_organization_id IS NULL OR p_client_request_id IS NULL OR p_capability_id IS NULL
    OR p_source NOT IN('plan','manual_override','trial','enterprise_contract')
    OR p_enabled IS NULL OR jsonb_typeof(COALESCE(p_config,'null'::jsonb))<>'object'
    OR p_starts_at IS NULL OR(p_expires_at IS NOT NULL AND p_expires_at<=p_starts_at)
    OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RAISE EXCEPTION 'INVALID_PLATFORM_ENTITLEMENT_COMMAND' USING ERRCODE='22023';
  END IF;
  v_payload:=jsonb_build_object('capabilityId',p_capability_id,'source',p_source,'enabled',p_enabled,
    'config',p_config,'startsAt',p_starts_at,'expiresAt',p_expires_at,'expectedRevision',p_expected_revision);
  INSERT INTO public.platform_entitlement_command_requests(
    actor_id,client_request_id,organization_id,command_type,request_payload
  )VALUES(v_actor,p_client_request_id,p_organization_id,'SET_ENTITLEMENT',v_payload)
  ON CONFLICT(actor_id,client_request_id)DO NOTHING;
  SELECT * INTO v_request FROM public.platform_entitlement_command_requests
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id FOR UPDATE;
  IF v_request.organization_id<>p_organization_id OR v_request.command_type<>'SET_ENTITLEMENT'
    OR v_request.request_payload<>v_payload THEN
    RAISE EXCEPTION 'PLATFORM_COMMAND_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
  END IF;
  IF v_request.response IS NOT NULL THEN RETURN v_request.response||'{"idempotentReplay":true}'::jsonb;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_organization_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_capability_catalog WHERE id=p_capability_id AND status='ACTIVE') THEN
    RAISE EXCEPTION 'CAPABILITY_NOT_AVAILABLE' USING ERRCODE='23503';END IF;
  SELECT * INTO v_before FROM public.organization_entitlements
  WHERE organization_id=p_organization_id AND capability_id=p_capability_id AND source=p_source FOR UPDATE;
  IF(v_before.organization_id IS NULL AND p_expected_revision<>0)
    OR(v_before.organization_id IS NOT NULL AND v_before.revision<>p_expected_revision)THEN
    RAISE EXCEPTION 'ENTITLEMENT_REVISION_CONFLICT' USING ERRCODE='40001';
  END IF;
  v_revision:=CASE WHEN v_before.organization_id IS NULL THEN 1 ELSE v_before.revision+1 END;
  INSERT INTO public.organization_entitlements(
    organization_id,capability_id,source,enabled,config,starts_at,expires_at,
    revision,created_by,updated_at
  )VALUES(p_organization_id,p_capability_id,p_source,p_enabled,p_config,p_starts_at,
    p_expires_at,v_revision,v_actor,now())
  ON CONFLICT(organization_id,capability_id,source)DO UPDATE SET enabled=EXCLUDED.enabled,
    config=EXCLUDED.config,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
    revision=EXCLUDED.revision,updated_at=now();
  SELECT jsonb_build_object('organizationId',organization_id,'capabilityId',capability_id,
    'source',source,'enabled',enabled,'config',config,'startsAt',starts_at,
    'expiresAt',expires_at,'revision',revision)
  INTO v_result FROM public.organization_entitlements WHERE organization_id=p_organization_id
    AND capability_id=p_capability_id AND source=p_source;
  INSERT INTO public.platform_entitlement_change_events(
    organization_id,event_type,capability_id,entitlement_source,previous_data,new_data,
    changed_by,client_request_id
  )VALUES(p_organization_id,'ENTITLEMENT_CHANGED',p_capability_id,p_source,
    CASE WHEN v_before.organization_id IS NULL THEN NULL ELSE to_jsonb(v_before)END,
    v_result,v_actor,p_client_request_id);
  UPDATE public.platform_entitlement_command_requests SET response=v_result,completed_at=now()
  WHERE actor_id=v_actor AND client_request_id=p_client_request_id;
  RETURN v_result||'{"idempotentReplay":false}'::jsonb;
END;
$$;

ALTER TABLE public.platform_entitlement_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_entitlement_command_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_entitlement_events_superadmin_read
ON public.platform_entitlement_change_events FOR SELECT TO authenticated USING(
  private.is_platform_superadmin((SELECT auth.uid()))
);

REVOKE ALL ON TABLE public.platform_entitlement_change_events,
  public.platform_entitlement_command_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.platform_entitlement_change_events TO authenticated;
REVOKE ALL ON FUNCTION private.prevent_platform_entitlement_event_mutation(),
  private.require_platform_superadmin() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_platform_organizations(),
  public.get_platform_organization(uuid),
  public.set_platform_organization_status(uuid,text,text,uuid),
  public.set_platform_organization_subscription(uuid,text,text,timestamptz,timestamptz,integer,uuid),
  public.set_platform_organization_entitlement(uuid,text,text,boolean,jsonb,timestamptz,timestamptz,integer,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_platform_organizations(),
  public.get_platform_organization(uuid),
  public.set_platform_organization_status(uuid,text,text,uuid),
  public.set_platform_organization_subscription(uuid,text,text,timestamptz,timestamptz,integer,uuid),
  public.set_platform_organization_entitlement(uuid,text,text,boolean,jsonb,timestamptz,timestamptz,integer,uuid)
  TO authenticated;

COMMIT;
