/**
 * 22-persistent-demo-scenario.spec.js
 *
 * Creates realistic, persistent demo/QA data in the Construction PM Portal.
 * All DEMO-QA records are left in the database after the run — no cleanup.
 *
 * Run with:  npm run test:e2e:demo-seed
 *
 * Generates:
 *   test-results/noryx-demo-seed-report.md
 *   test-results/noryx-demo-seed-summary.json
 */

import { test, expect } from '@playwright/test';
import { CREDENTIALS, login } from './helpers.js';
import fs from 'fs';
import path from 'path';

// ─── Tiny 1×1 PNG for photo uploads ──────────────────────────────────────────
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// ─── Date helpers ─────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ─── Module-level state (persists across serial tests in same worker) ─────────
const STATE = {
  projectIds: {}, // storeCode → UUID
  reportsCreated: 0,
  visitsCreated: 0,
  warnings: [],
  created: [],
};

// ─── Project definitions ──────────────────────────────────────────────────────
const PROJECTS = {
  healthy: {
    storeCode: 'DEMO-QA-HEALTHY-001',
    shoppingMallName: 'Noryx Store — Gallerian Stockholm',
    city: 'Stockholm',
    state: 'Stockholm County',
    street: 'Hamngatan 37',
    country: 'Sweden',
    salesMarket: 'Sweden',
    projectManager: 'Emma Lindqvist',
    generalContractor: 'Skanska AB',
    securityManager: 'Karl Bergman',
    itManager: 'Lena Holm',
    facilityManager: 'Jonas Persson',
    constructionStartDate: daysAgo(120),
    constructionEndDate: daysFromNow(60),
    targetOpeningDate: daysFromNow(180),
    projectType: 'New Opening',
    projectStatus: 'Active',
    scenario: 'Healthy — steady progress, low risk, far opening date',
    expectedRisk: 'LOW',
  },
  nearOpen: {
    storeCode: 'DEMO-QA-NEAR-OPEN-002',
    shoppingMallName: 'Noryx Store — Dubai Mall',
    city: 'Dubai',
    state: 'Dubai',
    street: 'Financial Centre Road',
    country: 'UAE',
    salesMarket: 'Middle East',
    projectManager: 'Ahmed Al-Rashid',
    generalContractor: 'Arabtec Construction LLC',
    securityManager: 'Fatima Al-Hassan',
    itManager: 'Omar Khalid',
    facilityManager: 'Yusuf Al-Mansoori',
    constructionStartDate: daysAgo(100),
    constructionEndDate: daysAgo(5),
    targetOpeningDate: daysFromNow(10),
    projectType: 'New Opening',
    projectStatus: 'Active',
    scenario: 'Near Opening Risk — T&C incomplete, 10 days to opening',
    expectedRisk: 'CRITICAL',
  },
  missing: {
    storeCode: 'DEMO-QA-MISSING-003',
    shoppingMallName: 'Noryx Store — Galeria Mokotów Warsaw',
    city: 'Warsaw',
    state: 'Masovian Voivodeship',
    street: 'ul. Wołoska 12',
    country: 'Poland',
    salesMarket: 'Poland',
    projectManager: 'Marta Kowalska',
    generalContractor: 'Skanska Polska S.A.',
    securityManager: 'Piotr Nowak',
    itManager: 'Agnieszka Wiśniewska',
    facilityManager: 'Tomasz Zielinski',
    constructionStartDate: daysAgo(110),
    constructionEndDate: daysAgo(10),
    targetOpeningDate: daysFromNow(25),
    projectType: 'New Opening',
    projectStatus: 'Active',
    scenario: 'Missing Reports — stale contractor data, 25 days to opening',
    expectedRisk: 'HIGH',
  },
  pmAhead: {
    storeCode: 'DEMO-QA-PM-AHEAD-004',
    shoppingMallName: 'Noryx Store — Amsterdam ArenA Boulevard',
    city: 'Amsterdam',
    state: 'North Holland',
    street: 'Arena Boulevard 113',
    country: 'Netherlands',
    salesMarket: 'Benelux',
    projectManager: 'Pieter van der Berg',
    generalContractor: 'BAM Construct NL',
    securityManager: 'Hanna de Vries',
    itManager: 'Dirk Smit',
    facilityManager: 'Roos Janssen',
    constructionStartDate: daysAgo(80),
    constructionEndDate: daysFromNow(30),
    targetOpeningDate: daysFromNow(75),
    projectType: 'New Opening',
    projectStatus: 'Active',
    scenario: 'PM Ahead — contractor under-reporting, PM sees more progress',
    expectedRisk: 'MEDIUM',
  },
  discrepancy: {
    storeCode: 'DEMO-QA-DISCREPANCY-005',
    shoppingMallName: 'Noryx Store — Westfield Les 4 Temps Paris',
    city: 'Paris',
    state: 'Île-de-France',
    street: '15 Parvis de La Défense',
    country: 'France',
    salesMarket: 'France',
    projectManager: 'Sophie Dubois',
    generalContractor: 'Bouygues Construction SA',
    securityManager: 'Pierre Martin',
    itManager: 'Claire Bernard',
    facilityManager: 'Nicolas Dupont',
    constructionStartDate: daysAgo(90),
    constructionEndDate: daysFromNow(15),
    targetOpeningDate: daysFromNow(45),
    projectType: 'New Opening',
    projectStatus: 'Active',
    scenario: 'Discrepancy — GC over-reports, PM observes lower progress',
    expectedRisk: 'HIGH',
  },
};

// ─── Contractor report schedules per project ──────────────────────────────────

