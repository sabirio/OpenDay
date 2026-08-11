import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const check = (name, condition) => {
  if (condition) {
    pass += 1;
    console.log(`  OK ${name}`);
  } else {
    fail += 1;
    console.error(`  FAIL ${name}`);
  }
};
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const dashboard = read('../components/dashboard/DashboardProjectOverview.jsx');
const weekly = read('../pages/WeeklyReports.jsx');
const weeklyAttention = read('../components/weekly/ActionRequiredPanel.jsx');
const risk = read('../components/risk/RiskSelectedDetail.jsx');
const designSystem = read('../design-system.css');
const canonicalUi = read('../styles/canonical-ui.css');
const indexCss = read('../index.css');

const primitives = [
  ['AttentionSurface', read('../components/shared/detail/AttentionSurface.jsx')],
  ['AnalyticalSection', read('../components/shared/detail/AnalyticalSection.jsx')],
  ['MetadataRows', read('../components/shared/detail/MetadataRows.jsx')],
  ['EvidenceLedger', read('../components/shared/detail/EvidenceLedger.jsx')],
  ['EmptyState', read('../components/shared/detail/EmptyState.jsx')],
];

console.log('\nG1.6A shared detail-content primitive contracts');

for (const [name, source] of primitives) {
  check(`${name} exists as a domain-neutral shared component`, source.includes(`function ${name}`));
  check(`${name} does not import a domain engine`, !/from ['"].*\/(engines|hooks|data)\//.test(source));
}

check('AttentionSurface exposes tone, accessory, heading, and semantic element composition',
  /tone = 'attention'/.test(primitives[0][1]) && primitives[0][1].includes('accessory') && primitives[0][1].includes('aria-labelledby'));
check('AnalyticalSection exposes reusable ruled-section composition',
  primitives[1][1].includes("ruled = true") && primitives[1][1].includes('ds-section-heading'));
check('MetadataRows renders semantic dt/dd pairs',
  primitives[2][1].includes('<dl') && primitives[2][1].includes('<dt>') && primitives[2][1].includes('<dd>'));
check('EvidenceLedger renders semantic evidence entries and supports containment',
  primitives[3][1].includes('is-contained') && primitives[3][1].includes('ds-evidence-entry'));
check('EmptyState supports embedded and pane sizing without domain terminology',
  primitives[4][1].includes("size = 'embedded'") && !/(risk|report|project)/i.test(primitives[4][1]));

console.log('\nThree-consumer adoption');
check('Project Dashboard adopts all five shared detail primitives',
  ['AttentionSurface', 'AnalyticalSection', 'MetadataRows', 'EvidenceLedger', 'EmptyState'].every((name) => dashboard.includes(`<${name}`)));
check('Weekly Reports adopts shared attention, analytical section, evidence ledger, and empty state',
  weeklyAttention.includes('<AttentionSurface') && ['AnalyticalSection', 'EvidenceLedger', 'EmptyState'].every((name) => weekly.includes(`<${name}`)));
check('Risk Dashboard adopts all five shared detail primitives',
  ['AttentionSurface', 'AnalyticalSection', 'MetadataRows', 'EvidenceLedger', 'EmptyState'].every((name) => risk.includes(`<${name}`)));
check('Dashboard and Risk private DetailField/DetailSection implementations are removed',
  !dashboard.includes('function DetailField') && !dashboard.includes('function DetailSection') && !risk.includes('function DetailField') && !risk.includes('function DetailSection'));
check('Operational status grammar remains consumer-owned',
  dashboard.includes('dashboard-status-strip') && risk.includes('risk-operational-strip'));

console.log('\nCSS ownership and responsive contracts');
for (const selector of ['.ds-attention-surface', '.ds-analytical-section', '.ds-metadata-rows', '.ds-evidence-ledger', '.ds-empty-state']) {
  check(`${selector} is owned by design-system.css`, designSystem.includes(`${selector} {`) || designSystem.includes(`${selector},`));
}
check('canonical-ui.css owns the shared detail flow and spacing rhythm',
  canonicalUi.includes('.canonical-detail-flow') && canonicalUi.includes('.canonical-detail-flow.is-spaced'));
check('shared metadata and evidence layouts stack at the canonical mobile breakpoint',
  /@media \(max-width: 640px\)[\s\S]*\.ds-metadata-rows\.is-grid,[\s\S]*\.ds-evidence-ledger\.is-grid[\s\S]*grid-template-columns: 1fr/.test(designSystem));
check('index.css no longer owns page-specific attention surface geometry',
  !/\.weekly-action-panel\s*\{[\s\S]{0,180}(padding|border|background)/.test(indexCss)
    && !/\.risk-attention-surface\s*\{/.test(indexCss)
    && !/\.dashboard-page \.dashboard-needs-attention\s*\{[\s\S]{0,180}(padding|border|background)/.test(indexCss));
check('index.css no longer owns obsolete private detail-field selectors',
  !indexCss.includes('.dashboard-detail-field') && !indexCss.includes('.risk-detail-field'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
