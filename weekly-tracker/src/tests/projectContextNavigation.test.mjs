import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildProjectWorkspaceHref,
  resolveProjectReturnHref,
  resolveWorkspaceReturnHref,
} from '../hooks/useProjectReturnHref.js';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const projects = read('../pages/Projects.jsx');
const detail = read('../components/projects/ProjectDetailPane.jsx');
const navigation = read('../auth/rolePermissions.js');
const returnPages = [
  '../pages/ProjectCommercialSetup.jsx',
  '../pages/ProjectBoq.jsx',
  '../pages/ProjectTenderSetup.jsx',
  '../pages/ProjectBudget.jsx',
  '../pages/ProjectVariations.jsx',
  '../pages/ProjectPayments.jsx',
  '../pages/ProjectCloseout.jsx',
].map(read);

let passed = 0;
const check = (name, condition) => {
  assert.ok(condition, name);
  passed += 1;
  console.log(`  PASS ${name}`);
};

check('fallback return URL identifies the project and workspace tab',
  buildProjectWorkspaceHref(900100, 'commercial') === '/projects?project=900100&tab=commercial');
check('an exact Portfolio return URL is preserved',
  resolveProjectReturnHref('/projects?project=900100&tab=commercial&page=2&q=AA', 7, 'overview')
    === '/projects?project=900100&tab=commercial&page=2&q=AA');
check('external or unrelated return URLs are rejected',
  resolveProjectReturnHref('/tenders', 900100, 'tender') === '/projects?project=900100&tab=tender');
check('contractor workspace destinations remain authoritative while generic Portfolio links are upgraded',
  resolveWorkspaceReturnHref('/contractor-select', '/projects?project=900100&tab=commercial') === '/contractor-select'
    && resolveWorkspaceReturnHref('/projects', '/projects?project=900100&tab=commercial') === '/projects?project=900100&tab=commercial');
check('Portfolio reads and writes selection, tab, page, search, and filters through URL state',
  /useSearchParams/.test(projects)
    && /searchParams\.get\("project"\)/.test(projects)
    && /searchParams\.get\("tab"\)/.test(projects)
    && /next\.set\('page'/.test(projects)
    && /next\.set\('q'/.test(projects));
check('project detail actions carry the exact Portfolio return location',
  /const returnState = \{ returnTo:/.test(detail)
    && (detail.match(/state=\{returnState\}/g) || []).length >= 10);
check('every project commercial subpage resolves a project-aware Back link',
  returnPages.every(source => /useProjectReturnHref/.test(source)));
check('Budget Inbox is no longer a sidebar destination',
  !/\{ to: '\/budgets'/.test(navigation));

console.log(`\nProject context navigation: ${passed} passed, 0 failed`);