const REPORT_SCHEDULES = {
  'DEMO-QA-HEALTHY-001': [
    {
      date: daysAgo(98),
      wps: { preconstruction: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete shop drawing approvals\n2) Finalise temporary utilities\n3) Site hoarding installation',
      weekAfter: '1) Begin demolition mobilisation\n2) Material delivery coordination\n3) Subcontractor briefings',
      comment: 'Pre-construction phase progressing as planned. Hoarding erected, site office established. All necessary permits received from mall management.',
    },
    {
      date: daysAgo(91),
      wps: { preconstruction: 'Completed', demolition: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete demolition of existing fitout\n2) Waste removal and disposal\n3) Surface preparation for new works',
      weekAfter: '1) Begin structural works\n2) MEP rough-in preparations\n3) Floor screed coordination',
      comment: 'Pre-construction phase completed successfully. Demolition commenced Monday — structural walls identified and protected. Asbestos survey clear.',
    },
    {
      date: daysAgo(77),
      wps: { demolition: 'Completed', construction: 'In Progress', mep: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Structural steel installation\n2) HVAC duct routing\n3) Electrical conduit first fix',
      weekAfter: '1) Drywall partitions\n2) Plumbing rough-in\n3) Fire alarm cabling',
      comment: 'Demolition complete — all waste cleared. Structural works and MEP rough-in progressing simultaneously. Good coordination between trades on site.',
    },
    {
      date: daysAgo(63),
      wps: { construction: 'Completed', mep: 'In Progress', finishes: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) MEP second fix\n2) Ceiling installation\n3) Wall finishes',
      weekAfter: '1) Floor finishes\n2) Lighting installation\n3) Joinery works',
      comment: 'Structural construction completed ahead of schedule. MEP rough-in 65% complete, finishes commenced. Coordination with MEP subcontractor on schedule.',
    },
    {
      date: daysAgo(49),
      wps: { mep: 'Completed', finishes: 'In Progress', equipment: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Retail displays installation\n2) Ceiling completion\n3) Floor tiles laying',
      weekAfter: '1) Lighting commissioning\n2) IT infrastructure\n3) Furniture installation',
      comment: 'MEP works completed and signed off by consultant. Finishes progressing well — floor tiles 60% complete, ceiling 75% done. Equipment deliveries on schedule.',
    },
  ],

  'DEMO-QA-NEAR-OPEN-002': [
    {
      date: daysAgo(88),
      wps: { preconstruction: 'Completed', demolition: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete demolition\n2) Structural investigation\n3) MEP pre-planning',
      weekAfter: '1) Construction works commencement\n2) MEP rough-in\n3) Material delivery',
      comment: 'Pre-construction complete. Demolition progressing — existing fitout removal 70% done. Mall cooperation on loading dock schedule confirmed.',
    },
    {
      date: daysAgo(74),
      wps: { demolition: 'Completed', construction: 'In Progress', mep: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Drywall partitions completion\n2) HVAC duct installation\n3) Electrical first fix',
      weekAfter: '1) Ceiling works\n2) Plumbing rough-in\n3) Floor preparation',
      comment: 'Demolition complete. Construction and MEP running in parallel — good progress. All structural changes approved by mall engineer.',
    },
    {
      date: daysAgo(53),
      wps: { construction: 'Completed', mep: 'Completed', finishes: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'Yes',
      additionalWorksReason: 'Design Changes',
      additionalWorksDesc: 'Client requested additional feature wall with LED lighting. Estimated 3-day extension to finishes programme.',
      nextWeek: '1) Feature wall construction\n2) Floor finishes completion\n3) Ceiling finishes',
      weekAfter: '1) Fixtures and equipment\n2) IT installation\n3) Commissioning preparation',
      comment: 'Construction and MEP both completed. Additional feature wall requested by client — minor scope increase. Finishes progressing well overall.',
    },
    {
      date: daysAgo(32),
      wps: { finishes: 'Completed', equipment: 'Completed', commissioning: 'In Progress' },
      schedule: 'At Risk',
      support: 'Yes',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) HVAC commissioning\n2) Fire alarm testing\n3) Electrical certification',
      weekAfter: '1) Integrated systems test\n2) Snagging\n3) Mall authority approvals',
      comment: 'Finishes and equipment complete. T&C commenced but HVAC commissioning requires DM (Dubai Municipality) engineer sign-off — appointment awaited. Support requested for authority coordination.',
    },
    {
      date: daysAgo(7),
      wps: { commissioning: 'In Progress', handover: 'Not Started' },
      schedule: 'Critical',
      support: 'Yes',
      blocked: 'Yes',
      additionalWorks: 'No',
      nextWeek: '1) DM engineer final sign-off\n2) Sprinkler test completion\n3) Integrated systems test',
      weekAfter: '1) Snagging resolution\n2) Final cleaning\n3) Handover documentation',
      comment: 'CRITICAL: HVAC and fire systems still awaiting DM final approval. Opening date in 10 days. Snagging not yet commenced. Escalation required to client and authorities.',
    },
  ],

  'DEMO-QA-MISSING-003': [
    {
      date: daysAgo(49),
      wps: { demolition: 'Completed', construction: 'In Progress', mep: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete drywall partitions\n2) MEP second fix\n3) Floor screed',
      weekAfter: '1) Finishes commencement\n2) Ceiling installation\n3) Lighting first fix',
      comment: 'Works progressing as planned. Structural construction on track. MEP coordination meetings held weekly.',
    },
    {
      date: daysAgo(35),
      wps: { construction: 'Completed', mep: 'Completed', finishes: 'In Progress' },
      schedule: 'At Risk',
      support: 'No',
      blocked: 'Yes',
      additionalWorks: 'No',
      nextWeek: '1) Floor tiles — 40% remaining\n2) Ceiling completion\n3) Wall finishes',
      weekAfter: '1) Equipment installation\n2) Fixtures\n3) T&C preparation',
      comment: 'Construction and MEP complete. Finishes ongoing but tile delivery delayed by 1 week from supplier. Floor works blocked pending delivery. PM informed.',
    },
  ],

  'DEMO-QA-PM-AHEAD-004': [
    {
      date: daysAgo(70),
      wps: { preconstruction: 'In Progress', demolition: 'Not Started' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete hoarding installation\n2) Temporary services connection\n3) Subcontractor mobilisation',
      weekAfter: '1) Demolition works start\n2) Waste skip arrangement\n3) Structural investigation',
      comment: 'Pre-construction phase underway. Site setup 50% complete. Hoarding approved by mall management. Team mobilisation progressing.',
    },
    {
      date: daysAgo(63),
      wps: { preconstruction: 'In Progress', demolition: 'Not Started' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Shop drawing approvals\n2) Material procurement finalise\n3) Demolition commencement',
      weekAfter: '1) Structural works\n2) MEP rough-in start\n3) Coordination meetings',
      comment: 'Pre-construction 80% complete. Minor delay on shop drawing approval from mall consultant — expected next week. On track overall.',
    },
    {
      date: daysAgo(56),
      wps: { preconstruction: 'Completed', demolition: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Demolition completion\n2) Waste clearance\n3) Surface preparation',
      weekAfter: '1) Structural works start\n2) MEP preparation\n3) Contractor briefing',
      comment: 'Pre-construction complete. Demolition started — existing fitout 40% removed. Good site productivity.',
    },
    {
      date: daysAgo(49),
      wps: { demolition: 'In Progress', construction: 'Not Started' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete demolition\n2) Waste removal\n3) Begin structural frame',
      weekAfter: '1) Drywall partitions\n2) MEP rough-in\n3) Ceiling structure',
      comment: 'Demolition 65% complete. Structural team mobilising next week. Programme on track.',
    },
    {
      date: daysAgo(14),
      wps: { demolition: 'In Progress', construction: 'Not Started' },
      schedule: 'At Risk',
      support: 'Yes',
      blocked: 'Yes',
      additionalWorks: 'No',
      nextWeek: '1) Demolition final push\n2) Structural works commencement\n3) MEP preparation',
      weekAfter: '1) Drywall works\n2) MEP rough-in\n3) Ceiling structure',
      comment: 'Demolition taking longer than planned due to additional structural elements found. Construction start delayed by 5 days. Client PM support requested for schedule recovery options.',
    },
  ],

  'DEMO-QA-DISCREPANCY-005': [
    {
      date: daysAgo(80),
      wps: { preconstruction: 'Completed', demolition: 'Completed' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Construction works\n2) MEP rough-in start\n3) Material deliveries',
      weekAfter: '1) Structural frame\n2) Electrical conduits\n3) HVAC ducts',
      comment: 'Pre-construction and demolition both completed. Construction phase commenced. Good early progress.',
    },
    {
      date: daysAgo(65),
      wps: { construction: 'Completed', mep: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) MEP second fix\n2) Ceiling structure\n3) Floor screed',
      weekAfter: '1) Finishes start\n2) Lighting\n3) Wall finishes',
      comment: 'Construction works completed. MEP progressing well — HVAC 80% complete, electrical 70%.',
    },
    {
      date: daysAgo(50),
      wps: { mep: 'Completed', finishes: 'Completed' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Equipment installation\n2) Retail display fitting\n3) IT infrastructure',
      weekAfter: '1) Testing commencement\n2) Snagging\n3) Authority approvals',
      comment: 'MEP and finishes completed. Outstanding quality achieved ahead of schedule. Equipment deliveries being coordinated.',
    },
    {
      date: daysAgo(35),
      wps: { equipment: 'Completed', commissioning: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Complete HVAC commissioning\n2) Fire system test\n3) Electrical sign-off',
      weekAfter: '1) Integrated test\n2) Snagging resolution\n3) Documentation',
      comment: 'All equipment installed and operational. T&C progressing well. Consultant sign-off expected within the week.',
    },
    {
      date: daysAgo(7),
      wps: { commissioning: 'Completed', handover: 'In Progress' },
      schedule: 'On Track',
      support: 'No',
      blocked: 'No',
      additionalWorks: 'No',
      nextWeek: '1) Authority approvals\n2) Staff training\n3) O&M manuals',
      weekAfter: '1) Final certificates\n2) Handover completion\n3) Opening readiness',
      comment: 'All T&C complete. Handover package being finalised. Opening in 45 days — all works on schedule.',
    },
  ],
};

