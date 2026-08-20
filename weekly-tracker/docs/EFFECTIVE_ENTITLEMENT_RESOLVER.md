# Effective entitlement resolver

Migration 153 establishes one server-owned answer to “may this organization use this product capability?” Existing screens are not gated by this migration; enforcement can be introduced capability by capability after an organization has an explicit subscription.

## Resolution rules

1. Only an active organization with an `ACTIVE` or `TRIAL` subscription in its validity window is resolved.
2. Enabled plan capabilities provide the baseline at priority 100.
3. Active organization entitlements override the baseline by source priority: `manual_override` 400, `enterprise_contract` 300, `trial` 200, `plan` 100.
4. At equal priority, an organization entitlement wins over a plan default.
5. Configuration is a shallow merge of plan defaults and the winning override.
6. An explicit disable wins. Missing or disabled dependencies disable dependent capabilities transitively.
7. Expired subscriptions and overrides do not contribute to the result.

## Public contract

- `get_effective_organization_entitlements` returns the caller-scoped subscription and resolved capability context.
- `has_organization_capability` returns `false` when the caller lacks organization access or the capability is unavailable.
- `require_organization_capability` fails closed with SQLSTATE `42501` and message `FEATURE_NOT_ENTITLED`.

The detailed resolver remains in the `private` schema and has no execute grant for API roles. Public functions are security-definer functions with explicit grants to `authenticated` only.
