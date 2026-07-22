// exportEngineArchitectureGuard.test.mjs
// Guards the Export Engine's core promise: the PDF is a presentation layer
// over canonical domain data, not a screenshot of WeeklyReportsPage, and not
// hard-wired to it either. A future Site Snag PDF should only need
// buildSiteSnagExportModel() + a SiteSnagPdfTemplate — this test is what
// keeps that true by construction.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, '..'); // weekly-tracker/src/
const exportRoot = path.join(srcRoot, 'export');

function walk(dir, acc = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const exportFiles = walk(exportRoot)
  .filter(f => !f.endsWith('.test.mjs'))
  .map(f => ({ abs: f, rel: path.relative(srcRoot, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));

check('the Export Engine directory exists and has files', exportFiles.length > 0);

console.log('\nNo screenshot/print-DOM techniques in the Export Engine');
for (const { rel, text } of exportFiles) {
  check(`${rel} does not call window.print()`, !/window\.print\(/.test(text));
  check(`${rel} does not use html2canvas / dom-to-image style screen capture`, !/html2canvas|dom-to-image|domtoimage/i.test(text));
}

console.log('\nExport Engine is not coupled to WeeklyReportsPage internals');
for (const { rel, text } of exportFiles) {
  check(`${rel} does not import pages/WeeklyReports.jsx`, !/from ['"].*pages\/WeeklyReports/.test(text));
  check(`${rel} does not import a React hook module (useX.js) or component (.jsx) from src/hooks or src/pages`, !/from ['"]\.\.\/\.\.\/(hooks|pages)\//.test(text));
}

console.log('\nEngine boundary: model builder and template consume only their own inputs');
{
  const modelBuilder = exportFiles.find(f => f.rel.endsWith('buildWeeklyReportExportModel.js'));
  check('buildWeeklyReportExportModel.js does not import React (it is a pure data function)', modelBuilder && !/from ['"]react['"]/.test(modelBuilder.text));
  check('buildWeeklyReportExportModel.js does not import Supabase/services directly (stays synchronous and testable)', modelBuilder && !/from ['"].*services\//.test(modelBuilder.text));

  const renderer = exportFiles.find(f => f.rel.endsWith('renderExportPdf.js'));
  check('renderExportPdf.js has no Weekly-Report-specific or Site-Snag-specific identifiers (generic renderer)', renderer && !/weeklyReport|WeeklyReport|siteSnag|SiteSnag/.test(renderer.text));

  const template = exportFiles.find(f => f.rel.endsWith('WeeklyReportPdfTemplate.js'));
  check('WeeklyReportPdfTemplate.js does not import Supabase/services (it only consumes a resolved model + evidence array)', template && !/from ['"].*services\//.test(template.text));
}

console.log('\nExport action is wired into Weekly Reports');
{
  const weeklyReportsPage = readFileSync(path.join(srcRoot, 'pages/WeeklyReports.jsx'), 'utf8');
  check('WeeklyReports.jsx renders the new export button component', /<WeeklyReportExportButton/.test(weeklyReportsPage));
  const buttonSrc = readFileSync(path.join(srcRoot, 'components/weekly/WeeklyReportExportButton.jsx'), 'utf8');
  check('the export button does not call window.print()', !/window\.print\(/.test(buttonSrc));
  check('the export button dynamically imports the Export Engine (lazy-loaded, not part of normal startup)', /import\(['"]\.\.\/\.\.\/export\//.test(buttonSrc));
}

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
