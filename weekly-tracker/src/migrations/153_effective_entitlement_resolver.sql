-- 153_effective_entitlement_resolver.sql
-- Phase 5A: one server-owned effective entitlement resolver and enforcement
-- primitive. Existing routes are not gated until subscriptions are assigned.

BEGIN;

CREATE OR REPLACE FUNCTION private.resolve_effective_organization_entitlements(
  p_organization_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE(
  capability_id text,
  enabled boolean,
  source text,
  config jsonb,
  expires_at timestamptz,
  disabled_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE active_subscription AS(
    SELECT subscription.organization_id,subscription.plan_id,subscription.ends_at
    FROM public.organization_subscriptions subscription
    JOIN public.organizations organization_row
      ON organization_row.id=subscription.organization_id
      AND organization_row.status='ACTIVE'
    WHERE subscription.organization_id=p_organization_id
      AND subscription.status IN('ACTIVE','TRIAL')
      AND subscription.starts_at<=p_at
      AND(subscription.ends_at IS NULL OR subscription.ends_at>p_at)
  ),
  plan_defaults AS(
    SELECT plan_capability.capability_id,plan_capability.default_config,
      subscription.ends_at
    FROM active_subscription subscription
    JOIN public.plan_capabilities plan_capability
      ON plan_capability.plan_id=subscription.plan_id AND plan_capability.enabled
  ),
  candidates AS(
    SELECT plan_default.capability_id,true AS enabled,'plan'::text AS source,
      100::smallint AS source_priority,0 AS record_priority,
      plan_default.default_config AS candidate_config,
      plan_default.ends_at AS candidate_expires_at
    FROM plan_defaults plan_default
    UNION ALL
    SELECT entitlement.capability_id,entitlement.enabled,entitlement.source,
      entitlement.source_priority,1 AS record_priority,
      entitlement.config AS candidate_config,
      CASE
        WHEN entitlement.expires_at IS NULL THEN subscription.ends_at
        WHEN subscription.ends_at IS NULL THEN entitlement.expires_at
        ELSE LEAST(entitlement.expires_at,subscription.ends_at)
      END AS candidate_expires_at
    FROM active_subscription subscription
    JOIN public.organization_entitlements entitlement
      ON entitlement.organization_id=subscription.organization_id
      AND entitlement.starts_at<=p_at
      AND(entitlement.expires_at IS NULL OR entitlement.expires_at>p_at)
  ),
  ranked AS(
    SELECT candidate.*,
      row_number()OVER(
        PARTITION BY candidate.capability_id
        ORDER BY candidate.source_priority DESC,candidate.record_priority DESC
      ) AS precedence_rank
    FROM candidates candidate
  ),
  selected AS(
    SELECT ranked.capability_id,ranked.enabled,ranked.source,
      COALESCE(plan_default.default_config,'{}'::jsonb)||ranked.candidate_config AS config,
      ranked.candidate_expires_at AS expires_at
    FROM ranked
    LEFT JOIN plan_defaults plan_default
      ON plan_default.capability_id=ranked.capability_id
    WHERE ranked.precedence_rank=1
  ),
  disabled(capability_id) AS(
    SELECT seed.capability_id FROM(
      SELECT selected_row.capability_id
      FROM selected selected_row WHERE NOT selected_row.enabled
      UNION
      SELECT dependency.capability_id
      FROM public.product_capability_dependencies dependency
      JOIN selected selected_row ON selected_row.capability_id=dependency.capability_id
      LEFT JOIN selected required ON required.capability_id=dependency.required_capability_id
      WHERE required.capability_id IS NULL OR NOT required.enabled
    ) seed
    UNION
    SELECT dependency.capability_id
    FROM public.product_capability_dependencies dependency
    JOIN disabled required_disabled
      ON required_disabled.capability_id=dependency.required_capability_id
    JOIN selected selected_row ON selected_row.capability_id=dependency.capability_id
  )
  SELECT selected_row.capability_id,
    selected_row.enabled AND disabled.capability_id IS NULL AS enabled,
    selected_row.source,selected_row.config,selected_row.expires_at,
    CASE
      WHEN NOT selected_row.enabled THEN 'EXPLICITLY_DISABLED'
      WHEN disabled.capability_id IS NOT NULL THEN 'DEPENDENCY_NOT_ENTITLED'
      ELSE NULL
    END AS disabled_reason
  FROM selected selected_row
  LEFT JOIN disabled ON disabled.capability_id=selected_row.capability_id
  ORDER BY selected_row.capability_id;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_organization_entitlements(
  p_organization_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid:=auth.uid();
  v_subscription public.organization_subscriptions%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';
  END IF;
  IF private.is_platform_superadmin(v_user_id)IS NOT TRUE
    AND private.has_active_organization_membership(
      p_organization_id,v_user_id,NULL
    )IS NOT TRUE THEN
    RAISE EXCEPTION 'ORGANIZATION_ENTITLEMENT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_subscription FROM public.organization_subscriptions
  WHERE organization_id=p_organization_id;
  RETURN jsonb_build_object(
    'organizationId',p_organization_id,
    'resolvedAt',p_at,
    'subscription',CASE WHEN v_subscription.organization_id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'planId',v_subscription.plan_id,'status',v_subscription.status,
        'startsAt',v_subscription.starts_at,'endsAt',v_subscription.ends_at,
        'revision',v_subscription.revision
      )END,
    'capabilities',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'capabilityId',resolved.capability_id,'enabled',resolved.enabled,
        'source',resolved.source,'config',resolved.config,
        'expiresAt',resolved.expires_at,'disabledReason',resolved.disabled_reason
      )ORDER BY resolved.capability_id)
      FROM private.resolve_effective_organization_entitlements(
        p_organization_id,p_at
      ) resolved
    ),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_organization_capability(
  p_organization_id uuid,
  p_capability_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid:=auth.uid();
BEGIN
  IF v_user_id IS NULL OR p_organization_id IS NULL OR p_capability_id IS NULL THEN
    RETURN false;
  END IF;
  IF private.is_platform_superadmin(v_user_id)IS NOT TRUE
    AND private.has_active_organization_membership(
      p_organization_id,v_user_id,NULL
    )IS NOT TRUE THEN RETURN false;END IF;
  RETURN EXISTS(
    SELECT 1 FROM private.resolve_effective_organization_entitlements(
      p_organization_id,p_at
    ) resolved
    WHERE resolved.capability_id=p_capability_id AND resolved.enabled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.require_organization_capability(
  p_organization_id uuid,
  p_capability_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000';
  END IF;
  IF public.has_organization_capability(
    p_organization_id,p_capability_id,p_at
  )IS NOT TRUE THEN
    RAISE EXCEPTION 'FEATURE_NOT_ENTITLED' USING ERRCODE='42501',
      DETAIL=p_capability_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  private.resolve_effective_organization_entitlements(uuid,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.get_effective_organization_entitlements(uuid,timestamptz),
  public.has_organization_capability(uuid,text,timestamptz),
  public.require_organization_capability(uuid,text,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.get_effective_organization_entitlements(uuid,timestamptz),
  public.has_organization_capability(uuid,text,timestamptz),
  public.require_organization_capability(uuid,text,timestamptz)
  TO authenticated;

DO $effective_entitlement_resolver_assertions$
BEGIN
  IF has_function_privilege(
      'authenticated',
      'private.resolve_effective_organization_entitlements(uuid,timestamptz)',
      'EXECUTE'
    ) OR has_function_privilege(
      'anon','public.require_organization_capability(uuid,text,timestamptz)',
      'EXECUTE'
    ) OR NOT has_function_privilege(
      'authenticated','public.require_organization_capability(uuid,text,timestamptz)',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'EFFECTIVE_ENTITLEMENT_RESOLVER_ACL_MISMATCH';
  END IF;
END
$effective_entitlement_resolver_assertions$;

COMMIT;
