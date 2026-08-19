# Platform entitlement control plane

Migration 154 provides the protected server boundary used by the future `/platform-admin` interface. It does not grant customer administrators the ability to change commercial access.

Platform Superadmins can:

- list organizations with plan, user and project summaries;
- inspect subscription, overrides, effective capabilities and organization administrators;
- activate or suspend an organization;
- create or revise its subscription;
- create or revise a sourced capability override.

Every mutation requires a client request ID. Repeating the same request returns the stored response without creating a second event. Reusing the ID for a different payload is rejected. Subscription and entitlement updates use expected revisions to prevent silent overwrites.

Direct writes remain unavailable to API roles. Commands execute on the server, verify `PLATFORM_SUPERADMIN`, validate inputs and append an immutable audit event.
