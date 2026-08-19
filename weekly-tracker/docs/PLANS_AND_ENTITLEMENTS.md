# Plans and Organization Entitlements

## Status

Migration 152 establishes the Phase 4 commercial packaging model. It does not
yet enforce features in routes or application services; that belongs to the
Effective Entitlement Resolver in Phase 5.

## Model

- `subscription_plans` names reusable commercial bundles.
- `plan_capabilities` contains enabled defaults and default configuration.
- `organization_subscriptions` records the plan and commercial lifecycle for
  one Organization.
- `organization_entitlements` stores Organization-specific capability records
  with an explicit source, enabled state, config and validity window.

Plans are not application modes. Code must never use a condition such as
`plan === "design"` to expose a feature. The upcoming resolver will combine
plan defaults and Organization records into effective capabilities.

## Initial defaults

Four starting plans are available: Owner, Design, Contractor and Enterprise /
Custom. Enterprise contains all 33 active catalog capabilities. Every plan is
certified as dependency-complete; a deferred database guard rejects a plan
that enables a capability without its required dependencies.

No existing Organization is automatically assigned a plan. Commercial
assignment requires an explicit Platform Admin decision in a later package.
This prevents the migration from changing current customer access.

## Entitlement sources

The supported sources and precedence are:

1. `manual_override` — 400
2. `enterprise_contract` — 300
3. `trial` — 200
4. `plan` — 100

The precedence is stored as a generated database value and mirrored in the
pure domain model. Phase 5 will apply it together with start/expiry dates,
configuration, plan defaults and capability dependencies.

## Security boundary

Authenticated users may read plan defaults. An Organization member may read
only their Organization's subscription and entitlement records. Platform
Superadmins may read every Organization. Browser roles receive no direct
write privilege, so an Organization Admin cannot grant paid functionality.
Future writes must use an audited Platform Admin command.

## Next package

Phase 5 should implement one server-owned Effective Entitlement Resolver,
including precedence, expiry, dependency closure, limits and a stable 403
`FEATURE_NOT_ENTITLED` enforcement contract. Navigation and workspaces should
consume that prepared access state only after backend enforcement exists.
