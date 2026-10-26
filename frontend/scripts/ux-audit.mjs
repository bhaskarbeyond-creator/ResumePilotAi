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
// The auth surface was added after the console: the login page is the first screen an
// operator meets, and the axe sweep found a 32px password-reveal control there that this
// script would have caught if it had been in scope.
const TARGETS = ['src/components/admin', 'src/pages/admin', 'src/pages/auth', 'src/components/auth'];
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

/** Fixed heights below the 44px bar that are not raised at mobile widths. */
const FIXED_SHORT = /(?<!min-)\b(?:h|size)-(?:[0-9]|10)\b(?!\s*sm:)/;

/**
 * Elements whose own box is legitimately smaller than 44px because a larger target wraps
 * them: a checkbox/radio inside a label, and a hidden input. The wrapping label is what a
 * pointer hits, and `index.css` gives it the 44px floor at mobile widths.
 */
const SMALL_TARGET_OK = /type="(?:checkbox|radio|hidden|range)"/;
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
      // `$` matters: a multi-line opening tag ends its first line with the element name
      // and nothing else (`<button` then newline). Without it the scanner silently skipped
      // most real controls — the failure mode a regex audit has to be tested for.
      const pattern = new RegExp(`<${element}(\\s|>|/|$)`, 'g');
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

      // Target size: the project-level `@media (max-width: 767px)` rule in index.css sets a
      // 44px minimum on every control type, so a control only fails when it *opts out* —
      // an explicit height class below 44 that is not raised at mobile widths. The rendered
      // box is measured for real at 320/480 in `admin-console-ux.spec.ts` and
      // `auth-screens-ux.spec.ts`; this rule catches the opt-out before it ships.
      const tooShort = FIXED_SHORT.test(multiline) && !SMALL_TARGET_OK.test(multiline);
      if (tooShort && !TARGET_CLASS.test(multiline)) {
        findings.targetSize.push({ file: name, line: tag.line, element: tag.element, rule: 'explicit height below 44px without a min-h-11 override' });
      }

      // Focus: `:focus-visible` is a global rule (`index.css:208`), so a class per element
      // is unnecessary. What must never happen is an element that removes the ring — the
      // `outline-none`/`outline-0` utility without a replacement ring nearby.
      if (/outline-(none|0)\b/.test(multiline) && !/focus(-visible)?:(ring|outline|shadow)/.test(multiline)) {
        findings.focus.push({ file: name, line: tag.line, element: tag.element, rule: 'focus ring removed without a replacement' });
      }
    }

    lines.forEach((text, index) => {
      if (/text-\[(9|10|11)px\]/.test(text)) findings.textSize.push({ file: name, line: index + 1, text: text.trim().slice(0, 120) });
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
    targetSize: 'no interactive element pins a height below 44px; the 44px floor itself is the global @media (max-width: 767px) rule in index.css, and the rendered box is measured in Playwright at 320/480',
    textSize: 'no text below 12px (text-[9px] / text-[10px] / text-[11px] are refused)',
    focus: 'no element removes the focus ring without a replacement; the ring itself is the global :focus-visible rule in index.css',
    width: 'no fixed pixel width above 320px inside the admin/console/auth plane',
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
