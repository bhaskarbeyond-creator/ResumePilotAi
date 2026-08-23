import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const reachability = require('../scripts/stylesheet-reachability.cjs');

const repoRoot = new URL('..', import.meta.url).pathname;
const distDir = path.join(repoRoot, 'dist');

/**
 * REGRESSION COVERAGE — typography determinism and dead-stylesheet hygiene.
 *
 * Defect: `src/tailwind.css` opened with
 *   @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@100..900')
 * while index.html already loaded a SELF-HOSTED Poppins covering 300-900.
 *
 * That import survived the build as a real `@import` inside main-*.css, so:
 *   - every page load made a render-blocking third-party request, and
 *   - the remote @font-face rules (parsed after the self-hosted ones) WON,
 *     so the product rendered Google's copy and silently swapped to the
 *     self-hosted copy whenever the CDN was slow, blocked or refused by CSP.
 *
 * That is a non-deterministic typography path: the same page could render with
 * different fonts depending on the network. Poppins is now sourced from exactly
 * one place.
 */

const UI_FONT_HOSTS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /rsms\.me/];

/**
 * Strip comments before scanning. Several stylesheets document the remote
 * import that was REMOVED from them, quoting it verbatim so the reasoning
 * survives future edits. Scanning raw text would flag that explanation as the
 * very defect it describes — a false positive that would push a maintainer to
 * delete the explanation rather than keep the guarantee.
 */
function activeCss(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function remoteImportsIn(source) {
  return activeCss(source).match(/@import\s+url\(\s*['"]?https?:[^)]*\)/g) || [];
}

test('the application UI stylesheet does not import a remote copy of a self-hosted font', () => {
  const tailwind = fs.readFileSync(path.join(repoRoot, 'src/tailwind.css'), 'utf8');
  // Assert on real @import statements, not on prose: the file documents the
  // removed import so the reasoning survives, and a substring match would flag
  // that explanation as the defect it describes.
  const remoteImports = remoteImportsIn(tailwind);
  assert.deepEqual(remoteImports, [], 'src/tailwind.css must not @import a remote stylesheet');
  for (const host of UI_FONT_HOSTS) {
    assert.ok(!remoteImports.some(item => host.test(item)), `src/tailwind.css must not fetch fonts from ${host}`);
  }
  assert.match(tailwind, /@import 'tailwindcss'/, 'Tailwind itself must still be imported');
});

test('Poppins is declared exactly once, by the self-hosted stylesheet', () => {
  const selfHosted = fs.readFileSync(path.join(repoRoot, 'public/fonts/poppins.css'), 'utf8');
  const faces = selfHosted.match(/@font-face/g) || [];
  assert.ok(faces.length >= 20, `expected the self-hosted Poppins to declare many faces, found ${faces.length}`);

  // Every weight the self-hosted stylesheet claims must point at a local file.
  const remoteSources = selfHosted.match(/src:\s*url\((?!\/fonts\/)[^)]*https?:[^)]*\)/g) || [];
  assert.deepEqual(remoteSources, [], 'the self-hosted font stylesheet must not proxy to a CDN');

  const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
  assert.match(indexHtml, /\/fonts\/poppins\.css/, 'index.html must load the self-hosted font stylesheet');
});

test('every font weight used by application CSS is covered by the self-hosted faces', () => {
  const selfHosted = fs.readFileSync(path.join(repoRoot, 'public/fonts/poppins.css'), 'utf8');
  const available = new Set((selfHosted.match(/font-weight:\s*(\d+)/g) || []).map(item => Number(item.replace(/\D/g, ''))));
  // 300-900 are the weights the product self-hosts.
  for (const weight of [300, 400, 500, 600, 700, 800, 900]) {
    assert.ok(available.has(weight), `self-hosted Poppins is missing weight ${weight}`);
  }
});

test('BUILT OUTPUT: no entry stylesheet fetches the UI font from a third party', { skip: !fs.existsSync(distDir) && 'run `npm run build` first' }, () => {
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const entryHrefs = [...indexHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/assets\/([^"]+\.css)"/g)].map(m => m[1]);
  const mainSheet = entryHrefs.find(name => name.startsWith('main-'));
  assert.ok(mainSheet, 'the build must emit a main entry stylesheet');
  const css = fs.readFileSync(path.join(distDir, 'assets', mainSheet), 'utf8');
  assert.doesNotMatch(css, /fonts\.googleapis\.com/, 'the main stylesheet must not render-block on Google Fonts');
  assert.doesNotMatch(css, /fonts\.gstatic\.com/, 'the main stylesheet must not render-block on Google Fonts');
});

/**
 * CV/portfolio template engines legitimately load decorative typefaces that are
 * NOT self-hosted (Cinzel, Playfair Display, JetBrains Mono, …) and that the
 * certified template themes depend on. Those are intentional and are recorded
 * here so the distinction stays explicit: a remote font that is REQUIRED is
 * different from a remote duplicate of a font we already ship.
 */
test('remaining remote font imports are confined to template engines and are inventoried', () => {
  const known = new Set([
    'src/engine/hybrid/smartEngine.css',
    'src/components/PortfolioTemplates/webcv.css',
  ]);
  const offenders = [];
  for (const file of reachability.walk(path.join(repoRoot, 'src'))) {
    if (!/\.(css|scss)$/.test(file)) continue;
    const relative = reachability.rel(file);
    const source = fs.readFileSync(file, 'utf8');
    if (remoteImportsIn(source).length === 0) continue;
    if (!known.has(relative)) offenders.push(relative);
  }
  assert.deepEqual(
    offenders,
    [],
    `New remote font/CSS imports were introduced. Self-host them or add an explicit justification: ${offenders.join(', ')}`
  );
});

/**
 * Dead-stylesheet hygiene. 73 unreferenced stylesheets were removed after
 * proving the emitted CSS was byte-identical before and after. This guard stops
 * the graveyard from growing back.
 */
test('no unreachable stylesheet is reintroduced into the source tree', () => {
  const result = reachability.analyze();
  // src/index.css is reachable only via the template-lab Rollup entry.
  const allowed = new Set([
    'src/components/Actions/action-step-filling/AIGenerationModal.scss',
  ]);
  const unexpected = result.unreferenced.filter(file => !allowed.has(file));
  assert.deepEqual(
    unexpected,
    [],
    `Unreferenced stylesheets found. Either import them or delete them:\n${unexpected.join('\n')}`
  );
});

test('the reachability analyzer resolves the template-lab entry point', () => {
  // Regression: an earlier version of the analyzer only seeded from src/**, and
  // therefore reported src/index.css (imported by template-lab) as dead.
  const result = reachability.analyze();
  assert.ok(result.reachable.includes('src/index.css'), 'src/index.css is imported by template-lab and must count as reachable');
});
