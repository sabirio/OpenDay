// weeklyReportPdfTemplate.test.mjs
// Exercises the REAL @react-pdf/renderer pipeline (not a mock) — every check
// here parses actual generated PDF bytes. @react-pdf/renderer runs fine
// server-side in Node (pdf(doc).toBuffer() resolves to a ReadableStream of
// real PDF bytes), so this is a true integration test of the renderer
// boundary, not just the view model.

import { register } from 'node:module';
const loaderSrc = `export async function resolve(s,c,n){if(s.startsWith('.')&&!s.match(/\\.[mc]?js$/)){try{return await n(s+'.js',c)}catch{return n(s+'/index.js',c)}}return n(s,c)}`;
register('data:application/javascript,' + encodeURIComponent(loaderSrc), { parentURL: import.meta.url });

const { pdf } = await import('@react-pdf/renderer');
const { WeeklyReportPdfTemplate } = await import('./WeeklyReportPdfTemplate.js');
const { buildWeeklyReportExportModel } = await import('../weekly/buildWeeklyReportExportModel.js');
const { runOpenDayOrchestrator } = await import('../../core/canonical/index.js');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  OK ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
};

async function toBuffer(doc) {
  const stream = await pdf(doc).toBuffer();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// pdf-lib-free page count: @react-pdf/renderer/pdfkit writes one "/Type /Page"
// object per page plus a "/Count N" on the page tree — counting "/Type /Page"
// object definitions (not "/Pages", the tree node) is a reliable, dependency-free
// way to assert page count against raw PDF bytes in a test.
function countPages(buf) {
  const text = buf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

const CALC_AT = '2026-07-20T00:00:00.000Z';

const PROJECT = {
  id: 1, storeCode: 'AA0011', shoppingMallName: 'Sunrise Mall', city: 'Astana', country: 'Kazakhstan',
  projectManager: 'J. Smith', generalContractor: 'BuildCo', targetOpeningDate: '2027-01-15', projectType: 'New Opening',
  scope: { workPackages: ['demo.strip_out', 'demo.structural'], zoneAreas: { sales: 700, back: 300 } },
  progressHistory: [],
};

const REPORT = {
  id: 'r1', reportingDate: '2026-07-14', submittedAt: '2026-07-14',
  workPackageStatuses: { demolition: { 'Strip Out & Clear': { progress: 100, status: 'Completed' }, 'Structural Demolition': { progress: 50, status: 'In Progress' } } },
  photos: [],
  risks: ['Coordination'], riskOwners: ['General Contractor'], riskScale: 'Medium', riskDescription: 'Coordination delays.',
  nextWeekTop3: '1) Frame\n2) MEP', weekAfterTop3: '1) Drywall', activitiesBlocked: 'No', supportRequired: 'No',
  finalComments: 'All good.',
};

function buildModel(report = REPORT) {
  const orchestrated = runOpenDayOrchestrator({ project: PROJECT, contractorReports: [report], siteVisits: [] }, { calculatedAt: CALC_AT });
  return buildWeeklyReportExportModel({
    project: PROJECT, report, projectReports: [report], canonicalResult: orchestrated,
    overallProgress: orchestrated.progress.overallProgress, generatedAt: CALC_AT,
  });
}

// 1x1 transparent PNG, inline — avoids any network call in tests while still
// exercising the template's real <Image> embedding path.
const TINY_PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

console.log('\nWeeklyReportPdfTemplate — representative report renders a real, valid PDF');
{
  const model = buildModel();
  const buf = await toBuffer(WeeklyReportPdfTemplate(model, []));
  check('output starts with the PDF magic header', buf.slice(0, 5).toString('latin1') === '%PDF-');
  check('output is a non-trivial size (not an empty/broken document)', buf.length > 1000);
  check('renders the expected number of logical pages (summary, progress, risks, upcoming)', countPages(buf) === 4);
}

console.log('\nWeeklyReportPdfTemplate — zero-evidence report renders (no Evidence page)');
{
  const model = buildModel({ ...REPORT, photos: [] });
  const buf = await toBuffer(WeeklyReportPdfTemplate(model, []));
  check('zero-evidence report still renders a valid PDF', buf.slice(0, 5).toString('latin1') === '%PDF-');
  check('no Evidence page is added when there are no photos', countPages(buf) === 4);
}

console.log('\nWeeklyReportPdfTemplate — evidence-rich model renders and adds an Evidence page');
{
  const model = buildModel({ ...REPORT, photos: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg'] });
  const evidenceItems = model.evidence.photos.map((path, i) => ({ path, url: TINY_PNG_DATA_URI, caption: `Photo ${i + 1}` }));
  const buf = await toBuffer(WeeklyReportPdfTemplate(model, evidenceItems));
  check('evidence-rich document renders a valid PDF', buf.slice(0, 5).toString('latin1') === '%PDF-');
  check('an Evidence page is present when photos exist', countPages(buf) === 5);
}

console.log('\nWeeklyReportPdfTemplate — missing optional data does not crash rendering');
{
  const bareReport = { id: 'r-bare', reportingDate: '2026-07-14' };
  const orchestrated = runOpenDayOrchestrator({ project: PROJECT, contractorReports: [bareReport], siteVisits: [] }, { calculatedAt: CALC_AT });
  const model = buildWeeklyReportExportModel({ project: PROJECT, report: bareReport, projectReports: [bareReport], canonicalResult: orchestrated, generatedAt: CALC_AT });
  const buf = await toBuffer(WeeklyReportPdfTemplate(model, []));
  check('a report with no risks/upcoming-work/photos still renders a valid PDF', buf.slice(0, 5).toString('latin1') === '%PDF-');
}

console.log('\nWeeklyReportPdfTemplate — no report selected at all does not crash rendering');
{
  const model = buildWeeklyReportExportModel({ project: PROJECT, report: null, canonicalResult: null, generatedAt: CALC_AT });
  const buf = await toBuffer(WeeklyReportPdfTemplate(model, []));
  check('a model with no selected report still renders a valid PDF', buf.slice(0, 5).toString('latin1') === '%PDF-');
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