// ─── PM site visit schedules per project ──────────────────────────────────────
const VISIT_SCHEDULES = {
  'DEMO-QA-HEALTHY-001': [
    {
      visitDate: daysAgo(90),
      refReportDate: daysAgo(98),
      pmAssessment: 'On Track',
      wpObservations: {
        preconstruction: { status: 'In Progress', note: 'Site setup progressing well, hoarding complete' },
      },
      notes: 'Site well organised. Hoarding properly erected with safety signage. GC site manager on-site during visit.',
    },
    {
      visitDate: daysAgo(70),
      refReportDate: daysAgo(77),
      pmAssessment: 'On Track',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Demolition confirmed complete, area clean' },
        construction: { status: 'In Progress', note: 'Structural frame partially erected, on track' },
        mep: { status: 'Not Started', note: 'MEP rough-in not yet visible on site' },
      },
      notes: 'Good progress. Demolition fully cleared. GC claims MEP in progress but site shows no MEP works yet — discrepancy noted.',
    },
    {
      visitDate: daysAgo(45),
      refReportDate: daysAgo(49),
      pmAssessment: 'On Track',
      wpObservations: {
        mep: { status: 'Completed', note: 'MEP rough-in complete, tested' },
        finishes: { status: 'In Progress', note: 'Finishes partially complete, floor 60% tiled' },
        equipment: { status: 'Not Started', note: 'Equipment not yet on site' },
      },
      notes: 'MEP confirmed complete by consultant. Finishes quality excellent. Equipment delivery expected next week.',
    },
  ],

  'DEMO-QA-NEAR-OPEN-002': [
    {
      visitDate: daysAgo(72),
      refReportDate: daysAgo(74),
      pmAssessment: 'On Track',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Demolition complete and verified' },
        construction: { status: 'In Progress', note: 'Structural works progressing as reported' },
        mep: { status: 'Not Started', note: 'MEP not yet commenced despite GC report' },
      },
      notes: 'General progress as reported. However MEP rough-in not visible on site — GC reporting slightly ahead of actual.',
    },
    {
      visitDate: daysAgo(50),
      refReportDate: daysAgo(53),
      pmAssessment: 'On Track',
      wpObservations: {
        construction: { status: 'Completed', note: 'Construction confirmed complete' },
        mep: { status: 'Completed', note: 'MEP rough-in complete and signed off' },
        finishes: { status: 'In Progress', note: 'Finishes partially done' },
      },
      notes: 'Good progress. Feature wall work in progress. Finishes on track but tight timeline ahead.',
    },
    {
      visitDate: daysAgo(25),
      refReportDate: daysAgo(32),
      pmAssessment: 'At Risk',
      wpObservations: {
        finishes: { status: 'Completed', note: 'Finishes confirmed complete' },
        equipment: { status: 'Completed', note: 'Equipment installed and operational' },
        commissioning: { status: 'Not Started', note: 'T&C not commenced — DM appointment not confirmed' },
      },
      notes: 'CONCERN: GC reports T&C in progress but site shows no commissioning activity. DM appointment still not confirmed. Opening date at significant risk.',
    },
    {
      visitDate: daysAgo(4),
      refReportDate: daysAgo(7),
      pmAssessment: 'Critical',
      wpObservations: {
        commissioning: { status: 'In Progress', note: 'Only HVAC commissioning started, other systems pending' },
        handover: { status: 'Not Started', note: 'No handover activities commenced' },
      },
      notes: 'CRITICAL VISIT: 10 days to opening and only HVAC commissioning partially underway. Fire system, electrical certification, and integrated testing not started. Formal escalation letter sent to GC.',
    },
  ],

  'DEMO-QA-MISSING-003': [
    {
      visitDate: daysAgo(45),
      refReportDate: daysAgo(49),
      pmAssessment: 'At Risk',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Demolition complete' },
        construction: { status: 'In Progress', note: 'Partial works visible, estimate 50% done' },
        mep: { status: 'Not Started', note: 'No MEP works commenced despite GC report' },
      },
      notes: 'Site visit reveals programme slippage. MEP not yet started despite GC report indicating In Progress. Raised with GC site manager.',
    },
    {
      visitDate: daysAgo(26),
      refReportDate: daysAgo(35),
      pmAssessment: 'At Risk',
      wpObservations: {
        construction: { status: 'Completed', note: 'Construction confirmed complete' },
        mep: { status: 'In Progress', note: 'MEP now visible, approx 60% complete' },
        finishes: { status: 'Not Started', note: 'No finishes commenced yet vs GC In Progress' },
      },
      notes: 'No contractor report received in 35 days. Programme significantly behind. Finishes not started. Requested immediate updated schedule from GC.',
    },
  ],

  'DEMO-QA-PM-AHEAD-004': [
    {
      visitDate: daysAgo(54),
      refReportDate: daysAgo(56),
      pmAssessment: 'On Track',
      wpObservations: {
        preconstruction: { status: 'Completed', note: 'Pre-construction fully complete' },
        demolition: { status: 'Completed', note: 'Demolition actually further than GC report — 80% done' },
      },
      notes: 'PM observes demolition significantly further than GC reported. Works actually ahead of contractor report — GC team under-reporting progress. Programme healthier than shown.',
    },
    {
      visitDate: daysAgo(41),
      refReportDate: daysAgo(49),
      pmAssessment: 'On Track',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Demolition fully complete' },
        construction: { status: 'Completed', note: 'Construction complete — GC reported Not Started!' },
        mep: { status: 'In Progress', note: 'MEP rough-in already commenced' },
      },
      notes: 'GC weekly reports significantly lagging actual progress. Construction works COMPLETE on site but GC latest report shows Not Started. PM ahead on multiple packages. Requested GC update reporting frequency.',
    },
    {
      visitDate: daysAgo(12),
      refReportDate: daysAgo(14),
      pmAssessment: 'On Track',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Confirmed complete' },
        construction: { status: 'Completed', note: 'Fully complete' },
        mep: { status: 'Completed', note: 'MEP rough-in complete — GC reports still show In Progress' },
        finishes: { status: 'In Progress', note: 'Finishes already commenced on site' },
      },
      notes: 'Third consecutive PM Ahead observation. MEP complete per site inspection, GC still reporting In Progress in latest weekly report. Formal notice issued to GC to align reporting.',
    },
  ],

  'DEMO-QA-DISCREPANCY-005': [
    {
      visitDate: daysAgo(72),
      refReportDate: daysAgo(80),
      pmAssessment: 'On Track',
      wpObservations: {
        preconstruction: { status: 'Completed', note: 'Pre-construction verified complete' },
        demolition: { status: 'In Progress', note: 'Demolition only 40% complete vs GC Completed' },
        construction: { status: 'Not Started', note: 'No construction works visible' },
      },
      notes: 'DISCREPANCY: GC reports demolition Completed and construction started. Site shows demolition 40% done and no construction activity. GC reports significantly ahead of actual.',
    },
    {
      visitDate: daysAgo(58),
      refReportDate: daysAgo(65),
      pmAssessment: 'At Risk',
      wpObservations: {
        demolition: { status: 'Completed', note: 'Demolition now complete' },
        construction: { status: 'In Progress', note: 'Construction 40% vs GC Completed' },
        mep: { status: 'Not Started', note: 'MEP not yet started despite GC In Progress' },
      },
      notes: 'Second visit confirms pattern of GC over-reporting. Construction reported Completed by GC is actually 40% done on site. Formal discrepancy log initiated.',
    },
    {
      visitDate: daysAgo(43),
      refReportDate: daysAgo(50),
      pmAssessment: 'At Risk',
      wpObservations: {
        construction: { status: 'Completed', note: 'Construction finally confirmed complete' },
        mep: { status: 'In Progress', note: 'MEP now started, approx 60%' },
        finishes: { status: 'Not Started', note: 'No finishes visible vs GC Completed' },
      },
      notes: 'GC reported finishes Completed. Site shows no finishes work commenced. MEP still in progress. Pattern of over-reporting continues. 3rd discrepancy log entry.',
    },
    {
      visitDate: daysAgo(10),
      refReportDate: daysAgo(7),
      pmAssessment: 'Critical',
      wpObservations: {
        commissioning: { status: 'Not Started', note: 'No commissioning activity — GC says Completed!' },
        handover: { status: 'Not Started', note: 'Handover not commenced vs GC In Progress' },
        finishes: { status: 'In Progress', note: 'Finishes still ongoing' },
      },
      notes: 'CRITICAL DISCREPANCY: GC latest report claims commissioning Completed and handover In Progress. Site visit shows NO commissioning activity and finishes still ongoing. Formal notice and programme recovery plan requested immediately. Escalated to senior management.',
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createProject(page, proj) {
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  const addBtn = page.locator('button.primary-button', { hasText: /add project|\+ project|new project/i }).first();
  if (await addBtn.count() === 0) {
    STATE.warnings.push(`Add project button not found for ${proj.storeCode}`);
    return false;
  }
  await addBtn.click();

  const modal = page.locator('.modal, [role="dialog"]').first();
  await expect(modal).toBeVisible({ timeout: 8_000 });

  // Required fields
  await modal.locator('input[name="storeCode"]').fill(proj.storeCode);
  await modal.locator('input[name="shoppingMallName"]').fill(proj.shoppingMallName);
  await modal.locator('input[name="city"]').fill(proj.city);
  if (proj.state) await modal.locator('input[name="state"]').fill(proj.state);
  if (proj.street) await modal.locator('input[name="street"]').fill(proj.street);
  await modal.locator('input[name="country"]').fill(proj.country);
  if (proj.salesMarket) await modal.locator('input[name="salesMarket"]').fill(proj.salesMarket);
  await modal.locator('input[name="projectManager"]').fill(proj.projectManager);
  await modal.locator('input[name="generalContractor"]').fill(proj.generalContractor);
  if (proj.securityManager) await modal.locator('input[name="securityManager"]').fill(proj.securityManager);
  if (proj.itManager) await modal.locator('input[name="itManager"]').fill(proj.itManager);
  if (proj.facilityManager) await modal.locator('input[name="facilityManager"]').fill(proj.facilityManager);
  await modal.locator('input[type="date"][name="constructionStartDate"]').fill(proj.constructionStartDate);
  await modal.locator('input[type="date"][name="constructionEndDate"]').fill(proj.constructionEndDate);
  await modal.locator('input[type="date"][name="targetOpeningDate"]').fill(proj.targetOpeningDate);

  // Save
  const saveBtn = modal.locator('button.primary-button', { hasText: /create project/i }).first();
  if (await saveBtn.count() === 0) {
    // Fallback: any primary button that isn't Cancel
    const fallback = modal.locator('button', { hasText: /create|save/i }).first();
    await fallback.click();
  } else {
    await saveBtn.click();
  }

  await page.waitForLoadState('networkidle');
  return true;
}

async function getProjectId(page, storeCode) {
  await page.goto('/contractor-select');
  await page.waitForLoadState('networkidle');

  const card = page.locator('.contractor-project-card').filter({ hasText: storeCode });
  if (await card.count() === 0) {
    STATE.warnings.push(`Project card not found for ${storeCode}`);
    return null;
  }

  const btn = card.first().locator('button.btn-primary');
  await btn.click();
  await page.waitForLoadState('networkidle');

  const id = page.url().split('/').pop();
  if (!id || id === 'contractor-select') {
    STATE.warnings.push(`Could not extract project ID for ${storeCode}`);
    return null;
  }
  return id;
}

/** Activate a work package toggle if not already active */
async function activateWP(page, wpId) {
  const toggle = page.locator(`[data-testid="wp-toggle"][data-wp-id="${wpId}"]`);
  if (await toggle.count() === 0) return;
  const text = await toggle.textContent().catch(() => '');
  if (!text.includes('✓')) {
    await toggle.click();
    await page.waitForTimeout(250);
  }
}

/** Set all task rows for a WP to the given status. "Not Started" is skipped (it's the default). */
async function setWPTasksToStatus(page, wpId, status) {
  if (status === 'Not Started') return;
  await activateWP(page, wpId);
  await page.waitForTimeout(200);

  const rows = page.locator(`[data-testid="task-row"][data-wp-id="${wpId}"]`);
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const btn = rows.nth(i).locator(`[data-testid="status-btn-${status}"]`);
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(40);
    }
  }
}

