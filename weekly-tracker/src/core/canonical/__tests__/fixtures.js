const statuses = (a, b) => ({
  demolition: {
    'Strip Out & Clear': { progress: a, status: a === 100 ? 'Completed' : 'In Progress' },
    'Structural Demolition': { progress: b, status: b === 100 ? 'Completed' : 'In Progress' },
  },
});

const project = overrides => ({
  id: 'project-1',
  companyId: 'org-1',
  constructionStartDate: '2026-01-01',
  constructionEndDate: '2026-12-31',
  targetOpeningDate: '2027-01-15',
  scope: { workPackages: ['demo.strip_out', 'demo.structural'], zoneAreas: { sales: 700, back: 300 } },
  progressHistory: [{ id: 'h1', overall_progress: 20, recorded_at: '2026-01-08' }],
  ...overrides,
});

export const scenarios = {
  normal: {
    project: project(),
    contractorReports: [{ id: 'r1', reportingDate: '2026-02-01', workPackageStatuses: statuses(100, 0) }],
    siteVisits: [{ id: 'v1', visitDate: '2026-02-02', wps: [
      { wpId: 'demo.strip_out', observed_progress: 80 },
      { wpId: 'demo.structural', observed_progress: 0 },
    ] }],
  },
  partialScope: {
    project: project({ scope: { workPackages: ['demo.strip_out'], zoneAreas: { sales: 500 } } }),
    contractorReports: [{ id: 'r2', reportingDate: '2026-02-03', workPackageStatuses: statuses(75, 100) }],
    siteVisits: [{ id: 'v2', visitDate: '2026-02-04', wps: [{ wpId: 'demo.strip_out', observed_progress: 75 }] }],
  },
  missingData: {
    project: project({ constructionStartDate: null, constructionEndDate: null, targetOpeningDate: null, scope: { workPackages: ['demo.strip_out'], zoneAreas: {} }, progressHistory: [] }),
    contractorReports: [], siteVisits: [], progressHistory: [],
  },
  conflicting: {
    project: project(),
    contractorReports: [
      { id: 'r-old', reportingDate: '2026-03-01', workPackageStatuses: statuses(10, 10) },
      { id: 'r-new', reportingDate: '2026-03-10', workPackageStatuses: statuses(100, 80) },
    ],
    siteVisits: [{ id: 'v-old-scope', visitDate: '2026-03-05', wps: [
      { wpId: 'demo.strip_out', observed_progress: 40 },
      { wpId: 'outside-scope', observed_progress: 100 },
    ] }],
  },
  invalidBoundaries: {
    project: project({ scope: { workPackages: ['demo.strip_out', 'demo.structural'], zoneAreas: { sales: -120, back: '250' } } }),
    contractorReports: [
      { id: 'duplicate', reportingDate: 'invalid', workPackageStatuses: statuses('-5', '140') },
      { id: 'duplicate', reportingDate: '2026-04-02', workPackageStatuses: statuses(50, 50) },
    ],
    siteVisits: [{ id: 'v5', visitDate: '2026-04-03', wps: [
      { wpId: 'demo.strip_out', observed_progress: '120' },
      { wpId: 'demo.structural', observed_progress: null },
    ] }],
  },
};

