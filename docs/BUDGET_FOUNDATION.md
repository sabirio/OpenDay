# Collaborative Departmental Budget (Roadmap E.25)

Migration 080 introduces one Draft Budget Cycle per project and a contribution
matrix at canonical Work Group level. The matrix is initialized from the
project's PM-selected technical Disciplines plus budget-only Disciplines in the
pinned Work Ontology version. Detailed BOQ
items are deliberately not the budgeting level.

The Budget matrix now renders the approved canonical hierarchy directly:
Department -> coded Discipline (`X100`) -> coded Work Group (`X100.01`). Six
Departments, twelve budget Disciplines, and 141 Work Groups are fixed in the
published ontology. Project Administration & Control is budget-selectable but
does not become a mandatory Contractor Schedule discipline. Department names
are no longer free-form taxonomy data; assignments reference the canonical
Department carried by each Discipline.

PM/Admin users can create the workspace and independently save each Work Group
amount, note and E.25 status: `NOT_STARTED`, `IN_PROGRESS`, or `SUBMITTED`.
Every row has its own optimistic revision, so contributors working on different
Work Groups do not block each other and stale edits to the same contribution are
rejected. PostgreSQL performs exact consolidation and remains the monetary source
of truth. Direct table writes are unavailable; creation and edits use atomic,
idempotent commands.

The E.25 foundation deliberately stopped before ownership and notifications;
immutable Budget Rounds (E.27), review and approval (E.28), Budget vs Tender
variance (E.29), and the approval report (E.30) remain outside it.

Migration 081 completes E.26. The Project Budget Coordinator assigns each
Discipline to a responsible department and named PM/Viewer account. Assignment
and reassignment use optimistic revisions, preserve append-only ownership
events, and generate internal notifications. Owners discover work in Budget
Inbox, acknowledge notifications, and can read or edit only contributions in
their assigned Disciplines. PM/Admin coordinators retain the full consolidated
workspace and ownership controls. Application route visibility never grants
budget data access; database assignment remains authoritative.

Migration 082 completes E.27. Each active draft identifies its sequential
`Budget Round N`. Issuing a round requires every in-scope Work Group to be
submitted and every Discipline to have an owner. PostgreSQL then creates one
atomic, immutable snapshot containing the exact labels, amounts, notes,
department and accountable owner at issue time. The working copy is locked
while the round is issued for review. A coordinator may start the next round
from those retained amounts; contribution statuses and revisions are reopened
without changing any earlier snapshot. The workspace shows round history and
deterministic total change from the prior round.

Management decisions, the Approved Budget Baseline, tender variance and
approval reporting remain separate E.28-E.30 steps.

Migration 083 completes E.28. An issued Budget Round enters Management Review.
Only an Admin acting as Regional Management may record `Revision Required` or
`Approved`, and four-eyes separation prevents the issuer from reviewing the
same round. Revision requests require a durable management comment, notify the
responsible owners, and are the only gateway to opening another Budget Round.
Approval atomically creates one immutable Approved Budget Baseline and an exact
Work Group snapshot; no later round may be opened after approval. The Approved
Budget remains distinct from awarded/committed and forecast cost.

Budget vs Tender and the self-explanatory Budget Approval Report remain E.29
and E.30 respectively.

Migration 084 completes E.29 as a read-only deterministic comparison layer.
For each immutable Tender Round, the Approved Budget Baseline is aligned only
to the canonical Work Groups in that round's pinned Tender Setup. Project
Budget Work Groups outside the Tender are excluded and reported explicitly.
The comparison supplies exact total, Discipline and Work Group variance amounts
and percentages for every submitted bidder. Missing baseline coverage, Work
Ontology mismatch, or currency mismatch disables variance with an explicit
reason; OpenDay never performs an implicit FX conversion. BOQ Item comparison
continues to use Tender line data because the approved management Budget is
intentionally held at Work Group level.

Migration 085 completes E.30. The Budget Approval Report presents proposed
total, prior-round movement, increases, decreases, changed Work Groups,
structured reason, human explanation, evidence reference, unexplained variance
and open questions. Context edits keep append-only history and are locked after
a management decision. Approval is enforced in PostgreSQL: every changed Work
Group must have reason, explanation and evidence, and no open question may
remain. Historical comparable-project metrics are explicitly marked unavailable
until the later benchmark engine exists; the report makes no fabricated
"normal range" claim.

The currently excluded disciplines remain excluded:

- Refrigeration
- Food-Service Equipment
- External & Civil Works
- Retail Technology
