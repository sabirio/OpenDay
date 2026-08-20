import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');
const pagesRoot = join(srcRoot, 'pages');
const sharedRoot = join(srcRoot, 'components', 'shared');
const read = path => readFileSync(path, 'utf8');

function filesUnder(directory, suffix, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) filesUnder(path, suffix, found);
    else if (path.endsWith(suffix)) found.push(path);
  }
  return found;
}

function exportedNames(source) {
  return [...source.matchAll(/export\s+(?:function|const)\s+([A-Za-z0-9_]+)/g)].map(match => match[1]);
}

const tokens = read(join(srcRoot, 'design-system.css'));
const tailwindBridge = read(join(srcRoot, 'index.css'));
const foundation = {
  ui: read(join(sharedRoot, 'UiPrimitives.jsx')),
  layout: read(join(sharedRoot, 'LayoutPrimitives.jsx')),
  patterns: read(join(sharedRoot, 'UiPatterns.jsx')),
  field: read(join(sharedRoot, 'FieldPrimitives.jsx')),
};
const pageFiles = filesUnder(pagesRoot, '.jsx');

// Design tokens -> semantic Tailwind/CSS-variable bridge.
for (const token of [
  '--bg-page', '--bg-surface', '--text-primary', '--text-secondary', '--border',
  '--accent', '--status-done', '--space-4', '--radius-lg', '--control-height-md',
  '--field-bg-contractor', '--field-text-heading', '--field-border',
]) assert.match(tokens, new RegExp(token), `Missing design token ${token}`);

for (const semanticToken of [
  '--color-ui-page', '--color-ui-surface', '--color-ui-border', '--color-ui-primary',
  '--color-ui-accent', '--radius-ui', '--shadow-ui', '--color-field-contractor-page',
  '--color-field-surface', '--color-field-primary', '--width-field', '--shadow-field',
]) assert.match(tailwindBridge, new RegExp(semanticToken), `Missing semantic Tailwind token ${semanticToken}`);

// Responsibility boundaries: these are deliberately separate layers, not one barrel/god-file.
const expectedExports = {
  ui: ['CONTROL_CLASS', 'TEXTAREA_CLASS', 'Surface', 'Button', 'Badge', 'Field', 'Eyebrow', 'ProgressBar'],
  layout: ['PageShell', 'PageHeader', 'SectionHeader'],
  patterns: ['DataTable', 'TableHead', 'EmptyState', 'LoadingState', 'ErrorState', 'InlineAlert', 'MetricCard'],
  field: ['FIELD_TEXTAREA_CLASS', 'FieldState', 'FieldPage', 'FieldContainer', 'FieldPageHeader', 'FieldPanel', 'FieldButton', 'FieldStatus', 'FieldLoading', 'FieldStickyActions', 'FieldAlert', 'FieldModalContent'],
};

for (const [layer, expected] of Object.entries(expectedExports)) {
  assert.deepEqual(exportedNames(foundation[layer]).sort(), [...expected].sort(), `${layer} foundation exports drifted across responsibility boundaries`);
}

assert.doesNotMatch(foundation.ui, /PageShell|PageHeader|EmptyState|FieldPage/, 'UiPrimitives became a mixed-responsibility god-file');
assert.doesNotMatch(foundation.layout, /EmptyState|FieldPage|CONTROL_CLASS/, 'LayoutPrimitives owns non-layout responsibilities');
assert.doesNotMatch(foundation.patterns, /PageShell|FieldPage|CONTROL_CLASS/, 'UiPatterns owns shell or field responsibilities');
assert.doesNotMatch(foundation.field, /PageShell|DataTable|MetricCard/, 'FieldPrimitives owns application-layout responsibilities');
assert.match(foundation.layout, /from '.\/UiPrimitives\.jsx'/, 'Layout primitives must depend inward on UI primitives');
assert.match(foundation.patterns, /from '.\/UiPrimitives\.jsx'/, 'Reusable patterns must depend inward on UI primitives');

const allExports = Object.values(expectedExports).flat();
assert.equal(new Set(allExports).size, allExports.length, 'Foundation layers contain duplicate component exports');

