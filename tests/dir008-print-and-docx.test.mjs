/**
 * DIR-008 — print, PDF-view and DOCX parity (R-28…R-30, R-46).
 *
 * One document engine must feed the preview, the print/PDF view and the Word
 * export. This suite pins:
 *   - true A4 print geometry with the app chrome hidden and no clipping;
 *   - the export/preview/shared surfaces all rendering `SmartResumeDocument`;
 *   - a real DOCX (valid OOXML zip) containing the resume text, with rich text
 *     flattened rather than leaking tags into Word;
 *   - empty rich text producing no phantom headings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const css = read('frontend/src/index.css');
const exportPage = read('frontend/src/pages/export/cv-renderer.tsx');
const previewModal = read('frontend/src/components/ui/preview-modal.tsx');
const sharedView = read('frontend/src/pages/shared/resume-view.tsx');
const employerDrawer = read('frontend/src/components/employer/CandidateReviewDrawer.tsx');

test('print CSS is true A4 with chrome hidden and no clipping', () => {
  const printBlock = css.slice(css.indexOf('@media print'));
  assert.ok(printBlock.length > 0, 'no @media print block');
  assert.match(printBlock, /@page\s*\{[^}]*size:\s*A4/);
  assert.match(printBlock, /margin:\s*0/);
  assert.match(printBlock, /\.no-print\s*\{[^}]*display:\s*none/);
  assert.match(printBlock, /\.page-sheet\s*\{[^}]*width:\s*210mm/);
  assert.match(printBlock, /min-height:\s*297mm/);
  assert.match(printBlock, /break-after:\s*page/);
  assert.match(printBlock, /break-inside:\s*avoid/);
  assert.match(printBlock, /print-color-adjust:\s*exact/);
});

test('preview, shared view, employer view and export all use one document engine', () => {
  for (const [name, source] of Object.entries({ exportPage, previewModal, sharedView, employerDrawer })) {
    assert.match(source, /SmartResumeDocument/, `${name} does not use the production document renderer`);
  }
  // The export page must not re-implement template layouts.
  assert.doesNotMatch(exportPage, /function Cv\d+Template|const Cv\d+Template/);
  assert.match(exportPage, /normalizeResumeToDocument/);
  assert.match(exportPage, /tryGetTemplateMeta|getTemplateMeta/);
});

test('the print view hides its toolbar and prints only the document', () => {
  assert.match(exportPage, /no-print/);
  assert.match(exportPage, /id="printable-document"/);
  assert.match(exportPage, /window\.print\(\)/);
});

test('the DOCX export is a real OOXML package containing the resume', async () => {
  const { createResumeDocx } = require(path.join(ROOT, 'backend/services/docxExport.js'));
  const buffer = await createResumeDocx({
    template: 'Cv75',
    firstname: 'Asha',
    lastname: 'Rao',
    occupation: 'Principal Platform Engineer',
    email: 'asha@example.com',
    phone: '+91 90000 00000',
    summary: '<p>Platform engineer focused on <strong>reliability</strong>.</p>',
    employments: [{
      position: 'Staff Engineer',
      company: 'Meridian Bank',
      begin: '2021',
      end: 'Present',
      description: '<p>Led the ledger rebuild.</p>',
    }],
    skills: ['Kubernetes', 'Go'],
    educations: [{ degree: 'B.Tech', school: 'IIT Madras', started: '2011', finished: '2015' }],
  });

  assert.ok(Buffer.isBuffer(buffer), 'DOCX export did not return a buffer');
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK', 'not a zip/OOXML package');

  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file('word/document.xml').async('string');
  // Word splits text across runs; compare the extracted text, not raw XML.
  const documentText = documentXml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
  const haystack = documentText.toLowerCase();
  for (const needle of ['Asha', 'Rao', 'Principal Platform Engineer', 'Meridian Bank', 'Kubernetes']) {
    assert.ok(haystack.includes(needle.toLowerCase()), `DOCX lost "${needle}"`);
  }
  assert.doesNotMatch(documentXml, /<p class=|editor-paragraph|<\/?strong>/, 'HTML leaked into Word');
});

test('empty and whitespace-rich text never produces phantom DOCX headings', () => {
  const { parseRichTextToParagraphs, hasMeaningfulDocxText } = require(path.join(ROOT, 'backend/services/docxExport.js'));
  for (const value of ['', '   ', '<p> </p>', '<p>&nbsp;</p>', '\u200b', null, undefined]) {
    assert.equal(hasMeaningfulDocxText(value), false, JSON.stringify(value));
    assert.deepEqual(parseRichTextToParagraphs(value), [], JSON.stringify(value));
  }
  assert.equal(hasMeaningfulDocxText('<p>Real content</p>'), true);
});

test('DOCX export stays bounded for a long resume', { timeout: 60_000 }, async () => {
  const { createResumeDocx } = require(path.join(ROOT, 'backend/services/docxExport.js'));
  const buffer = await createResumeDocx({
    template: 'Cv100',
    firstname: 'Venkata Subrahmanya',
    lastname: 'Ravipudi-Chowdary-Naidu',
    occupation: 'Principal Platform & Site Reliability Engineer',
    summary: '<p>Reliable platforms — 信頼性, موثوقية.</p>',
    employments: Array.from({ length: 14 }, (_, i) => ({
      position: `Director of Engineering ${i + 1}`,
      company: `Multinational Corporation ${i + 1}`,
      begin: String(2004 + i),
      end: String(2005 + i),
      description: `<p>${'Delivered measurable outcomes across global teams. '.repeat(4)}</p>`,
    })),
    skills: Array.from({ length: 30 }, (_, i) => `Skill ${i + 1}`),
    certifications: Array.from({ length: 10 }, (_, i) => ({ title: `Certification ${i + 1}`, issuer: 'Institute', date: String(2010 + i) })),
  });
  assert.ok(buffer.length > 10_000, 'long DOCX is suspiciously small');
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK');
});
