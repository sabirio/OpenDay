# Organization / Tenant Foundation

## Status

Migration 149 introduces the additive Phase 1A foundation for the
Multi-Company / Workspaces / Entitlements roadmap. It does not enable plans,
paid entitlements, workspace selection, billing, or a Platform Admin UI.

Migration 150 completes the Phase 1B authorization cutover for the current
tenant-owned roots. Organization membership and `projects.organization_id`
are now the canonical access boundary; legacy `company_id` remains an input
and compatibility key, not the authorization source of truth.

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

Project access now requires the intersection of an active Organization
membership and the existing Project Team / contractor assignment rules.
Organization Admin authority comes from `organization_memberships`, while
OpenDay operator authority comes only from `platform_user_roles`. A forged
Project Team membership or project identifier in another Organization does
not create access. Suspended Organizations fail closed.

`organization_memberships.is_primary` identifies the single membership that
bridges the legacy `profiles.company_id` field. Profile company, role and
active-state changes synchronize this primary membership automatically;
moving a profile retires its prior primary access instead of leaving a hidden
cross-company permission behind. Secondary memberships remain available for
the future multi-organization selector and invitation flow.

`get_my_organization_context()` is the only new public RPC. It requires an
authenticated identity and returns only that caller's active memberships.
Internal tenant helpers remain in the unexposed `private` schema. The
authenticated role can execute only the helpers required by RLS policy
evaluation; they are not available as public Data API RPCs.

## Certification

Migration 150 certifies actual RLS behavior, not only helper return values. A
user receives Project Team membership in both certification projects but an
Organization membership in only one. Read, insert, update, delete and direct
foreign project-ID access are then proven denied for the other Organization.
The same suite proves own-Organization CRUD, primary membership synchronization
and function ACL boundaries.

## Next roadmap package

The next bounded package should define the canonical commercial Capability
Catalog and dependency graph. It must remain separate from the existing
`project_capability_catalog`, which continues to represent per-project user
authorization. Plans and Organization entitlements should follow only after
the catalog contract and dependency validation are certified.