for (const [layer, source] of Object.entries(foundation)) {
  assert.doesNotMatch(source, /from ['"][^'"]*(?:pages|domains|businessDevelopment)/, `${layer} foundation depends outward on a page or domain`);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${layer} foundation contains a literal color`);
}

// The canonical application geometry has one owner. Field geometry has its own explicit field primitive.
assert.match(foundation.layout, /max-w-screen-2xl/);
assert.match(foundation.layout, /max-w-6xl/);
assert.match(foundation.layout, /max-w-3xl/);
assert.match(foundation.layout, /gap-5 pb-10/);
assert.doesNotMatch(foundation.ui + foundation.patterns + foundation.field, /max-w-screen-2xl|max-w-6xl|max-w-3xl/, 'A second application page shell appeared outside LayoutPrimitives');
assert.match(foundation.field, /max-w-field/, 'Field workspace width must remain owned by FieldPrimitives');

const dynamicStyleAllowList = new Map([
  ['plans/PlanViewerPage.jsx', { count: 2, contracts: [/capturePosition\.left/, /position\.left/] }],
  ['snags/SnagDetailPage.jsx', { count: 1, contracts: [/--trade-color': selectedTrade\.color/] }],
]);

for (const path of pageFiles) {
  const source = read(path);
  const name = relative(pagesRoot, path).replaceAll('\\', '/');
  const dynamic = dynamicStyleAllowList.get(name) || { count: 0, contracts: [] };

  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${name} contains a page-level color literal`);
  assert.doesNotMatch(source, /var\(--(?:bg|text|border|accent|status|radius|shadow|space|control|field)[^)]+\)/, `${name} bypasses semantic tokens with a raw theme variable`);
  assert.equal((source.match(/\bstyle=\{/g) || []).length, dynamic.count, `${name} contains an unapproved inline style escape hatch`);
  for (const contract of dynamic.contracts) assert.match(source, contract, `${name} lost its documented runtime-style contract`);

  assert.doesNotMatch(source, /PageContainer/, `${name} uses the removed alternative page wrapper`);
  assert.doesNotMatch(source, /<PageShell[^>]*className=/, `${name} bypasses PageShell geometry through className`);
  assert.doesNotMatch(source, /className=["'`][^"'`]*mx-auto[^"'`]*max-w-|className=["'`][^"'`]*max-w-[^"'`]*mx-auto/, `${name} defines its own centered max-width page shell`);
  assert.doesNotMatch(source, /max-w-screen-2xl|max-w-6xl|max-w-3xl/, `${name} owns canonical page width instead of PageShell`);
  assert.doesNotMatch(source, /className=["'`](?=[^"'`]*rounded-ui)(?=[^"'`]*border)(?=[^"'`]*bg-ui-surface)[^"'`]*["'`]/, `${name} reconstructs Surface instead of using the shared primitive`);
  assert.doesNotMatch(source, /<button[^>]*className=["'`][^"'`]*rounded-ui/, `${name} reconstructs Button instead of using the shared primitive`);
  assert.doesNotMatch(source, /role=["']alert["'][^>]*className=["'`][^"'`]*rounded-ui/, `${name} reconstructs a state panel instead of using a shared pattern`);

  const arbitraryUtilities = [...source.matchAll(/\b([a-z-]+-\[[^\]]+\])/g)].map(match => match[1]);
  for (const utility of arbitraryUtilities) {
    assert.match(utility, /^(?:grid-cols|min-w)-\[/, `${name} contains unapproved arbitrary Tailwind utility ${utility}`);
  }
}

// Representative consumers prove the inward dependency chain while the full-page scan prevents bypasses.
const consumers = {
  'pages/BusinessDevelopment.jsx': ['LayoutPrimitives.jsx', 'UiPatterns.jsx', 'UiPrimitives.jsx'],
  'pages/TemplateEditor.jsx': ['LayoutPrimitives.jsx', 'UiPatterns.jsx'],
  'pages/PMScheduleReview.jsx': ['LayoutPrimitives.jsx', 'UiPatterns.jsx'],
  'pages/WeightAudit.jsx': ['LayoutPrimitives.jsx', 'UiPatterns.jsx', 'UiPrimitives.jsx'],
  'pages/ContractorSchedule.jsx': ['FieldPrimitives.jsx'],
  'pages/SiteVisitReport.jsx': ['FieldPrimitives.jsx'],
  'pages/AdminUsers.jsx': ['UiPrimitives.jsx', 'UiPatterns.jsx'],
  'pages/PlatformAdmin.jsx': ['UiPrimitives.jsx', 'UiPatterns.jsx'],
};

for (const [consumer, dependencies] of Object.entries(consumers)) {
  const source = read(join(srcRoot, consumer));
  for (const dependency of dependencies) assert.match(source, new RegExp(dependency.replace('.', '\\.')), `${consumer} bypasses ${dependency}`);
}

const businessShell = read(join(srcRoot, 'components', 'businessDevelopment', 'BusinessDevelopmentShell.jsx'));
assert.match(businessShell, /LayoutPrimitives\.jsx/);
assert.match(businessShell, /UiPatterns\.jsx/);
assert.match(businessShell, /UiPrimitives\.jsx/);
assert.doesNotMatch(businessShell, /var\(--|#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'Business Development shell became a second design system');

console.log('uiArchitectureSystem: certification guardrails passed');
