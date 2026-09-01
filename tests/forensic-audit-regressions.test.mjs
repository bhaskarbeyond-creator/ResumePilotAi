/**
 * Regression coverage for the FINAL FORENSIC CODEBASE AUDIT findings that are
 * not reachable through the backend HTTP surface.
 *
 * Each test targets a defect that a green suite previously missed:
 *   D2  MFA_ENROLLED was conflated with MFA_VERIFIED in the Admin console
 *   D3  Unscoped global CSS leaked resume typography into the whole application
 *   D4  Poppins was loaded twice (self-hosted + remote render-blocking @import)
 *   D5  A string-matching test certified an unreachable component as a capability
 *   D1  The payment panel swallowed its load failure with a bare console.warn
 *
 * Run: node --test tests/forensic-audit-regressions.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = p => fs.readFileSync(p, 'utf8');

/* ------------------------------------------------------------------ *
 * D3 — Global CSS leakage
 * ------------------------------------------------------------------ */

const GLOBAL_CSS = 'src/cv-templates/css/globalTemplateEnhancements.css';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Strip block AND line comments without corrupting string literals. A naive
 * `//` strip breaks `https://` URLs, and not stripping it at all makes the
 * import walker match commented-out imports (which produced false positives in
 * the first pass of this audit).
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] || '');
          i += 2;
          continue;
        }
        out += src[i];
        i++;
      }
      out += src[i] || '';
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Return every top-level rule selector whose selector group contains a part that
 * is NOT scoped by a class, id, attribute or ancestor — i.e. a rule that can
 * match arbitrary application markup.
 */
function unscopedSelectorParts(css) {
  const src = stripComments(css);
  const scoped = sel => /[.#]/.test(sel) || sel.includes('[');
  const offenders = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      const head = buf.trim().replace(/\s+/g, ' ');
      buf = '';
      if (head.startsWith('@')) {
        stack.push({ at: head });
      } else {
        const ancestors = stack.filter(s => !s.at).map(s => s.sel);
        // A print-only html/body reset is intentional and cannot affect screen.
        const inPrint = stack.some(s => s.at && /@media[^{]*\bprint\b/.test(s.at));
        if (!inPrint && !scoped(head) && !ancestors.some(scoped)) {
          for (const part of head.split(',').map(s => s.trim()).filter(Boolean)) offenders.push(part);
        }
        stack.push({ sel: head });
      }
    } else if (c === '}') {
      stack.pop();
      buf = '';
    } else if (c === ';') {
      buf = '';
    } else {
      buf += c;
    }
  }
  return offenders;
}

test('D3: globalTemplateEnhancements.css contains no unscoped global selector', () => {
  const offenders = unscopedSelectorParts(read(GLOBAL_CSS));
  assert.deepEqual(
    offenders,
    [],
    'globalTemplateEnhancements.css is linked from index.html and applies to every route; ' +
      `these selectors are unscoped and leak into application UI: ${offenders.join(', ')}`
  );
});

test('D3: the mandatory-justification rule is scoped to resume board containers', () => {
  const css = stripComments(read(GLOBAL_CSS));
  const rule = /([^{}/]*\bp\b[^{}]*)\{[^}]*text-align:\s*justify\s*!important[^}]*\}/g;
  let m;
  let checked = 0;
  while ((m = rule.exec(css))) {
    for (const part of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      checked++;
      assert.match(
        part,
        /\[class\*="-board"\]|\[data-cv-board\]|\.cv-board|\.cv-template|\.resume-preview/,
        `justification must stay inside a resume document, but "${part}" is global`
      );
    }
  }
  assert.ok(checked > 0, 'the justification rule must still exist — this test must not pass by deletion');
});

test('D3: the [class*="-content"] width override is no longer global', () => {
  const css = stripComments(read(GLOBAL_CSS));
  // A bare `[class*="-content"]` at the start of a selector group would match
  // blog-content / modal-content / dashboard-content anywhere in the app.
  const groups = css.match(/[^{}]+\{[^}]*max-width:\s*100%\s*!important[^}]*\}/g) || [];
  assert.ok(groups.length > 0, 'the width rule must still exist — this test must not pass by deletion');
  for (const g of groups) {
    const selectors = g.slice(0, g.indexOf('{')).split(',').map(s => s.trim()).filter(Boolean);
    for (const sel of selectors) {
      assert.match(
        sel,
        /^\s*(\[class\*="-board"\]|\[data-cv-board\]|\.cv-board)/,
        `width override must be board-scoped, but "${sel}" is global`
      );
    }
  }
});

