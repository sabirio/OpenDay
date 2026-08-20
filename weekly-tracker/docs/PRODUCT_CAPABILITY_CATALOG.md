# Product Capability Catalog

## Purpose

Migration 151 defines the commercial functions OpenDay can package and sell.
It is the Phase 3 contract from the Multi-Company / Workspaces / Entitlements
roadmap. It does not enable or disable any screen yet.

## Boundary

Two similarly named concepts intentionally remain separate:

- `product_capability_catalog` — organization subscription functionality such
  as `tendering.main`, `commercial.margin` or `site.visits`;
- `project_capability_catalog` — user authority inside a particular project,
  such as `TENDER_MANAGE`, `BOQ_PREPARE` or `COMMERCIAL_APPROVE`.

Product capability ownership never grants a user permission by itself. Future
access remains the intersection of Organization entitlement, user permission,
Project membership and responsibility scope.

## Stable IDs and groups

The first catalog contains 33 stable lowercase IDs in seven business groups:
Core, Portfolio / Owner, Business Development, Delivery, Commercial,
Procurement and Add-ons. Labels can change without changing IDs. IDs are
database-immutable; retirement uses `status = RETIRED` instead of renaming or
deleting a referenced capability.

Capabilities represent meaningful business functions, not individual buttons
or exports. Optional limit shapes are stored as catalog metadata so future
plan and entitlement configuration can support limits without changing the
catalog identity.

## Dependency graph

`product_capability_dependencies` stores required capability relationships.
For example:

- `proposals.issue` requires `pricing.commercial` and `core.documents`;
- `commercial.margin` requires both `commercial.cost` and
  `commercial.revenue`;
- `site.visits` requires `construction.control`.

Foreign keys reject unknown capabilities, a check rejects self-dependency and
a deferred constraint trigger rejects direct or transitive cycles. The pure
domain helper in `capabilityGraph.js` validates the same contract and resolves
transitive dependency closure for the upcoming Plan / Entitlement package.

## Access

Authenticated users may read the product catalog and dependency graph. Browser
roles cannot write them. Future Platform Admin changes must use a dedicated,
audited server command; they must not open direct table writes.

## Next package

Phase 4 should add Plans as reusable defaults and Organization Entitlements as
the actual source of truth. It should consume this catalog, validate dependency
closure server-side and preserve enterprise/manual overrides separately from
plan defaults.
