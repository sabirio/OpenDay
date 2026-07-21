import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const check = (label, ok) => ok
  ? (pass++, console.log(`  OK ${label}`))
  : (fail++, console.error(`  FAIL ${label}`));

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(srcRoot, relative), 'utf8');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    entry.isDirectory() ? walk(full, out) : out.push(full);
  }
  return out;
}

const uiSource = walk(srcRoot)
  .filter(file => /\.(jsx|css)$/.test(file))
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

const formParts = read('components/contractor/FormParts.jsx');
check('field toggle groups expose pressed state', /aria-pressed=\{sel\}/.test(formParts));
check('field textareas have associated labels', /htmlFor=\{id\}/.test(formParts) && /id=\{id\}/.test(formParts));
check('field checkbox rows use a native button', /<button[\s\S]*role="checkbox"[\s\S]*aria-checked=\{active\}/.test(formParts));
check('field controls retain 44px touch targets', /minHeight:\s*44/.test(formParts));

const layout = read('components/Layout.jsx');
const sidebar = read('components/Sidebar.jsx');
const css = read('index.css');
check('mobile navigation returns focus to its trigger', /toggleRef\.current\?\.focus/.test(layout));
check('mobile navigation locks background scrolling while open', /document\.body\.style\.overflow\s*=\s*'hidden'/.test(layout));
check('mobile navigation is not focusable while off-canvas', /\.sidebar\s*\{[\s\S]*visibility:\s*hidden/.test(css) && /\.sidebar\.sidebar-open\s*\{[\s\S]*visibility:\s*visible/.test(css));
check('theme toggle has an accessible name', /aria-label=\{label\}/.test(sidebar));

check('UI contains no thick one-sided accent borders', !/borderLeft:\s*[`'"\s]*[3-9]px|border-left:\s*[3-9]px/i.test(uiSource));
check('UI contains no width-property transitions', !/transition\s*:\s*[`'"]?width/i.test(uiSource));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail === 0 ? 0 : 1);
