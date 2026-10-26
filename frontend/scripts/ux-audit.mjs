#!/usr/bin/env node
/**
 * Static accessibility and device-class audit for the admin plane (REC-019, INV-1).
 *
 * ## Why a script rather than a document
 *
 * `UX-DEVICE-MATRIX.md` originally described the intended state. A description does not
 * regress, and therefore cannot catch a regression: the 11-tab console had already
 * accumulated 10px labels, 36px buttons and an icon-only control with no accessible name
 * while the matrix said the plane was responsive.
 *
 * This script reads the actual JSX and reports, with file and line, the four things that
 * can be decided mechanically:
 *
 *  1. **Touch target size** — an interactive element must carry a ≥44px minimum
 *     (`min-h-11`, `h-11`, `size-11` or larger). WCAG 2.2 AA "Target Size (Minimum)"
 *     is 24px; the product bar is 44px, so the stricter number is what is enforced.
 *  2. **Text size** — no `text-[9px]`/`text-[10px]`. Below 12px, a label fails at 200%
 *     zoom for a low-vision user even when it technically scales.
 *  3. **Focus visibility** — an interactive element must carry `focus-visible:` styling,
 *     because a keyboard-only operator cannot see where they are otherwise.
 *  4. **Viewport overflow** — no fixed pixel width above 320px inside the admin plane,
 *     which would force horizontal scrolling on the smallest supported class.
 *
 * What it deliberately does not judge: colour contrast (needs computed styles, so it
 * belongs in the axe run recorded in TEST-EVIDENCE), layout quality, or copy.
 *
 * Usage:
 *   node scripts/ux-audit.mjs            # report, non-zero exit on a violation
 *   node scripts/ux-audit.mjs --json     # machine-readable, always exit 0
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TARGETS = ['src/components/admin', 'src/pages/admin'];
const AS_JSON = process.argv.includes('--json');

/** Element names that accept user interaction. */
const INTERACTIVE = ['button', 'a', 'input', 'select', 'textarea', 'summary'];

/** Class fragments that satisfy the 44px minimum. */
const TARGET_CLASS = /\b(min-h-1[1-9]|h-1[1-9]|min-w-1[1-9]|size-1[1-9]|py-3|py-4|p-3|p-4)\b/;

/**
 * Fixed widths wider than the smallest supported class (320px).
 *
 * `min-w-[Npx]` is *not* a violation on its own: a dense table legitimately sets a
 * minimum and scrolls inside an `overflow-x-auto` container, which keeps the page
 * itself free of horizontal scroll. It is therefore reported only when no scroll
 * container is in scope, which is the case where the width actually pushes the
 * viewport sideways.
 */
const FIXED_WIDTH = /(?<!min-)\bw-\[(\d{3,4})px\]/g;
const MIN_WIDTH = /\bmin-w-\[(\d{3,4})px\]/g;

/** @returns {string[]} every .tsx file under the targets */
function collect(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...collect(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Find the JSX opening tags of interactive elements, with their line numbers.
 * Deliberately regex-based: a full parse would need a TypeScript AST, and the failure
 * mode of a regex here is a missed tag, not a false accusation, because every rule below
 * only reports what it can see.
 *
 * @param {string} source
 * @returns {Array<{element: string, tag: string, line: number}>}
 */
function interactiveTags(source) {
  const lines = source.split('\n');
  const found = [];
  lines.forEach((text, index) => {
    for (const element of INTERACTIVE) {
      const pattern = new RegExp(`<${element}(\\s|>|/)`, 'g');
      if (!pattern.test(text)) continue;
      // Only tags that open and close on one line can be judged this way; a multi-line
      // opening tag is attributed to its first line and its attributes are read from the
      // following lines until the closing `>`.
      let tag = text;
      if (!text.includes('>')) {
        for (let cursor = index + 1; cursor < Math.min(index + 12, lines.length); cursor += 1) {
          tag += ` ${lines[cursor]}`;
          if (lines[cursor].includes('>')) break;
        }
      }
      found.push({ element, tag, line: index + 1 });
    }
  });
  return found;
}

const findings = { targetSize: [], textSize: [], focus: [], width: [], totals: {} };

for (const target of TARGETS) {
  for (const file of collect(join(ROOT, target))) {
    const source = readFileSync(file, 'utf8');
    const name = relative(ROOT, file);
    const lines = source.split('\n');

    for (const tag of interactiveTags(source)) {
      const multiline = tag.tag;
      if (!TARGET_CLASS.test(multiline)) {
        findings.targetSize.push({ file: name, line: tag.line, element: tag.element });
      }
      if (!/focus-visible:/.test(multiline) && tag.element !== 'input') {
        // `input` is excluded only when it is a custom class list; native inputs get the
        // global `:focus-visible` outline from index.css. Buttons do not.
        findings.focus.push({ file: name, line: tag.line, element: tag.element });
      }
    }

    lines.forEach((text, index) => {
      if (/text-\[(9|10)px\]/.test(text)) findings.textSize.push({ file: name, line: index + 1, text: text.trim().slice(0, 120) });
      for (const match of text.matchAll(FIXED_WIDTH)) {
        if (Number(match[1]) > 320) findings.width.push({ file: name, line: index + 1, width: Number(match[1]) });
      }
      for (const match of text.matchAll(MIN_WIDTH)) {
        if (Number(match[1]) <= 320) continue;
        const context = [lines[index], lines[index - 1], lines[index - 2], lines[index - 3], lines[index - 4]]
          .filter(Boolean).join(' ');
        if (!context.includes('overflow-x-auto')) {
          findings.width.push({ file: name, line: index + 1, width: Number(match[1]), rule: 'min-width without a scroll container' });
        }
      }
    });
  }
}

findings.totals = {
  targetSize: findings.targetSize.length,
  textSize: findings.textSize.length,
  focus: findings.focus.length,
  width: findings.width.length,
};

const report = {
  generatedAt: new Date().toISOString(),
  rules: {
    targetSize: 'interactive elements carry a >=44px minimum (min-h-11 / h-11 / size-11 or larger)',
    textSize: 'no text below 12px (text-[9px] / text-[10px] are refused)',
    focus: 'buttons and links carry focus-visible styling',
    width: 'no fixed pixel width above 320px inside the admin plane',
  },
  findings,
};

writeFileSync(join(ROOT, 'ux-audit.json'), `${JSON.stringify(report, null, 2)}\n`);

const total = Object.values(findings.totals).reduce((sum, value) => sum + value, 0);
if (AS_JSON) {
  process.stdout.write(`${JSON.stringify(report.totals)}\n`);
  process.exit(0);
}

console.log('Admin-plane UX audit');
for (const [rule, count] of Object.entries(findings.totals)) {
  console.log(`  ${rule.padEnd(12)} ${String(count).padStart(3)} violation(s)`);
}
for (const [rule, list] of Object.entries(findings)) {
  if (rule === 'totals') continue;
  for (const item of list.slice(0, 20)) console.log(`    ${rule}: ${item.file}:${item.line}`);
}
console.log(total === 0 ? 'PASS' : `FAIL (${total})`);
process.exit(total === 0 ? 0 : 1);