/** For "In Progress" WPs: first half Completed, second half In Progress (realistic mixed state) */
async function setWPInProgress(page, wpId) {
  await activateWP(page, wpId);
  await page.waitForTimeout(200);

  const rows = page.locator(`[data-testid="task-row"][data-wp-id="${wpId}"]`);
  const count = await rows.count();
  const halfway = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    const s = i < halfway ? 'Completed' : 'In Progress';
    const btn = rows.nth(i).locator(`[data-testid="status-btn-${s}"]`);
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(40);
    }
  }
}

async function submitContractorReport(page, projectId, report) {
  await page.goto(`/contractor-report/${projectId}`);
  await page.waitForLoadState('networkidle');

  // Date
  const dateInput = page.locator('[data-testid="reporting-date"]');
  await dateInput.fill(report.date);

  // WP statuses
  for (const [wpId, status] of Object.entries(report.wps)) {
    if (status === 'Completed') {
      await setWPTasksToStatus(page, wpId, 'Completed');
    } else if (status === 'In Progress') {
      await setWPInProgress(page, wpId);
    } else if (status === 'Not Applicable') {
      await setWPTasksToStatus(page, wpId, 'Not Applicable');
    } else {
      await activateWP(page, wpId); // still activate even if Not Started
    }
  }

  // Schedule status
  const schedBtn = page.locator(`[data-testid="toggle-schedule-status-${report.schedule}"]`);
  if (await schedBtn.count() > 0) await schedBtn.click();

  // Support required
  const supportBtn = page.locator(`[data-testid="toggle-support-required-${report.support}"]`);
  if (await supportBtn.count() > 0) await supportBtn.click();

  // Activities blocked
  const blockedBtn = page.locator(`[data-testid="toggle-activities-blocked-${report.blocked}"]`);
  if (await blockedBtn.count() > 0) await blockedBtn.click();

  // Additional works
  if (report.additionalWorks) {
    const awBtn = page.locator(`[data-testid="toggle-additional-works-${report.additionalWorks}"]`);
    if (await awBtn.count() > 0) await awBtn.click();
  }

  // Text areas (look-ahead)
  const form = page.locator('[data-testid="contractor-report-form"]');
  const textareas = form.locator('textarea');
  const taCount = await textareas.count();

  if (taCount >= 1 && report.nextWeek) await textareas.nth(0).fill(report.nextWeek);
  if (taCount >= 2 && report.weekAfter) await textareas.nth(1).fill(report.weekAfter);
  if (taCount >= 3) await textareas.nth(2).fill('No unresolved pending issues this week.');
  if (taCount >= 4 && report.comment) await textareas.nth(3).fill(report.comment);

  // Photo
  const fileInput = page.locator('input[type="file"][accept="image/*"]');
  if (await fileInput.count() > 0) {
    await fileInput.setInputFiles({ name: 'demo-site-photo.png', mimeType: 'image/png', buffer: TINY_PNG });
  }

  // Declaration
  await page.locator('[data-testid="declaration-checkbox"]').click();

  // Save
  await page.locator('[data-testid="save-contractor-report"]').click();
  await expect(page.locator('text=Report submitted')).toBeVisible({ timeout: 30_000 });

  STATE.reportsCreated++;
  return true;
}

