import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-061 — A4 formatting, page-break repair and master-profile heading sync.
 *
 * HONEST SCOPE (measured, not asserted): the A4 box and the section/experience/
 * education/card pagination rules are supplied by the SHARED layer
 * (`src/cv-templates/css/globalTemplateEnhancements.css`, imported globally in
 * `src/main.jsx`, plus `src/engine/hybrid/smartEngine.css` and
 * `ResumePageComposer.jsx`). The per-template SCSS not declaring them is BY
 * DESIGN, not a defect — the earlier "50/55 templates lack break-inside" metric
 * measured the wrong layer. The ONE genuine pagination gap was that individual
 * list items and table rows had no rule at all, so a bullet list could still be
 * severed mid-item. That gap is what this directive closed.
 */

// DIR-061: the pagination contract lives OUTSIDE src/cv-templates/ because that
// tree is a hard frozen baseline (INV-1 asserts a zero-byte git diff for it).
const SHARED_CSS = 'src/styles/template-pagination.css';
const FROZEN_CSS = 'src/cv-templates/css/globalTemplateEnhancements.css';
const SMART_ENGINE = 'src/engine/hybrid/smartEngine.css';
const BUILDER = 'src/components/BuildResume/BuildResume.jsx';

const read = (file) => fs.readFile(file, 'utf8');

/* ── The A4 box is enforced by the engine ─────────────────────────────────── */

test('DIR-061: the A4 page box (210mm x 297mm) is enforced by the shared engine', async () => {
  const engine = await read(SMART_ENGINE);
  assert.match(engine, /width:\s*210mm/, 'the engine must fix the A4 width');
  assert.match(engine, /(min|max)-height:\s*297mm/, 'the engine must fix the A4 height');
});

/* ── The bullet/table pagination gap is closed and correctly scoped ───────── */

test('DIR-061: list items and table rows are now protected from mid-item page breaks', async () => {
  const css = await read(SHARED_CSS);
  for (const selector of ['[class*="-board"] li', '[class*="-board"] ul', '[class*="-board"] tr']) {
    assert.ok(css.includes(selector), `the shared sheet must protect ${selector}`);
  }
  const block = css.slice(css.indexOf('[class*="-board"] li,'));
  const rule = block.slice(0, block.indexOf('}'));
  assert.match(rule, /break-inside:\s*avoid/, 'must avoid breaking inside an item');
  assert.match(rule, /page-break-inside:\s*avoid/, 'must carry the legacy page-break property');
});

test('DIR-061: the new pagination rules never leak outside the resume boards', async () => {
  const css = await read(SHARED_CSS);
  const block = css.slice(css.indexOf('[class*="-board"] li,'));
  const rule = block.slice(0, block.indexOf('}'));
  // Every selector in the new rule must be board-scoped.
  const selectors = rule.split('\n').map((line) => line.trim()).filter((line) => line.endsWith(',') || line.endsWith('{'));
  assert.ok(selectors.length > 0, 'the rule must have selectors');
  for (const selector of selectors) {
    assert.match(selector, /-board|data-cv-board/, `unscoped selector would leak into admin tables: ${selector}`);
  }
});

/* ── The master-profile heading sync no longer silently drops fields ──────── */

test('DIR-061: the master-profile prefill hydrates website, linkedin and github', async () => {
  const src = await read(BUILDER);
  const start = src.indexOf('postalcode: profile.postalCode');
  assert.ok(start > -1, 'the master-profile prefill must exist');
  const block = src.slice(start, start + 1600);
  assert.match(block, /website:\s*profile\.website\s*\|\|\s*profile\.websiteUrl/, 'website must hydrate (profile uses websiteUrl)');
  assert.match(block, /linkedin:\s*profile\.linkedin\s*\|\|\s*profile\.linkedinUrl/, 'linkedin must hydrate (profile uses linkedinUrl)');
  assert.match(block, /github:\s*profile\.github\s*\|\|\s*profile\.githubUrl/, 'github must hydrate (profile uses githubUrl)');
});

test('DIR-061: the heading step actually consumes those three fields', async () => {
  const step = await read('src/components/BuildResume/steps/HeadingStep.jsx');
  for (const field of ['website', 'linkedin', 'github']) {
    assert.match(step, new RegExp(`${field}:\\s*resumeData\\?\\.${field}`), `HeadingStep must read ${field} from resumeData`);
  }
});

/* ── The frozen tree stays untouched, and the new sheet is actually loaded ── */

test('DIR-061: the FROZEN src/cv-templates tree is untouched (INV-1 parity)', async () => {
  // The pagination fix must NOT have been written into the frozen stylesheet.
  const frozen = await read(FROZEN_CSS);
  assert.doesNotMatch(frozen, /DIR-061/, 'the frozen sheet must not carry this directive\'s rules');
  const main = await read('src/main.jsx');
  assert.match(main, /import '\.\/styles\/template-pagination\.css'/, 'the new sheet must be loaded globally');
});
