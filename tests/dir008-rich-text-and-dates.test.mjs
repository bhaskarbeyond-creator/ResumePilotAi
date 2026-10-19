/**
 * DIR-008 — rich text safety and optional-field formatting (R-31, R-32, R-43, R-11).
 *
 * Every resume body is rendered through `dangerouslySetInnerHTML`, so the
 * sanitizer is part of the security boundary, not a nicety. These vectors are
 * the ones a Lexical editor or an API client could realistically deliver.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;

const FRONTEND = path.join(process.cwd(), 'frontend');
const vite = await createServer({
  root: FRONTEND,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
after(async () => { await vite.close(); });

const { sanitizeRichText, containsHtml } = await vite.ssrLoadModule('/src/lib/rich-text.ts');
const { formatDateRange, hasDateRange } = await vite.ssrLoadModule('/src/lib/resume-format.ts');

test('scripts, event handlers, embeds and inline styles never survive sanitisation', () => {
  const vectors = [
    '<script>alert(1)</script><p>ok</p>',
    '<p onclick="steal()">text</p>',
    '<img src=x onerror="alert(1)">',
    '<iframe src="https://evil.example"></iframe><p>after</p>',
    '<svg onload="alert(1)"></svg>',
    '<p style="position:fixed;inset:0">overlay</p>',
    '<a href="javascript:alert(1)">click</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">data</a>',
    '<a href="vbscript:msgbox(1)">vb</a>',
  ];
  for (const vector of vectors) {
    const clean = sanitizeRichText(vector);
    assert.doesNotMatch(clean, /<script|<iframe|<img|<svg|onerror|onclick|javascript:|vbscript:|data:text|style=/i, `unsafe output for ${vector}`);
  }
});

test('formatting tags survive and Lexical paragraph classes are preserved', () => {
  const html = '<p class="editor-paragraph"><strong>Led</strong> <em>reliability</em></p><ul><li>One</li></ul>';
  const clean = sanitizeRichText(html);
  assert.match(clean, /<strong>Led<\/strong>/);
  assert.match(clean, /<em>reliability<\/em>/);
  assert.match(clean, /<ul><li>One<\/li><\/ul>/);
  assert.match(clean, /class="editor-paragraph"/);
});

test('safe links open in a new context with noopener noreferrer', () => {
  const clean = sanitizeRichText('<a href="https://example.com/portfolio">Portfolio</a>');
  assert.match(clean, /href="https:\/\/example\.com\/portfolio"/);
  assert.match(clean, /target="_blank"/);
  assert.match(clean, /rel="noopener noreferrer"/);

  const mail = sanitizeRichText('<a href="mailto:asha@example.com">Mail</a>');
  assert.match(mail, /href="mailto:asha@example\.com"/);

  const unsafe = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
  assert.doesNotMatch(unsafe, /href=/);
  assert.doesNotMatch(unsafe, /target=/);
});

test('plain text is detected as text, not routed through an HTML sink', () => {
  assert.equal(containsHtml('Platform engineer with 9 years'), false);
  assert.equal(containsHtml('1 < 2 and 3 > 2'), false);
  assert.equal(containsHtml('<p>Engineer</p>'), true);
  assert.equal(sanitizeRichText(''), '');
});

test('date ranges never print undefined and keep a single nowrap token', () => {
  assert.equal(formatDateRange('2021-04', '2024-08'), '2021-04 – 2024-08');
  assert.equal(formatDateRange('2021-04', '', true), '2021-04 – Present');
  assert.equal(formatDateRange('2021-04', 'Present'), '2021-04 – Present');
  assert.equal(formatDateRange('2021-04', undefined), '2021-04');
  assert.equal(formatDateRange(undefined, '2024-08'), '2024-08');
  assert.equal(formatDateRange(undefined, undefined), '');
  assert.equal(formatDateRange('undefined', 'null'), '');
  assert.equal(formatDateRange('2020', '2020'), '2020');
  assert.equal(hasDateRange(undefined, undefined), false);
  assert.equal(hasDateRange('2020', '2021'), true);
});

test('renderers consume the shared formatter instead of concatenating raw dates', () => {
  const primitives = fs.readFileSync(path.join(FRONTEND, 'src/components/resume/smart-render-primitives.tsx'), 'utf8');
  const families = fs.readFileSync(path.join(FRONTEND, 'src/components/resume/smart-layout-families.tsx'), 'utf8');
  assert.doesNotMatch(primitives, /startDate\} – \{/, 'raw date concatenation remains');
  assert.doesNotMatch(families, /\{edu\.startDate\}\s*\{edu\.endDate/, 'raw education date concatenation remains');
  assert.match(primitives, /const dateRange = formatDateRange/);
  assert.match(primitives, /ml-auto whitespace-nowrap/);
  assert.match(primitives, /sanitizeRichText/);
});
