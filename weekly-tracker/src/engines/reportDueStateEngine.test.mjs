// reportDueStateEngine.test.mjs — Simplification Phase 3D.1, Section 8/14.

import { deriveReportDueState, REPORT_DUE_STATE } from './reportDueStateEngine.js';

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}`); }
};

const APPROVED_AT = '2027-01-10T00:00:00.000Z';
const PLANNED_START = '2027-01-01T00:00:00.000Z'; // earlier than approval -> obligation start = APPROVED_AT

console.log('\nCONTRACTOR_MANAGED: not committed -> always NOT_YET_DUE, regardless of reports');
{
  check('NOT_YET_COMMITTED, no report -> NOT_YET_DUE',
    deriveReportDueState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'NOT_YET_COMMITTED', referenceDate: '2030-01-01' }) === REPORT_DUE_STATE.NOT_YET_DUE);
  check('PROPOSED, no report -> NOT_YET_DUE',
    deriveReportDueState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'PROPOSED', referenceDate: '2030-01-01' }) === REPORT_DUE_STATE.NOT_YET_DUE);
}

console.log('\nCONTRACTOR_MANAGED, COMMITTED: obligation-start boundary (late approval after planned start)');
{
  check('day before obligation start -> NOT_YET_DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      referenceDate: '2027-01-09T00:00:00.000Z',
    }) === REPORT_DUE_STATE.NOT_YET_DUE);

  check('obligation start day itself, no report -> DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      referenceDate: APPROVED_AT,
    }) === REPORT_DUE_STATE.DUE);
}

console.log('\nCONTRACTOR_MANAGED, COMMITTED: day-7 / day-8 elapsed boundary (no report yet)');
{
  check('day 7 elapsed, no report -> DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      referenceDate: '2027-01-17T00:00:00.000Z', // +7 days
    }) === REPORT_DUE_STATE.DUE);

  check('day 8 elapsed, no report -> OVERDUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      referenceDate: '2027-01-18T00:00:00.000Z', // +8 days
    }) === REPORT_DUE_STATE.OVERDUE);
}

console.log('\nCONTRACTOR_MANAGED, COMMITTED: report freshness boundary');
{
  check('fresh report (0 days old) -> RECEIVED',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      latestReport: { reportingDate: '2027-02-01T00:00:00.000Z' },
      referenceDate: '2027-02-01T00:00:00.000Z',
    }) === REPORT_DUE_STATE.RECEIVED);

  check('report exactly 7 days old -> RECEIVED',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      latestReport: { reportingDate: '2027-02-01T00:00:00.000Z' },
      referenceDate: '2027-02-08T00:00:00.000Z',
    }) === REPORT_DUE_STATE.RECEIVED);

  check('report older than 7 days (8 days) -> OVERDUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: APPROVED_AT, firstCommittedPlannedStart: PLANNED_START,
      latestReport: { reportingDate: '2027-02-01T00:00:00.000Z' },
      referenceDate: '2027-02-09T00:00:00.000Z',
    }) === REPORT_DUE_STATE.OVERDUE);
}

console.log('\nCONTRACTOR_MANAGED, COMMITTED: obligation-start = max(approval, planned start), both directions');
{
  // Late baseline approval AFTER first planned start (approval is later) ->
  // obligation starts at approval, not backdated to the plan's own start.
  check('late approval after planned start: day before approval -> NOT_YET_DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: '2027-03-10T00:00:00.000Z',
      firstCommittedPlannedStart: '2027-03-01T00:00:00.000Z',
      referenceDate: '2027-03-09T00:00:00.000Z',
    }) === REPORT_DUE_STATE.NOT_YET_DUE);
  check('late approval after planned start: approval day -> DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: '2027-03-10T00:00:00.000Z',
      firstCommittedPlannedStart: '2027-03-01T00:00:00.000Z',
      referenceDate: '2027-03-10T00:00:00.000Z',
    }) === REPORT_DUE_STATE.DUE);

  // Planned start in the FUTURE relative to approval -> obligation waits
  // for committed execution to actually begin, not the approval date.
  check('future first planned start: day before planned start -> NOT_YET_DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: '2027-04-01T00:00:00.000Z',
      firstCommittedPlannedStart: '2027-04-15T00:00:00.000Z',
      referenceDate: '2027-04-14T00:00:00.000Z',
    }) === REPORT_DUE_STATE.NOT_YET_DUE);
  check('future first planned start: planned start day -> DUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED',
      commitmentEstablishedAt: '2027-04-01T00:00:00.000Z',
      firstCommittedPlannedStart: '2027-04-15T00:00:00.000Z',
      referenceDate: '2027-04-15T00:00:00.000Z',
    }) === REPORT_DUE_STATE.DUE);
}

console.log('\nCONTRACTOR_MANAGED, COMMITTED: fail-safe when obligation timestamps are absent');
{
  check('COMMITTED but no timestamps at all -> NOT_YET_DUE (never fabricate "now" as obligation start)',
    deriveReportDueState({ scheduleOwnershipMode: 'CONTRACTOR_MANAGED', commitmentState: 'COMMITTED', referenceDate: '2030-01-01' }) === REPORT_DUE_STATE.NOT_YET_DUE);
}

console.log('\nAUTO_GENERATED: preserves pre-3D.1 isMissingReport() behavior exactly (legacy branch)');
{
  check('no report at all -> OVERDUE (no grace period, matches old unconditional true)',
    deriveReportDueState({ scheduleOwnershipMode: 'AUTO_GENERATED', commitmentState: 'COMMITTED', referenceDate: '2027-01-01' }) === REPORT_DUE_STATE.OVERDUE);
  check('report 7 days old -> RECEIVED',
    deriveReportDueState({
      scheduleOwnershipMode: 'AUTO_GENERATED', commitmentState: 'COMMITTED',
      latestReport: { reportingDate: '2027-01-01T00:00:00.000Z' },
      referenceDate: '2027-01-08T00:00:00.000Z',
    }) === REPORT_DUE_STATE.RECEIVED);
  check('report 8 days old -> OVERDUE',
    deriveReportDueState({
      scheduleOwnershipMode: 'AUTO_GENERATED', commitmentState: 'COMMITTED',
      latestReport: { reportingDate: '2027-01-01T00:00:00.000Z' },
      referenceDate: '2027-01-09T00:00:00.000Z',
    }) === REPORT_DUE_STATE.OVERDUE);
  check('brand-new AUTO_GENERATED project, zero elapsed time, no report -> OVERDUE (matches legacy, not DUE)',
    deriveReportDueState({ scheduleOwnershipMode: 'AUTO_GENERATED', commitmentState: 'COMMITTED', referenceDate: '2027-01-01' }) === REPORT_DUE_STATE.OVERDUE);
}

console.log('\nDefensive defaults');
{
  check('missing scheduleOwnershipMode -> falls to legacy branch (treated as AUTO_GENERATED)',
    deriveReportDueState({ commitmentState: 'COMMITTED', referenceDate: '2027-01-01' }) === REPORT_DUE_STATE.OVERDUE);
  check('latestReport uses submittedAt fallback when reportingDate absent',
    deriveReportDueState({
      scheduleOwnershipMode: 'AUTO_GENERATED', commitmentState: 'COMMITTED',
      latestReport: { submittedAt: '2027-01-01T00:00:00.000Z' },
      referenceDate: '2027-01-03T00:00:00.000Z',
    }) === REPORT_DUE_STATE.RECEIVED);
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
