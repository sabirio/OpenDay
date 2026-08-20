# Workspace Model

OpenDay workspaces are task-oriented UI contexts, not separate applications
and not company-type modes. The initial registry is owned by
`src/domains/workspaces/workspaceModel.js`.

Availability is the intersection of:

1. the active organization's server-resolved effective entitlements;
2. the user's application permissions;
3. the selected workspace;
4. project context where a project-scoped surface is opened.

The sidebar consumes the prepared access state. It does not infer access from
labels such as Owner, Designer, or Contractor. Application-role wildcard
access does not bypass an organization entitlement.

The last valid organization and workspace are remembered per user in browser
storage. A stored workspace that is no longer entitled or permitted is ignored
and the first currently valid workspace is selected.

Business Development is present in the canonical registry but remains hidden
until it has a real navigable workflow. This avoids presenting an empty mode.

Organizations without an active subscription intentionally receive no product
workspace. Before capability-driven navigation is released to a live target,
Platform Admin must assign an explicit plan or subscription to every customer
organization that should keep product access. No plan is inferred from legacy
company labels.
