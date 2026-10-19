/**
 * DIR-008 — preview modal accessibility and export honesty (D-10 / R-33…R-36).
 *
 * Verified at source level because this environment has no browser binary
 * (Playwright launch is BLOCKED — documented in the audit). The assertions are
 * about semantics that regressions silently break: an accessible description,
 * labelled zoom/export controls, disabled actions for unsaved drafts, and no
 * fabricated identifiers or `alert()` error handling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const source = fs.readFileSync(
  path.join(ROOT, 'frontend/src/components/ui/preview-modal.tsx'),
  'utf8'
);

test('the dialog exposes an accessible description referenced by the dialog', () => {
  assert.match(source, /DialogDescription/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /id=\{descriptionId\}/);
});

test('zoom is clamped to 50–150% with labelled controls and a live readout', () => {
  assert.match(source, /Math\.max\(50, prev - 15\)/);
  assert.match(source, /Math\.min\(150, prev \+ 15\)/);
  assert.match(source, /aria-label="Zoom out"/);
  assert.match(source, /aria-label="Zoom in"/);
  assert.match(source, /aria-label="Reset zoom to 100 percent"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /disabled=\{zoom <= 50\}/);
  assert.match(source, /disabled=\{zoom >= 150\}/);
});

test('export and share actions are disabled for an unsaved draft instead of inventing an id', () => {
  assert.doesNotMatch(source, /res-alex-001/);
  assert.doesNotMatch(source, /resume\.id \|\| 'draft'/);
  assert.match(source, /const isSaved = Boolean\(resume\.id\)/);
  assert.match(source, /disabled=\{!isSaved\}/);
  assert.match(source, /Save this resume before exporting or sharing it/);
});

test('export failures are announced in the dialog, not thrown at the user with alert()', () => {
  assert.doesNotMatch(source, /\balert\(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Could not download the Word document/);
});

test('unknown template ids render an explicit unsupported state, not a silent fallback', () => {
  assert.match(source, /tryGetTemplateMeta/);
  assert.doesNotMatch(source, /getTemplateMeta\(/);
  assert.match(source, /Unsupported template layout/);
  assert.match(source, /Choose a supported/);
});

test('print and PDF use the dedicated A4 export route rather than printing the dashboard', () => {
  const printStart = source.indexOf('const handlePrint');
  const printEnd = source.indexOf('return (', printStart);
  const printFn = source.slice(printStart, printEnd > printStart ? printEnd : undefined);
  assert.match(printFn, /\/export\//);
  assert.doesNotMatch(printFn, /window\.print\(\)/);
  assert.match(source, /const exportUrl = `\/export\/\$\{encodeURIComponent\(currentTemplateId\)\}/);
});

test('the PDF hand-off opens the export page safely (noopener) and never with a placeholder id', () => {
  assert.match(source, /window\.open\(exportUrl, '_blank', 'noopener,noreferrer'\)/);
  assert.match(source, /if \(!resume\.id\) \{\s*setExportError\(unsavedHint\);/);
});
