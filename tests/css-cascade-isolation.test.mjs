import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const analyzer = require('../scripts/css-cascade-analyzer.cjs');

const repoRoot = new URL('..', import.meta.url).pathname;
const distDir = path.join(repoRoot, 'dist');

/**
 * REGRESSION COVERAGE — CSS cascade / hard-reload dependency
 *
 * Symptom under audit: pages rendered incorrectly during normal SPA navigation
 * and became correct only after a hard reload.
 *
 * Root cause: route stylesheets ship in lazily loaded chunks whose <link>
 * elements are appended to <head> in first-visit order. Two chunks declaring
 * the same selector with different values therefore rendered differently
 * depending on navigation history; a hard reload loaded a smaller, different
 * set of stylesheets and appeared to "fix" it.
 *
 * Invariant asserted here: no two independently loadable stylesheets set the
 * same property on the same selector to different values. When that holds,
 * cascade order cannot influence the rendered result, so SPA navigation, deep
 * links, back/forward and reload are provably equivalent.
 */

function loadSheet(name, filePath) {
  const css = fs.readFileSync(filePath, 'utf8');
  return { name, css, selectors: analyzer.selectorMap(css), customProperties: analyzer.globalCustomProperties(css) };
}

test('analyzer detects a real order-dependent collision (guard is not vacuous)', () => {
  const a = { name: 'a.css', css: '', selectors: new Map([['.editor-input', 'margin:6px 0;padding-left:16px']]), customProperties: new Map() };
  const b = { name: 'b.css', css: '', selectors: new Map([['.editor-input', 'margin:0.5em 0;padding-left:1.2em']]), customProperties: new Map() };
  const conflicts = analyzer.findOrderDependentConflicts([a, b]);
  assert.equal(conflicts.length, 1, 'a genuine same-selector/different-value collision must be reported');
  assert.deepEqual(conflicts[0].properties.sort(), ['margin', 'padding-left']);
});

test('analyzer detects conflicting global design tokens', () => {
  const a = { name: 'a.css', css: '', selectors: new Map(), customProperties: new Map([['--primary', '#111']]) };
  const b = { name: 'b.css', css: '', selectors: new Map(), customProperties: new Map([['--primary', '#eee']]) };
  assert.equal(analyzer.findOrderDependentConflicts([a, b]).length, 1);
});

test('analyzer ignores order-safe constructs (keyframes and disjoint :root additions)', () => {
  const a = loadSheetFromString('a.css', '@keyframes spin { from { opacity: 0 } to { opacity: 1 } } :root { --ep-brand: #111 }');
  const b = loadSheetFromString('b.css', '@keyframes fade { from { opacity: 1 } to { opacity: 0 } } :root { --puck-brand: #eee }');
  assert.deepEqual(analyzer.findOrderDependentConflicts([a, b]), []);
});

function loadSheetFromString(name, css) {
  return { name, css, selectors: analyzer.selectorMap(css), customProperties: analyzer.globalCustomProperties(css) };
}

test('the two rich-text editors no longer share global selectors', () => {
  const builder = loadSheet('RichTextEditor.css', path.join(repoRoot, 'src/components/BuildResume/steps/components/RichTextEditor.css'));
  const form = loadSheet('LexicalStyles.css', path.join(repoRoot, 'src/components/Form/simple-textarea/LexicalStyles.css'));
  const conflicts = analyzer.findOrderDependentConflicts([builder, form]);
  assert.deepEqual(conflicts, [], `editor stylesheets must not collide: ${JSON.stringify(conflicts)}`);

  // Every rule must carry its owning scope so the two chunks are inert on each
  // other's markup regardless of which route loaded first.
  for (const sheet of [builder, form]) {
    const scope = sheet.name === 'RichTextEditor.css' ? '.rpa-editor-builder' : '.rpa-editor-form';
    for (const selector of sheet.selectors.keys()) {
      const bare = selector.includes('::') ? selector.split('::').pop().trim() : selector;
      assert.ok(bare.startsWith(scope), `${sheet.name} rule "${bare}" is not scoped to ${scope}`);
    }
  }
});

