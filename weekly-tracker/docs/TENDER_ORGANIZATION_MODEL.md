# Tender organization identity

OpenDay Tender uses one organization-agnostic commercial relationship:

`Procuring Organization -> Tender Package -> Bidding Organizations`

The procuring organization is always copied from the Project organization and is enforced by the database. It is not inferred from a user role, email address, or plan name.

Each immutable Tender Setup revision stores every participant as a bidding-organization identity snapshot with:

- optional OpenDay `bidding_organization_id`;
- organization legal or trading name;
- tender contact email.

The organization ID is optional at issue time because an invited organization may not yet have an OpenDay account. When an accepted bidder links an OpenDay organization, the database verifies that the user is an active member of that organization and that it is not the procuring organization.

Bidder reads are tender-scoped. A bidder can read only its own organization identity; project users with `TENDER_MANAGE` can read the complete participant list. The bidder portal route is available to any authenticated customer role because tender access is determined by the invitation record, not by a hard-coded `Contractor` role.

Legacy `contractor_name` and `contractorName` values remain temporary compatibility aliases for existing awards, BOQ quantity semantics, historical facts, and older integrations. New Tender Setup and invitation UI uses `biddingOrganizationName`.