test('D3: the built stylesheet does not ship a bare global paragraph justification', () => {
  const distDir = 'dist/assets';
  if (!fs.existsSync(distDir)) return; // build artifact optional in a source-only checkout
  const eager = read('dist/index.html').match(/\/assets\/([A-Za-z0-9._-]+\.css)/g) || [];
  assert.ok(eager.length > 0, 'index.html must link at least one stylesheet');
  for (const href of eager) {
    const file = path.join('dist', href.replace(/^\//, ''));
    if (!fs.existsSync(file)) continue;
    const css = stripComments(read(file));
    assert.doesNotMatch(
      css,
      /(^|[},])\s*p\s*,[^{}]*\{[^}]*text-align:\s*justify\s*!important/,
      `${file} ships an unscoped global "p { text-align: justify !important }"`
    );
  }
});

/* ------------------------------------------------------------------ *
 * D4 — Duplicate / remote font loading
 * ------------------------------------------------------------------ */

test('D4: no render-blocking remote font @import remains in the Tailwind entry', () => {
  const css = stripComments(read('src/tailwind.css'));
  assert.doesNotMatch(
    css,
    /@import\s+url\(\s*['"]?https?:\/\/fonts\.googleapis\.com/,
    'Poppins is self-hosted; a remote @import duplicates it, blocks render and adds a third-party runtime dependency'
  );
});

test('D4: the self-hosted Poppins stylesheet is preloaded and linked from index.html', () => {
  const html = read('index.html');
  assert.match(html, /<link[^>]+rel="preload"[^>]+\/fonts\/poppins\.css/, 'Poppins must be preloaded');
  assert.match(html, /<link[^>]+href="\/fonts\/poppins\.css"[^>]+rel="stylesheet"/, 'Poppins must be linked');
  assert.ok(fs.existsSync('public/fonts/poppins.css'), 'the self-hosted font stylesheet must exist');
});

test('D4: self-hosted Poppins covers every weight the app actually uses', () => {
  const fontCss = read('public/fonts/poppins.css');
  const available = new Set([...fontCss.matchAll(/font-weight:\s*(\d+)/g)].map(m => Number(m[1])));
  const TAILWIND_WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
  const src = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|css|scss)$/.test(e.name)) src.push(p);
    }
  })('src');
  const used = new Set();
  for (const f of src) {
    const text = read(f);
    for (const [name, weight] of Object.entries(TAILWIND_WEIGHTS)) {
      if (new RegExp(`\\bfont-${name}\\b`).test(text)) used.add(weight);
    }
    // Only the static Tailwind scale (100..900 in steps of 100) is asserted:
    // those are exactly the weights the removed remote @import offered. Arbitrary
    // intermediate values such as `font-weight: 550` were never served by that
    // URL either, so they are not a regression introduced by this change.
    for (const m of text.matchAll(/font-weight:\s*([1-9]00)\b/g)) used.add(Number(m[1]));
  }
  const missing = [...used].filter(w => !available.has(w)).sort((a, b) => a - b);
  // Documented, accepted gap: 100/200 are not self-hosted and degrade to the
  // nearest available weight (300) on one decorative hero line. Any NEW
  // uncovered weight is a real regression.
  const ACCEPTED_GAP = new Set([100, 200]);
  const unaccepted = missing.filter(w => !ACCEPTED_GAP.has(w));
  assert.deepEqual(unaccepted, [], `self-hosted Poppins is missing weights used by the app: ${unaccepted.join(', ')}`);
});

/* ------------------------------------------------------------------ *
 * D2 — MFA_ENROLLED vs MFA_VERIFIED
 * ------------------------------------------------------------------ */