test('the editor components apply their style-ownership scope', () => {
  const builderJsx = fs.readFileSync(path.join(repoRoot, 'src/components/BuildResume/steps/components/RichTextEditor.jsx'), 'utf8');
  const formJsx = fs.readFileSync(path.join(repoRoot, 'src/components/Form/simple-textarea/SimpleTextarea.jsx'), 'utf8');
  assert.match(builderJsx, /rpa-editor-builder/, 'RichTextEditor must render its scope class or its stylesheet is dead');
  assert.match(formJsx, /rpa-editor-form/, 'SimpleTextarea must render its scope class or its stylesheet is dead');
});

test('template and enterprise stylesheets do not leak bare global element rules', () => {
  const cv4 = fs.readFileSync(path.join(repoRoot, 'src/cv-templates/cv4/Cv4.scss'), 'utf8');
  // A bare `p { ... }` in a template chunk restyled every route in the app the
  // moment that template was previewed, and only a hard reload cleared it.
  assert.doesNotMatch(cv4, /^p\s*\{/m, 'Cv4.scss must not declare an unscoped global paragraph rule');
  assert.match(cv4, /\.cv4-board p\s*\{/, 'the paragraph rule must remain, scoped to the template board');

  const enterprise = fs.readFileSync(path.join(repoRoot, 'src/enterprise/enterprise.css'), 'utf8');
  assert.doesNotMatch(enterprise, /^\.sr-only\s*\{/m, 'Enterprise must not redefine the global .sr-only utility for every surface');
});

test('BUILT OUTPUT: no lazily loaded stylesheet pair is order-dependent', { skip: !fs.existsSync(distDir) && 'run `npm run build` first' }, () => {
  const sheets = analyzer.readBuiltStylesheets(distDir);
  assert.ok(sheets, 'dist/assets must exist');
  assert.ok(sheets.entry.length > 0, 'index.html must reference at least one deterministic entry stylesheet');
  assert.ok(sheets.lazy.length > 0, 'the build must produce route-level stylesheet chunks');

  const conflicts = analyzer.findOrderDependentConflicts(sheets.lazy);
  const summary = conflicts.slice(0, 20).map(c => `${c.a} <-> ${c.b} :: ${c.selector} [${c.properties.join(', ')}]`);
  assert.deepEqual(
    conflicts,
    [],
    `Route stylesheets must not depend on load order. Navigation-order-dependent collisions found:\n${summary.join('\n')}`
  );
});

test('BUILT OUTPUT: entry stylesheets load before any route chunk and are stably hashed', { skip: !fs.existsSync(distDir) && 'run `npm run build` first' }, () => {
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const hrefs = [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(hrefs.length > 0, 'the document must ship its global stylesheets in the HTML, not only via JS');

  for (const href of hrefs) {
    // Content-hashed filenames are what makes long-lived asset caching safe and
    // prevent a release-A document from pairing with release-B CSS.
    assert.match(href, /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.css$/, `${href} must be content-hashed`);
    assert.ok(fs.existsSync(path.join(distDir, href.replace(/^\//, ''))), `${href} referenced by index.html must exist in the build`);
  }

  // The document itself must not be cached, otherwise a stale index.html can
  // reference asset hashes that no longer exist after a deploy.
  assert.match(indexHtml, /http-equiv="Cache-Control"[^>]*no-store/i, 'index.html must declare a no-store cache policy');
});

test('BUILT OUTPUT: every hashed asset referenced by the document exists (no release skew)', { skip: !fs.existsSync(distDir) && 'run `npm run build` first' }, () => {
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const refs = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length > 0);
  const missing = refs.filter(ref => !fs.existsSync(path.join(distDir, ref.replace(/^\//, ''))));
  assert.deepEqual(missing, [], `index.html references assets absent from the build: ${missing.join(', ')}`);
});

test('no service worker is registered, so stale assets cannot be served from CacheStorage', () => {
  const serviceWorker = fs.readFileSync(path.join(repoRoot, 'src/serviceWorker.js'), 'utf8');
  const main = fs.readFileSync(path.join(repoRoot, 'src/main.jsx'), 'utf8');
  assert.match(serviceWorker, /export function register\(\)\s*\{\s*\}/, 'registration must remain a no-op until an auth-safe caching strategy exists');
  assert.match(serviceWorker, /registration\.unregister\(\)/, 'legacy registrations must be actively removed');
  assert.match(main, /serviceWorker\.unregister\(\)/, 'the entry point must unregister legacy service workers');
  assert.doesNotMatch(serviceWorker, /caches\.open|workbox/i, 'no CacheStorage strategy may be introduced without an audit');
});
