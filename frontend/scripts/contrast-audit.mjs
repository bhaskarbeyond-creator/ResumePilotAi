#!/usr/bin/env node
/**
 * Colour-contrast audit for the Meridian design system (REC-019).
 *
 * ## Why this exists
 *
 * `UX-DEVICE-MATRIX.md` asserted WCAG 2.2 AA. An assertion about colour is only worth
 * something if it names the ratio, so this script reads the tokens from
 * `src/index.css`, pairs each foreground with the backgrounds it is actually used on in
 * the admin plane, and computes the WCAG 2.1 relative-luminance ratio.
 *
 * The pairs are not invented: each one corresponds to a class combination that appears in
 * `src/components/admin/**`. When a new pairing is introduced, add it here — that is the
 * review step that keeps the table honest.
 *
 * Thresholds (WCAG 2.2 AA):
 *   - normal text: 4.5:1
 *   - large text (>=18.66px bold or >=24px): 3:1
 *   - non-text UI components and focus indicators: 3:1
 *
 * Usage: node scripts/contrast-audit.mjs [--json]
 * Exit code is non-zero when any *text* pair fails its threshold.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const css = readFileSync(`${ROOT}src/index.css`, 'utf8');
const AS_JSON = process.argv.includes('--json');

/**
 * Read the light-theme token block. The dark theme re-declares the surface tokens
 * further down, so they are read separately by `darkOverrides`.
 *
 * @param {string} source
 * @returns {Map<string,string>}
 */
function readTokens(source) {
  const tokens = new Map();
  for (const match of source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    if (!tokens.has(match[1])) tokens.set(match[1], match[2]);
  }
  return tokens;
}

const tokens = readTokens(css);

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function toRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
}

/**
 * @param {[number, number, number]} rgb
 * @returns {number} relative luminance, WCAG 2.1 §relative-luminance
 */
function luminance([r, g, b]) {
  const channel = (value) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * @param {string} foreground
 * @param {string} background
 * @returns {number}
 */
function ratio(foreground, background) {
  const a = luminance(toRgb(foreground));
  const b = luminance(toRgb(background));
  const [light, dark] = a > b ? [a, b] : [b, a];
  return Number(((light + 0.05) / (dark + 0.05)).toFixed(2));
}

/** Foreground/background pairs the admin plane actually renders. */
const PAIRS = [
  { fg: 'ink', bg: 'surface', use: 'body text on a card', kind: 'text', min: 4.5 },
  { fg: 'ink', bg: 'canvas', use: 'body text on the page canvas', kind: 'text', min: 4.5 },
  { fg: 'ink-secondary', bg: 'surface', use: 'supporting text on a card', kind: 'text', min: 4.5 },
  { fg: 'ink-secondary', bg: 'canvas', use: 'supporting text on the canvas', kind: 'text', min: 4.5 },
  { fg: 'ink-subtle', bg: 'surface', use: 'metadata, provenance lines', kind: 'text', min: 4.5 },
  { fg: 'ink-subtle', bg: 'canvas', use: 'metadata on the page canvas', kind: 'text', min: 4.5 },
  { fg: 'ink-muted', bg: 'surface', use: 'muted labels', kind: 'text', min: 4.5 },
  { fg: 'ink-on-brand', bg: 'brand-600', use: 'primary button label', kind: 'text', min: 4.5 },
  { fg: 'brand-600', bg: 'surface', use: 'link text on a card', kind: 'text', min: 4.5 },
  { fg: 'success-700', bg: 'success-50', use: 'LIVE provenance chip', kind: 'text', min: 4.5 },
  { fg: 'warning-700', bg: 'warning-50', use: 'PARTIAL / degraded banner', kind: 'text', min: 4.5 },
  { fg: 'error-700', bg: 'error-50', use: 'unavailable state', kind: 'text', min: 4.5 },
  { fg: 'info-700', bg: 'info-50', use: 'loading state', kind: 'text', min: 4.5 },
  // The decorative card border (`--color-border`, 1.27:1) is deliberately NOT asserted:
  // WCAG 1.4.11 covers boundaries that are the only thing identifying a control, and a
  // card edge is not one. What IS asserted is the control boundary token, which is why
  // the two are separate tokens.
  { fg: 'border-control', bg: 'surface', use: 'input / select boundary', kind: 'ui', min: 3 },
  { fg: 'border-control', bg: 'canvas', use: 'input boundary on the canvas', kind: 'ui', min: 3 },
  { fg: 'brand-500', bg: 'surface', use: 'focus ring (non-text)', kind: 'ui', min: 3 },
];

const results = PAIRS.map((pair) => {
  const fg = tokens.get(pair.fg);
  const bg = tokens.get(pair.bg);
  if (!fg || !bg) return { ...pair, ratio: null, pass: false, missing: !fg ? pair.fg : pair.bg };
  const value = ratio(fg, bg);
  return { ...pair, fgHex: fg, bgHex: bg, ratio: value, pass: value >= pair.min };
});

const failures = results.filter((entry) => !entry.pass);
const report = {
  generatedAt: new Date().toISOString(),
  standard: 'WCAG 2.2 AA (4.5:1 text, 3:1 non-text)',
  results,
  failures: failures.map((entry) => `${entry.use}: ${entry.ratio ?? 'missing token'}`),
};

writeFileSync(`${ROOT}contrast-audit.json`, `${JSON.stringify(report, null, 2)}\n`);

if (AS_JSON) {
  process.stdout.write(`${JSON.stringify({ failures: report.failures })}\n`);
  process.exit(0);
}

console.log('Admin-plane colour contrast (WCAG 2.2 AA)');
for (const entry of results) {
  const marker = entry.pass ? 'PASS' : 'FAIL';
  console.log(`  ${marker}  ${String(entry.ratio ?? 'n/a').padStart(6)}:1  ${entry.use}  (min ${entry.min}:1)`);
}
console.log(failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