async function submitPMSiteVisit(page, projectId, visit) {
  await page.goto(`/site-visit/${projectId}`);
  await page.waitForLoadState('networkidle');

  // Visit date
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill(visit.visitDate);

  // Reference GC report — find option matching the date
  const refSelect = page.locator('[data-testid="pm-site-visit-form"] select').first();
  if (await refSelect.count() > 0) {
    const options = await refSelect.locator('option').allTextContents();
    const matchIdx = options.findIndex((o) => o.includes(visit.refReportDate));
    if (matchIdx > 0) {
      await refSelect.selectOption({ index: matchIdx });
    } else if (options.length > 1) {
      // Select last available report as best approximation
      await refSelect.selectOption({ index: options.length - 1 });
    }
    await page.waitForTimeout(500);
  }

  // PM task observations
  for (const [wpId, obs] of Object.entries(visit.wpObservations)) {
    const pmRows = page.locator(`[data-testid="pm-task-row"][data-wp-id="${wpId}"]`);
    const rowCount = await pmRows.count();

    for (let i = 0; i < Math.min(rowCount, 4); i++) {
      const statusBtn = pmRows.nth(i).locator(`[data-testid="pm-status-btn-${obs.status}"]`);
      if (await statusBtn.count() > 0) {
        await statusBtn.click();
        await page.waitForTimeout(40);
      }
    }
  }

  // PM schedule assessment
  const schedBtn = page.locator(`[data-testid="pm-schedule-btn-${visit.pmAssessment}"]`);
  if (await schedBtn.count() > 0) await schedBtn.click();

  // Declaration
  const declaration = page.locator('[data-testid="pm-declaration-checkbox"]');
  if (await declaration.count() > 0) await declaration.click();

  // Save
  const saveBtn = page.locator('[data-testid="save-site-visit-report"]');
  await saveBtn.click();
  await expect(page.locator('text=Site Visit Recorded')).toBeVisible({ timeout: 30_000 });

  STATE.visitsCreated++;
  return true;
}

