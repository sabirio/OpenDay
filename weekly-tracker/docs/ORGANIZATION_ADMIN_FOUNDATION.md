# Organization Admin Foundation

Migration `155_organization_admin_foundation.sql` implements Phase 6A of the
multi-company roadmap.

## Authority boundary

- `ORG_ADMIN` is an organization membership role, not a Platform role.
- Organization Admin can list, invite, edit, and deactivate employees only
  inside an organization where that actor has an active `ORG_ADMIN`
  membership.
- Organization Admin cannot alter plans, billing, or commercial entitlements.
- Direct client writes to memberships, invitations, command requests, and
  audit events remain closed. Browser writes use audited Security Definer RPCs.

## Canonical model

`organization_memberships` owns the organization role, operational access
role, job role, status, primary membership marker, and optimistic revision.
The existing `profiles` role fields remain a compatibility projection for a
user's primary organization while older product modules are migrated.

Employee invitations are stored in `organization_user_invitations`. The
server-side `send-organization-invitation` function prepares the invitation,
creates a one-time Supabase Auth link, sends a branded email, and records the
delivery event. On sign-in, `activate_my_organization_invitations()` accepts
unexpired invitations whose normalized email equals the authenticated Auth
identity.

Project membership and responsibility scope are deliberately not edited from
Users. They remain owned by each project's Team workflow.

## Safety and certification

- tenant isolation and negative cross-organization tests;
- idempotent commands and optimistic revision conflicts;
- self-deactivation and last-admin protection;
- immutable invitation/member audit events;
- service-role-only email delivery acknowledgement;
- hash-pinned local application and migration-ledger registration;
- Playwright coverage for Org Admin and ordinary member route behavior.

This migration is local-only until an owner-approved release package is built
and applied separately to Staging and Production.
