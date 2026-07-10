# Sprint 4 write-path audit

Audit date: 2026-07-10. Repository/configuration evidence only; production was not contacted.

## Operation inventory

| Operation | UI entry | Validation | Service | DB tables/RPC | Multi-step | Atomic now | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project create | Projects/editor | `projectService.validateProject` | `projectService.create` | templates read + projects insert | Yes | No | Template can change between read/insert |
| Project update/scope | Projects/editor | basic fields/dates | `projectService.update` | projects | No | Yes per row | Authorization depends on RLS |
| Project delete | Projects | ID only | `projectService.remove` | projects cascade | DB cascade | Yes | Destructive, admin policy required |
| Contractor Report | ContractorReport | form + pure submission builder | `submitReport` | `submit_contractor_report` RPC → report/WPs/history/Gantt | Yes | **Yes** | No request idempotency; client-calculated history |
| PM Site Visit | SiteVisitReport | form checks + discrepancy engine | four low-level services | visit/WPs/discrepancies/Gantt | Yes | **No** | Header/children/cache partial writes; errors suppressed |
| Legacy Site Visit | SiteVisitReport fallback | form | `siteVisitService.create` | site_visits only | No | Yes | No WP facts |
| Photo upload/link | report/visit forms | compression only | photo upload model/service | Storage then URL arrays in later submit | Yes, cross-system | No | Orphans and DB reference without file |
| Gantt generation/update | Projects/report flows | engine inputs | ganttService | tasks + projects | Yes | No | Partial batch/cache updates |
| Template mutation | Template Editor | template validator | templates API | templates | depends on API | Unverified | RLS/global-admin semantics |
| User role/assignment | AdminUsers/invite | UI checks | direct profiles/RPC invite | profiles/pending_invites | mixed | Unverified | Security-sensitive |
| Persisted operational risk | none found | N/A | none | no risk lifecycle table | No | N/A | Risks are derived/report declarations |

## Critical chains

### Contractor Report — current

`submitContractorReportModel → build payload/canonical cumulative progress → submit_contractor_report RPC → contractor_reports → contractor_report_wps → progress_history → project_gantt_tasks`.

All SQL writes are one Postgres function transaction and roll back on an exception. The report header audit trigger runs in that transaction. Duplicate project/date/actor is rejected, but a network timeout cannot replay by request identity.

### PM Site Visit — current defect

`submitSiteVisitModel → insert site_visits → insert site_visit_wps → insert site_visit_discrepancies (non-fatal) → update each Gantt task (errors swallowed)`.

Failure after header leaves a partial visit. There is no retry identity, child uniqueness, progress-history source link or atomic audit guarantee beyond the header trigger.

### Photos

`compress → upload private object → retain object path in form → later report/visit SQL stores path`. SQL and Storage cannot share a transaction. Upload retry can create an orphan; failed upload leaves no DB row, while later missing object is tolerated by signed-URL code.

## Database functions/RPC

| Function/RPC | Migration | Security | Inputs/writes | Transactional | Consumers |
| --- | --- | --- | --- | --- | --- |
| `submit_contractor_report` | 018, superseded by 023 | DEFINER, `search_path=public`, auth/role/company/project checks, execute only authenticated | reports, WPs, history, Gantt | Yes | contractor report service |
| access helpers | 020–022 | DEFINER, fixed search path | authorization reads | N/A | RLS/RPC |
| `invite_contractor` | 012/020/021 | DEFINER, fixed search path | profiles/invites/auth data | Yes | invite service |
| `fn_audit_log` | 015, hardened 020 | DEFINER | audit_log trigger writes | Same caller transaction | projects/reports/visits triggers |

## Table write map

| Table | Writer | Related records | RLS | Trigger/RPC | Audit |
| --- | --- | --- | --- | --- | --- |
| projects | project service/Gantt service | tasks/history/reports | enabled, company-aware | direct | trigger, excluding Gantt-only diffs |
| contractor_reports | atomic RPC | WPs/history | enabled | RPC | header trigger |
| contractor_report_wps | atomic RPC | report/project | enabled | RPC | no child trigger |
| progress_history | contractor RPC | source report in JSON | enabled | RPC | no trigger |
| site_visits | site visit service | WPs/discrepancies | enabled | direct inserts | header trigger |
| site_visit_wps | site visit service | visit/project | enabled | direct insert | no trigger |
| site_visit_discrepancies | site visit service | visit/project | enabled | direct insert | no trigger |
| project_gantt_tasks | Gantt/site visit/report services | project/WP | enabled | direct/RPC | no audit |
| audit_log | trigger only | source row | enabled | DEFINER trigger | itself |

## Storage and version inventory

- Bucket `site-photos`, private, 5 MB; JPEG/PNG/WebP/HEIC.
- Current path: `{project_id}/{year-month}/{user_id}_{timestamp}_{seq}.jpg`.
- Migration 020 scopes read/upload/delete through project access and filename actor ownership.
- Signed URLs are used. No pending/finalized metadata, orphan registry or cleanup command exists.
- Contractor history snapshot has source IDs and raw payload, but no stable schema/calculation version, organization/actor metadata or request ID.
- Historical discrepancy sign is PM minus contractor and has no persisted convention/version.
- No operational persisted-risk lifecycle exists.

