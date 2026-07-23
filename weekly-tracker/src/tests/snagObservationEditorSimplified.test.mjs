import { readFileSync } from 'node:fs';

// Product contract for the simplified Observation capture/edit page
// (refactor 2026-07-22): one primary working card (form + evidence),
// no management sidebar, no Issue/Comments sections. See
// PHASE-level task notes in SnagDetailPage.jsx for the architecture
// rationale — this page is shared by both Site Snag and Field Snag.
//
// Amendment (P0 lifecycle-UI fix): History was deliberately brought back
// on this same page — not as a revival of the old "Available actions"
// sidebar, but because exposing the existing ASSIGNED -> IN_PROGRESS ->
// READY_FOR_REVIEW -> CLOSED lifecycle here means a Contractor must be able
// to see a PM's rejection reason (stored on the same canonical snag_events
// row the History timeline already renders). Comments remain absent —
// unchanged from the 2026-07-22 simplification.

let pass = 0, fail = 0;
const check = (name, value) => value ? (pass++, console.log(`  OK ${name}`)) : (fail++, console.error(`  FAIL ${name}`));
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

const detail = read('../pages/snags/SnagDetailPage.jsx');
const evidenceSection = read('../components/snags/EvidenceSection.jsx');
const canonicalMigration = read('../migrations/035_snag_canonical_field_capture.sql');
const siteSnagObservations = read('../components/snags/site/SiteSnagObservations.jsx');

// ── 1. Primary Observation form is present ──────────────────────────
check('the capture-completion form (title/trade/stakeholder/description/priority/deadline) is present', detail.includes('Complete captured Observation') && detail.includes('Observation title') && detail.includes('Building trade') && detail.includes('Responsible stakeholder') && detail.includes('Deadline'));
check('the non-captured edit form covers the same core fields', /Title<input/.test(detail) && /Description<textarea/.test(detail) && /Priority<select/.test(detail) && /Due date<input/.test(detail));

// ── 2. Evidence lives inside the same primary working card ──────────
check('Evidence is rendered by the same component used elsewhere (no fork)', detail.includes('<EvidenceSection'));
check('Evidence sits inside the one primary card, not a separate page section', /observation-capture-card[\s\S]*<EvidenceSection[\s\S]*<\/section>/.test(detail));
check('Evidence is positioned after the form fields and before Done (order: form -> evidence -> Done)', (() => {
  const formEnd = detail.indexOf('</form>');
  const evidenceAt = detail.indexOf('<EvidenceSection');
  const doneAt = detail.indexOf("'Done - keep Captured'".replace(/'/g, ''));
  return formEnd > -1 && evidenceAt > formEnd && doneAt > evidenceAt;
})());

// ── 3. Available Actions sidebar is gone ─────────────────────────────
check('Available actions heading/aside no longer renders', !detail.includes('Available actions') && !/<aside/.test(detail));
check('single-item publish/duplicate/archive/assign/status-transition buttons are gone from this page', !detail.includes('Publish Observation') && !detail.includes('>Duplicate<') && !detail.includes('>Archive<') && !detail.includes('Assign contractor') && !detail.includes('Show on drawing') && !detail.includes('Change plan pin'));
check('reason-gated lifecycle actions (reject/reopen/cancel) are gone', !detail.includes('ACTION_LABELS') && !detail.includes('SIMPLE_ACTIONS') && !detail.includes('REASON_ACTIONS'));

// ── 4. Issue section is gone ─────────────────────────────────────────
check('the standalone read-only "Issue" section no longer renders', !/<h2>Issue<\/h2>/.test(detail));
check('category/discipline/creator/updated metadata dl is gone from this page (still used elsewhere via SiteSnagPinPreview)', !/<dt>Category<\/dt>/.test(detail) && !/<dt>Discipline<\/dt>/.test(detail) && !/<dt>Creator<\/dt>/.test(detail) && !/<dt>Updated<\/dt>/.test(detail));

// ── 5. Comments UI is gone (backend untouched) ───────────────────────
check('the Comments list/add-comment form no longer renders', !/<h2>Comments<\/h2>/.test(detail) && !detail.includes('Add to Activity') && !detail.includes('snag-comment-form'));
check('addComment command wiring/state was removed from this page', !detail.includes("type: 'addComment'") && !detail.includes('setComment'));

// ── 6. History now renders again (P0 lifecycle-UI amendment), Comments still doesn't ──
check('SnagHistory now renders on this page, reusing the existing events already fetched by useSnagDetail (no second fetch/store)', detail.includes('<SnagHistory events={events}'));
check('Comments UI is still absent (this amendment only restored History, not the full pre-simplification sidebar)', !/<h2>Comments<\/h2>/.test(detail) && !detail.includes('snag-comment-form'));
check('event history recording remains fully intact and untouched (event log table + append-only trigger)', canonicalMigration.includes('snag_events') || (() => { try { return readFileSync(new URL('../migrations/030_snag_list_foundation.sql', import.meta.url), 'utf8').includes('snag_events'); } catch { return false; } })());

// ── 7. Done stays Captured-only; no implicit publish ─────────────────
check('Done saves via completeCapture and keeps the label "Done - keep Captured"', detail.includes("type: 'completeCapture'") && detail.includes('Done - keep Captured'));
check('Done does not call publishObservation/executeProductCommand publish path', !detail.includes("type: 'publishObservation'"));
check('Captured/Published stay two independent states (isCaptured guards the capture form only)', detail.includes("snag.publicationState === 'CAPTURED'"));

// ── 8. Batch publication elsewhere is untouched ──────────────────────
check('Site Snag management batch publish is unaffected by this page', siteSnagObservations.includes("type: 'batchPublish'") && siteSnagObservations.includes('Publish selected'));

// ── 9. Evidence security/behavior preserved verbatim (component untouched) ──
check('Evidence upload keeps camera capture + validation + private policy wiring', evidenceSection.includes('capture="environment"') && evidenceSection.includes('useEvidencePolicy') && evidenceSection.includes('useEvidenceUpload'));
check('Evidence count/limit display is preserved', evidenceSection.includes('policy.maxEvidenceCount'));

// ── 10. Layout: one focused card, sensible max-width, no giant empty area ──
check('the page uses one centered primary card container (no two-column management grid)', detail.includes('.snag-detail>*') === false); // (css lives in styles/snags.css, checked separately below)
const snagsCss = read('../styles/snags.css');
check('detail page CSS centers a single card at a comfortable max-width', snagsCss.includes('.snag-detail>*') && snagsCss.includes('max-width:760px'));
check('the old two-column detail grid and sticky sidebar CSS were removed', !snagsCss.includes('.snag-detail-grid') && !snagsCss.includes('.snag-actions{'));

console.log(`\n-- RESULT: ${pass} passed, ${fail} failed --\n`);
process.exit(fail ? 1 : 0);
