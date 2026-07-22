// renderExportPdf.test.mjs — the generic renderer boundary, tested with a
// minimal document so this stays independent of any one template.
// downloadPdfBlob() is pure browser DOM glue (URL.createObjectURL/<a>
// click) — not covered here; verified manually/in-browser instead.

import React from 'react';
import { Document, Page, Text } from '@react-pdf/renderer';
import { renderPdfBlob } from './renderExportPdf.js';

let pass = 0, fail = 0;
function check(label, condition) {
  if (condition) { pass++; console.log(`  OK ${label}`); }
  else { fail++; console.error(`  FAIL ${label}`); }
}

console.log('\nrenderPdfBlob');

const doc = React.createElement(Document, {}, React.createElement(Page, {}, React.createElement(Text, {}, 'hello')));
const blob = await renderPdfBlob(doc);

check('returns a Blob', typeof blob.arrayBuffer === 'function' && typeof blob.size === 'number');
check('the Blob is a real, non-trivial PDF', blob.size > 100);
check('the Blob reports the PDF mime type', blob.type === 'application/pdf');

const buf = Buffer.from(await blob.arrayBuffer());
check('the Blob content starts with the PDF magic header', buf.slice(0, 5).toString('latin1') === '%PDF-');

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