test('D2: the Admin console derives session MFA state only from the verified claim', () => {
  const src = read('src/components/admin/Admin.jsx');
  const verifiedLine = src
    .split('\n')
    .find(line => /mfaVerified\s*=\s*Boolean\(/.test(line));
  assert.ok(verifiedLine, 'Admin.jsx must compute mfaVerified');
  assert.match(verifiedLine, /sign_in_second_factor/, 'mfaVerified must come from the verified second-factor claim');
  assert.doesNotMatch(
    verifiedLine,
    /enrolledFactors/,
    'mfaVerified must NOT be derived from enrolledFactors — enrollment is not session verification'
  );

  const enrolledLine = src
    .split('\n')
    .find(line => /mfaEnrolled\s*=\s*Array\.isArray\(/.test(line));
  assert.ok(enrolledLine, 'Admin.jsx must compute mfaEnrolled separately');
  assert.match(enrolledLine, /enrolledFactors/, 'mfaEnrolled must come from enrolledFactors');
});

test('D2: the Super Admin MFA banner is driven by session verification, not enrollment', () => {
  const src = read('src/components/admin/Admin.jsx');
  assert.match(
    src,
    /authState\.isSuperAdmin\s*&&\s*!authState\.mfaVerified/,
    'the banner must appear whenever the session is not MFA-verified, including for enrolled-but-unverified admins'
  );
  assert.doesNotMatch(
    src,
    /authState\.isSuperAdmin\s*&&\s*!authState\.hasMfa/,
    'the banner must not use the conflated hasMfa flag'
  );
  assert.match(src, /mfaVerified:\s*authState\.mfaVerified === true/, 'the context must expose mfaVerified');
  assert.match(src, /mfaEnrolled:\s*authState\.mfaEnrolled === true/, 'the context must expose mfaEnrolled');
});

/* ------------------------------------------------------------------ *
 * D1 — Payment panel must not swallow its load failure
 * ------------------------------------------------------------------ */

test('D1: the payment panel surfaces load failures instead of a bare console.warn', () => {
  const src = read('src/components/admin/settings/subscriptionsSettings.jsx');
  assert.doesNotMatch(
    src,
    /console\.warn\(\s*'Error in componentDidMount loading settings:'/,
    'the silent catch that produced empty gateway fields must be gone'
  );
  assert.match(src, /paymentSettingsNotice/, 'a load failure must set a user-visible notice');
  assert.match(src, /data-testid="payment-settings-notice"/, 'the notice must be rendered');
  assert.match(
    src,
    /if\s*\(!this\.state\.paymentSettingsLoaded\)/,
    'saving must be blocked while the projection has not loaded, so a stale revision cannot be sent'
  );
});

test('D1: the canonical payment-settings read is reachable by the Admin console role', () => {
  const platform = read('backend/routes/platform.js');
  const route = platform
    .split('\n')
    .find(line => /router\.get\(\s*'\/payment-settings'/.test(line));
  assert.ok(route, 'GET /payment-settings must exist');
  assert.match(
    route,
    /requirePermission\(\s*(?:'system\.config\.read'|\[[^\]]*'system\.config\.read'[^\]]*\])\s*\)/,
    'the secret-free projection must be readable by ADMIN, which holds system.config.read'
  );
  assert.doesNotMatch(route, /requireSuperAdmin/, 'the read must not be SUPER_ADMIN-gated while the alias is not');

  // The WRITE must remain the strongest control.
  const index = read('backend/index.js');
  const write = index
    .split('\n')
    .find(line => /app\.post\(\s*'\/api\/admin\/payment-settings'/.test(line));
  assert.ok(write, 'POST /api/admin/payment-settings must exist');
  assert.match(write, /requireRecentAdminAuthentication/, 'the write must still require SUPER_ADMIN + MFA + recent auth');
});

/* ------------------------------------------------------------------ *
 * D5 — Capability surfaces must be reachable
 * ------------------------------------------------------------------ */

const ENTRY = 'src/main.jsx';
const EXTENSIONS = ['', '.js', '.jsx', '.mjs', '.json', '.css', '.scss'];
const INDEXES = ['/index.js', '/index.jsx', '/index.mjs'];

function resolveSpecifier(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  }
  for (const idx of INDEXES) if (fs.existsSync(base + idx)) return base + idx;
  return null;
}

/** Walk the static import graph from the application entry point. */
export function reachableFromEntry(entry = ENTRY) {
  const root = process.cwd();
  const toRel = p => path.relative(root, p).split(path.sep).join('/');
  const seen = new Set();
  const queue = [path.resolve(entry)];
  const importRe = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"](\.[^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(js|jsx|mjs)$/.test(file) || !fs.existsSync(file)) continue;
    const src = stripJsComments(read(file));
    let m;
    while ((m = importRe.exec(src))) {
      const resolved = resolveSpecifier(m[1].replace(/\?.*$/, ''), file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return new Set([...seen].map(toRel));
}

test('D5: every asserted DOCX journey surface is reachable from the application entry', () => {
  const reachable = reachableFromEntry();
  const testSource = read('tests/docx-client-journey.test.mjs');
  const asserted = [...testSource.matchAll(/'(src\/[^']+\.jsx?)'/g)].map(m => m[1]);
  assert.ok(asserted.length >= 3, 'the journey test must still assert real surfaces');
  for (const file of asserted) {
    assert.ok(
      reachable.has(file),
      `${file} is asserted as a verified capability surface but is NOT reachable from ${ENTRY} — it can never render`
    );
  }
});

test('D5: the known-dead FinalizeStep is not certified as a live surface', () => {
  const testSource = read('tests/docx-client-journey.test.mjs');
  assert.doesNotMatch(
    testSource,
    /'src\/components\/BuildResume\/steps\/FinalizeStep\.jsx'/,
    'FinalizeStep.jsx is unreachable and imports a module that does not exist; it must not be asserted as verified'
  );
});