// ─── TESTS (serial — share module-level STATE) ────────────────────────────────

test.describe.serial('DEMO SEED — Persistent QA Data', () => {
  // ── Step 1: Create all 5 projects and capture IDs ───────────────────────
  test('Step 1: Create all 5 DEMO-QA projects', async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, CREDENTIALS.admin);

    // Skip project creation if it already exists (idempotent)
    for (const [, proj] of Object.entries(PROJECTS)) {
      // Check if already exists
      await page.goto('/projects');
      await page.waitForLoadState('networkidle');
      const existing = page.locator('table tbody tr, [data-testid="project-row"]').filter({ hasText: proj.storeCode });
      if (await existing.count() > 0) {
        STATE.warnings.push(`${proj.storeCode} already exists — skipping creation`);
      } else {
        const ok = await createProject(page, proj);
        if (ok) {
          STATE.created.push(proj.storeCode);
        }
      }
    }

    // Now capture all project IDs via contractor-select
    for (const [, proj] of Object.entries(PROJECTS)) {
      const id = await getProjectId(page, proj.storeCode);
      if (id) {
        STATE.projectIds[proj.storeCode] = id;
      } else {
        STATE.warnings.push(`Could not get project ID for ${proj.storeCode}`);
      }
    }

    const idsFound = Object.keys(STATE.projectIds).length;
    expect(idsFound).toBeGreaterThanOrEqual(4); // At least 4 of 5 must be accessible
  });

  // ── Step 2: Healthy project — contractor reports ─────────────────────────
  test('Step 2: HEALTHY — 5 contractor reports (steady progression)', async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-HEALTHY-001'];
    test.skip(!projectId, 'Healthy project ID not found — skipping');

    const schedule = REPORT_SCHEDULES['DEMO-QA-HEALTHY-001'];
    for (const report of schedule) {
      await submitContractorReport(page, projectId, report);
    }

    expect(STATE.reportsCreated).toBeGreaterThanOrEqual(schedule.length);
  });

  // ── Step 3: Healthy project — PM site visits ─────────────────────────────
  test('Step 3: HEALTHY — 3 PM site visits', async ({ page }) => {
    test.setTimeout(150_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-HEALTHY-001'];
    test.skip(!projectId, 'Healthy project ID not found');

    const visits = VISIT_SCHEDULES['DEMO-QA-HEALTHY-001'];
    for (const visit of visits) {
      await submitPMSiteVisit(page, projectId, visit);
    }
  });

  // ── Step 4: Near Opening — contractor reports ────────────────────────────
  test('Step 4: NEAR-OPEN — 5 contractor reports (T&C stalling)', async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-NEAR-OPEN-002'];
    test.skip(!projectId, 'Near Open project ID not found');

    const schedule = REPORT_SCHEDULES['DEMO-QA-NEAR-OPEN-002'];
    for (const report of schedule) {
      await submitContractorReport(page, projectId, report);
    }
  });

  // ── Step 5: Near Opening — PM site visits ───────────────────────────────
  test('Step 5: NEAR-OPEN — 4 PM site visits (escalating discrepancies)', async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-NEAR-OPEN-002'];
    test.skip(!projectId, 'Near Open project ID not found');

    const visits = VISIT_SCHEDULES['DEMO-QA-NEAR-OPEN-002'];
    for (const visit of visits) {
      await submitPMSiteVisit(page, projectId, visit);
    }
  });

  // ── Step 6: Missing Reports — contractor reports (2 old ones only) ───────
  test('Step 6: MISSING — 2 contractor reports (stale data scenario)', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-MISSING-003'];
    test.skip(!projectId, 'Missing project ID not found');

    const schedule = REPORT_SCHEDULES['DEMO-QA-MISSING-003'];
    for (const report of schedule) {
      await submitContractorReport(page, projectId, report);
    }
  });

  // ── Step 7: Missing Reports — PM site visits ────────────────────────────
  test('Step 7: MISSING — 2 PM site visits', async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-MISSING-003'];
    test.skip(!projectId, 'Missing project ID not found');

    const visits = VISIT_SCHEDULES['DEMO-QA-MISSING-003'];
    for (const visit of visits) {
      await submitPMSiteVisit(page, projectId, visit);
    }
  });

  // ── Step 8: PM Ahead — contractor reports ───────────────────────────────
  test('Step 8: PM-AHEAD — 5 contractor reports (contractor under-reporting)', async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-PM-AHEAD-004'];
    test.skip(!projectId, 'PM Ahead project ID not found');

    const schedule = REPORT_SCHEDULES['DEMO-QA-PM-AHEAD-004'];
    for (const report of schedule) {
      await submitContractorReport(page, projectId, report);
    }
  });

  // ── Step 9: PM Ahead — site visits (PM consistently observes more) ───────
  test('Step 9: PM-AHEAD — 3 PM site visits (PM ahead pattern)', async ({ page }) => {
    test.setTimeout(150_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-PM-AHEAD-004'];
    test.skip(!projectId, 'PM Ahead project ID not found');

    const visits = VISIT_SCHEDULES['DEMO-QA-PM-AHEAD-004'];
    for (const visit of visits) {
      await submitPMSiteVisit(page, projectId, visit);
    }
  });

  // ── Step 10: Discrepancy — contractor reports ────────────────────────────
  test('Step 10: DISCREPANCY — 5 contractor reports (GC over-reporting)', async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-DISCREPANCY-005'];
    test.skip(!projectId, 'Discrepancy project ID not found');

    const schedule = REPORT_SCHEDULES['DEMO-QA-DISCREPANCY-005'];
    for (const report of schedule) {
      await submitContractorReport(page, projectId, report);
    }
  });

  // ── Step 11: Discrepancy — PM site visits ───────────────────────────────
  test('Step 11: DISCREPANCY — 4 PM site visits (GC ahead pattern)', async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, CREDENTIALS.admin);
    const projectId = STATE.projectIds['DEMO-QA-DISCREPANCY-005'];
    test.skip(!projectId, 'Discrepancy project ID not found');

    const visits = VISIT_SCHEDULES['DEMO-QA-DISCREPANCY-005'];
    for (const visit of visits) {
      await submitPMSiteVisit(page, projectId, visit);
    }
  });

  // ── Step 12: Verify — Dashboard ──────────────────────────────────────────
  test('Step 12: Verify — Dashboard shows DEMO-QA projects', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN%');
    expect(bodyText).not.toContain('[object Object]');
    expect(bodyText).not.toContain('undefined');

    // At least some DEMO-QA projects should appear
    const demoRows = page.locator('[data-testid="dashboard-project-row"]').filter({ hasText: 'DEMO-QA' });
    const demoCount = await demoRows.count();
    expect(demoCount).toBeGreaterThanOrEqual(1);
  });

  // ── Step 13: Verify — Weekly Reports ─────────────────────────────────────
  test('Step 13: Verify — Weekly Reports contains DEMO-QA data', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, CREDENTIALS.admin);
    await page.goto('/weekly-reports');
    await page.waitForLoadState('networkidle');

    const projectSelect = page.locator('[data-testid="project-select"]');
    if (await projectSelect.count() > 0) {
      const options = await projectSelect.locator('option').allTextContents();
      const demoOptions = options.filter((o) => o.includes('DEMO-QA'));
      expect(demoOptions.length).toBeGreaterThanOrEqual(1);

      // Select first DEMO-QA project and check it loads
      const firstDemoOption = options.findIndex((o) => o.includes('DEMO-QA'));
      if (firstDemoOption > 0) {
        await projectSelect.selectOption({ index: firstDemoOption });
        await page.waitForLoadState('networkidle');
        const bodyText = await page.locator('body').innerText();
        expect(bodyText).not.toContain('NaN%');
        expect(bodyText).not.toContain('Delayed'); // Delayed status should not appear
      }
    }
  });

  // ── Step 14: Verify — Risk Dashboard ─────────────────────────────────────
  test('Step 14: Verify — Risk Dashboard reflects different risk levels', async ({ page }) => {
    test.setTimeout(60_000);

    await login(page, CREDENTIALS.admin);
    await page.goto('/risk');
    await page.waitForLoadState('networkidle');

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('[object Object]');

    // KPI boxes must be numeric
    for (const level of ['critical', 'high', 'medium', 'low']) {
      const box = page.locator(`[data-testid="risk-kpi-${level}"]`);
      if (await box.count() === 0) continue;
      const text = await box.innerText();
      const num = parseInt(text, 10);
      expect(Number.isFinite(num)).toBe(true);
    }
  });

  // ── Step 15: Verify — Dashboard drawers open cleanly ─────────────────────
  test('Step 15: Verify — project drawers show data without corruption', async ({ page }) => {
    test.setTimeout(90_000);

    await login(page, CREDENTIALS.admin);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('[data-testid="dashboard-project-row"]').filter({ hasText: 'DEMO-QA' });
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No DEMO-QA rows found in dashboard');

    let verified = 0;
    for (let i = 0; i < Math.min(rowCount, 3); i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(500);
      const drawer = page.locator('[data-testid="project-detail-drawer"]');
      if (!await drawer.isVisible().catch(() => false)) continue;

      const text = await drawer.innerText();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('[object Object]');
      expect(text).not.toContain('undefined');

      verified++;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    expect(verified).toBeGreaterThanOrEqual(1);
  });

  // ── Step 16: Generate demo seed report ───────────────────────────────────
  test('Step 16: Generate demo seed report files', async () => {
    test.setTimeout(30_000);

    const reportDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const now = new Date().toISOString();
    const baseUrl = 'http://localhost:5173';

    const projectRows = Object.entries(PROJECTS)
      .map(([, proj]) => {
        const reports = REPORT_SCHEDULES[proj.storeCode]?.length || 0;
        const visits = VISIT_SCHEDULES[proj.storeCode]?.length || 0;
        return `| ${proj.storeCode} | ${proj.shoppingMallName.split(' — ')[1] || proj.shoppingMallName} | ${proj.targetOpeningDate} | ${proj.expectedRisk} | ${reports} | ${visits} |`;
      })
      .join('\n');

    const warningSection =
      STATE.warnings.length > 0
        ? STATE.warnings.map((w) => `- ⚠️ ${w}`).join('\n')
        : '_No warnings._';

    const overallStatus =
      Object.keys(STATE.projectIds).length >= 4 && STATE.reportsCreated >= 10
        ? 'DEMO DATA CREATED'
        : 'DEMO DATA CREATION FAILED';

    const md = `# Noryx — Demo Seed QA Report

**Generated:** ${now}
**Base URL:** ${baseUrl}
**Status:** ${overallStatus === 'DEMO DATA CREATED' ? '✅ DEMO DATA CREATED' : '❌ DEMO DATA CREATION FAILED'}

---

## Created Projects

| Store Code | Mall / Location | Opening Date | Expected Risk | GC Reports | PM Visits |
|------------|----------------|-------------|---------------|-----------|-----------|
${projectRows}

**Total contractor reports created this run:** ${STATE.reportsCreated}
**Total PM site visits created this run:** ${STATE.visitsCreated}

---

## Where to Find the Data

| View | How to navigate | What to look for |
|------|----------------|-----------------|
| Dashboard | \`/\` → project matrix | DEMO-QA rows with different status colours |
| Project Drawer | Click any DEMO-QA row | 4 summary blocks: Contractor, PM Visit, Risk, Opening |
| Weekly Reports | \`/weekly-reports\` → select project | GC report history with WP progressions |
| PM Site Visit | Projects → row → Site Visit button | PM observations vs GC reference |
| Risk Dashboard | \`/risk\` | Near-Opening and Discrepancy projects should show HIGH/CRITICAL |
| Projects List | \`/projects\` → filter by DEMO-QA | All project fields populated |

---

## Scenario Summary

| Project | Scenario | Expected Risk | Key Signal |
|---------|----------|---------------|------------|
| DEMO-QA-HEALTHY-001 | Steady progress, far opening | LOW | Smooth WP progression week-by-week |
| DEMO-QA-NEAR-OPEN-002 | T&C incomplete, 10 days to opening | CRITICAL | Missing commissioning + critical schedule |
| DEMO-QA-MISSING-003 | No recent reports, 25 days to opening | HIGH | Last report 35 days ago + opening imminent |
| DEMO-QA-PM-AHEAD-004 | GC under-reporting | MEDIUM | PM observes Completed, GC reports In Progress |
| DEMO-QA-DISCREPANCY-005 | GC over-reporting | HIGH | GC reports Completed, PM sees In Progress |

---

## Prefixed IDs (for identification)

All demo records are prefixed with \`DEMO-QA\` in the store code field.
To remove demo data later, search for \`DEMO-QA\` in the projects list and delete.

---

## Warnings

${warningSection}

---

## Final Status: ${overallStatus}
`;

    fs.writeFileSync(path.join(reportDir, 'noryx-demo-seed-report.md'), md, 'utf8');

    const summary = {
      status: overallStatus,
      generatedAt: now,
      baseUrl,
      projectsCreated: Object.entries(PROJECTS).map(([, proj]) => ({
        storeCode: proj.storeCode,
        projectId: STATE.projectIds[proj.storeCode] || null,
        mall: proj.shoppingMallName,
        openingDate: proj.targetOpeningDate,
        scenario: proj.scenario,
        expectedRisk: proj.expectedRisk,
        gcReports: REPORT_SCHEDULES[proj.storeCode]?.length || 0,
        pmVisits: VISIT_SCHEDULES[proj.storeCode]?.length || 0,
      })),
      contractorReportsCreated: STATE.reportsCreated,
      siteVisitsCreated: STATE.visitsCreated,
      warnings: STATE.warnings,
    };

    fs.writeFileSync(
      path.join(reportDir, 'noryx-demo-seed-summary.json'),
      JSON.stringify(summary, null, 2),
      'utf8',
    );

    console.log('\n🎭 Demo Seed Report: test-results/noryx-demo-seed-report.md');
    console.log('📊 Demo Seed Summary: test-results/noryx-demo-seed-summary.json');
    console.log(`📦 Projects found:  ${Object.keys(STATE.projectIds).length}/5`);
    console.log(`📝 Reports created: ${STATE.reportsCreated}`);
    console.log(`🏗️  Visits created:  ${STATE.visitsCreated}`);
    if (STATE.warnings.length > 0) {
      console.log(`⚠️  Warnings: ${STATE.warnings.length}`);
      STATE.warnings.forEach((w) => console.log(`   ${w}`));
    }
    console.log(`\n✅ Status: ${overallStatus}\n`);

    expect(overallStatus).toBe('DEMO DATA CREATED');
  });
});
