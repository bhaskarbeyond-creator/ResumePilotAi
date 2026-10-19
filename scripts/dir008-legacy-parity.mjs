#!/usr/bin/env node
/**
 * DIR-008 — legacy parity ledger (R-06/R-07/R-09/R-51).
 *
 * For every canonical legacy template Cv1…Cv51 this script records what the
 * repository can actually prove today:
 *
 *   • which legacy reference files exist (`src/cv-templates/cvN/`);
 *   • the identity palette the catalog publishes;
 *   • whether that palette is traceable to the legacy stylesheet, is only
 *     catalog-declared, or cannot be checked because no stylesheet exists;
 *   • the smart-renderer family the production engine mounts;
 *   • whether the template has been *restored* (geometry rebuilt from the
 *     legacy art and protected by an automated structural test) or merely
 *     *composed* from the typed family pool.
 *
 * Nothing in this file upgrades a template's status on its own: only the three
 * ids in `RESTORED` are allowed to report `RESTORED`, and each one is backed by
 * `tests/dir008-template-deep-dives.test.mjs`.
 *
 * Outputs:
 *   docs/templates/legacy-parity.json
 *   docs/templates/legacy-parity.md
 *
 * Usage: node scripts/dir008-legacy-parity.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'frontend');
const LEGACY = path.join(ROOT, 'src', 'cv-templates');
const OUT_JSON = path.join(ROOT, 'docs', 'templates', 'legacy-parity.json');
const OUT_MD = path.join(ROOT, 'docs', 'templates', 'legacy-parity.md');

const RESTORED = new Map([
  ['Cv1', 'tests/dir008-template-deep-dives.test.mjs — tinted banner, 2.5px #1e40af ring, labelled information rail, skill pills'],
  ['Cv25', 'tests/dir008-template-deep-dives.test.mjs — navy header, 4px #3d6485 ring, #f5f7fa rail, box/dot scales'],
  ['Cv34', 'tests/dir008-template-deep-dives.test.mjs — white header, 3-stop rule, 3px teal ring, percent meters'],
]);

// Neutrals carry no template identity, so they are ignored when deciding
// whether a catalog colour can be traced to the legacy stylesheet.
const NEUTRAL = new Set([
  'ffffff', '000000', 'f9f9f9', 'f5f5f5', 'fafafa', 'f8f8f8', 'f0f0f0', 'e0e0e0',
  'e5e5e5', 'eaeaea', 'eeeeee', 'e9ecef', 'f1f5f9', 'f8fafc', 'e2e8f0', 'f5f7fa',
  'eceff1', 'f6f7f9', 'f3f4f8', 'e6e9f0', 'edf6f9', 'f6f9fc', 'fcfcfc', 'f7f9fc',
  'f9fafb', 'f7fafc', 'eef0ff', 'e6fffa', 'e1e4e8', 'dfe6e9', 'f5e6ea', 'cbd5e0',
  'c0c0c0', 'a0a0a0', 'cccccc', 'c5c5c5', '64748b', '475569', '334155', '1e293b',
  '0f172a', '2d3748', '4b5563', '374151', '1f2937', '111827', '6b7280', '9ca3af',
  'd1d5db', '455a64', '607d8b', '37474f', '263238', '333333', '2c2c2c', '3b3b3b',
  '2d2d2d', '2e3846', '545dc9', '565d75', '4a5a5b', '5d6d7e', '3a506b', '1e2a3a',
  '2c3e50', '34495e', '1a202c', '4a5568', '666666', '555555', '5e5e5e', '242938',
  '1e1e2d', '232120',
]);

const vite = await createServer({ root: FRONTEND, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TEMPLATES } = await vite.ssrLoadModule('/src/lib/template-catalog.ts');
const { getLayoutSpec } = await vite.ssrLoadModule('/src/lib/template-layouts.ts');
await vite.close();

function paletteOf(source) {
  const counts = new Map();
  for (const match of source.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = match[1].toLowerCase();
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([hex]) => !NEUTRAL.has(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

const rows = [];
for (let index = 1; index <= 51; index += 1) {
  const id = `Cv${index}`;
  const meta = TEMPLATES.find((entry) => entry.id === id);
  if (!meta) throw new Error(`catalog is missing ${id}`);
  const spec = getLayoutSpec(id);
  const dir = path.join(LEGACY, `cv${index}`);
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    files = [];
  }
  const jsx = files.find((file) => file.endsWith('.jsx')) || null;
  const scss = files.find((file) => file.endsWith('.scss')) || null;
  const identity = scss ? paletteOf(await fs.readFile(path.join(dir, scss), 'utf8')) : [];

  const catalogColors = [meta.primary, meta.secondary, meta.accent]
    .filter(Boolean)
    .map((value) => value.replace('#', '').toLowerCase());
  const linked = identity.length > 0 && catalogColors.some((color) => identity.includes(color));
  const restored = RESTORED.has(id);

  let verdict;
  if (restored) verdict = 'RESTORED';
  else if (identity.length === 0) verdict = 'CATALOG_ONLY';
  else if (linked) verdict = 'PALETTE_LINKED';
  else verdict = 'PALETTE_DIVERGENT';

  rows.push({
    id,
    name: meta.name,
    legacySource: jsx ? `src/cv-templates/cv${index}/${jsx}` : null,
    legacyStylesheet: scss ? `src/cv-templates/cv${index}/${scss}` : null,
    legacyIdentityColors: identity.slice(0, 5),
    catalogPrimary: meta.primary,
    catalogSecondary: meta.secondary,
    catalogAccent: meta.accent || null,
    family: spec.family,
    aside: spec.aside,
    asideSections: spec.asideSections,
    mainOrder: spec.mainOrder,
    verdict,
    evidence: restored ? RESTORED.get(id) : null,
  });
}

const summary = rows.reduce((acc, row) => {
  acc[row.verdict] = (acc[row.verdict] || 0) + 1;
  return acc;
}, {});

const document = {
  generatedBy: 'scripts/dir008-legacy-parity.mjs',
  scope: 'Cv1…Cv51 (canonical legacy set)',
  catalogSize: 100,
  restoredIds: [...RESTORED.keys()],
  summary,
  note: 'A RESTORED row means the page geometry was rebuilt from the legacy art and is protected by an automated structural test. PALETTE_LINKED / PALETTE_DIVERGENT / CATALOG_ONLY rows render through a distinct typed family composer but have not been verified 1:1 against the legacy artwork; they must not be reported as legacy parity.',
  rows,
};

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, `${JSON.stringify(document, null, 2)}\n`);

const md = [];
md.push('# DIR-008 — Legacy template parity ledger (Cv1…Cv51)');
md.push('');
md.push(`Generated by \`${document.generatedBy}\`. Catalog size: ${document.catalogSize}; legacy scope: ${document.scope}.`);
md.push('');
md.push('## Verdicts');
md.push('');
md.push('| Verdict | Count | Meaning |');
md.push('| --- | --- | --- |');
md.push(`| RESTORED | ${summary.RESTORED || 0} | Geometry rebuilt from the legacy art and protected by an automated structural test. |`);
md.push(`| PALETTE_LINKED | ${summary.PALETTE_LINKED || 0} | Catalog palette is traceable to the legacy stylesheet; geometry is family-composed. |`);
md.push(`| PALETTE_DIVERGENT | ${summary.PALETTE_DIVERGENT || 0} | Catalog palette is not traceable to the legacy stylesheet; geometry is family-composed. |`);
md.push(`| CATALOG_ONLY | ${summary.CATALOG_ONLY || 0} | No dedicated legacy stylesheet exists to compare against. |`);
md.push('');
md.push(document.note);
md.push('');
md.push('## Per-template ledger');
md.push('');
md.push('| ID | Name | Family | Rail | Legacy identity colours | Catalog primary / secondary | Verdict |');
md.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  const identity = row.legacyIdentityColors.length > 0 ? row.legacyIdentityColors.map((hex) => `#${hex}`).join(', ') : '—';
  const rail = row.aside ? `${row.aside} (${row.asideSections.join(', ')})` : 'none';
  const catalog = `#${row.catalogPrimary.replace('#', '')} / #${row.catalogSecondary.replace('#', '')}`;
  md.push(`| ${row.id} | ${row.name} | ${row.family} | ${rail} | ${identity} | ${catalog} | ${row.verdict} |`);
}
md.push('');
md.push('## Restored deep dives');
md.push('');
for (const [id, evidence] of RESTORED) {
  const row = rows.find((entry) => entry.id === id);
  md.push(`* **${id}** — ${row.name}. Legacy identity: ${row.legacyIdentityColors.map((hex) => `#${hex}`).join(', ') || 'n/a'}. Evidence: ${evidence}.`);
}
md.push('');
md.push('## Open limitation');
md.push('');
md.push(`Only ${summary.RESTORED || 0} of the 51 canonical templates have been restored and verified 1:1 against legacy art.`);
md.push('The remaining templates render through the typed layout-family engine: their page geometry is structurally');
md.push('distinct and covered by the 100-template distinctness gate, but they are **not** claimed as legacy parity.');
md.push('Requirement R-51 therefore stays PARTIAL in the acceptance matrix until each remaining template has its own');
md.push('restoration evidence.');
md.push('');

await fs.writeFile(OUT_MD, `${md.join('\n')}\n`);

console.log(`legacy parity: ${rows.length} rows -> ${path.relative(ROOT, OUT_MD)}`);
console.log(`summary: ${JSON.stringify(summary)}`);
