# Organization / Tenant Foundation

## Status

Migration 149 introduces the additive Phase 1A foundation for the
Multi-Company / Workspaces / Entitlements roadmap. It does not enable plans,
paid entitlements, workspace selection, billing, or a Platform Admin UI.

## Canonical concepts

- `organizations` owns the SaaS tenant identity and lifecycle status.
- `organization_memberships` connects a user to an organization and keeps
  customer administration roles separate from project roles.
- `platform_user_roles` contains OpenDay operator roles. A
  `PLATFORM_SUPERADMIN` is not a customer organization role and is not a
  Project Team role.
- `project_capability_catalog` remains project authorization. It must never be
  reused as the future catalog of commercial subscription entitlements.

## Compatibility boundary

The deployed application still uses `company_id` in established project,
template, import, ontology and audit workflows. Migration 149 therefore adds
`organization_id` beside it and enforces exact parity with a private trigger.
Existing non-null company identities are converted into Organizations and
profile assignments are converted into Organization memberships.

The compatibility bridge is deliberately temporary but authoritative while
it exists:

1. a legacy write with `company_id` resolves `organization_id`;
2. a future write with `organization_id` resolves the legacy key;
3. conflicting values fail closed;
4. unknown company or organization identities fail closed;
5. null remains reserved for legacy global catalog records and explicitly
   unscoped legacy data until the later cutover certifies every owner.

No existing Project Team, Tender, BOQ, Budget or Commercial calculation is
changed by Phase 1A.

## Access boundary

Organization records are readable only by an active member or a platform
superadmin. Membership records are readable by the member, an active
Organization Admin in the same organization, or a platform superadmin.
Browser roles cannot directly insert, update or delete tenant records.

`get_my_organization_context()` is the only new public RPC. It requires an
authenticated identity and returns only that caller's active memberships.
Internal tenant helpers remain in the unexposed `private` schema. The
authenticated role can execute only the helpers required by RLS policy
evaluation; they are not available as public Data API RPCs.

## Next Phase 1 package

Phase 1B should cut the existing authorization helpers from implicit
`profiles.company_id` checks to the canonical Organization membership and
`projects.organization_id` boundary. It must include negative certification
for cross-organization read, insert, update, delete and manipulated project
identifiers before the compatibility bridge can be retired.

Only after that cutover is stable should OpenDay add the capability catalog,
plans, organization entitlements, entitlement resolver, Platform Admin UI,
or dynamic workspace navigation.
