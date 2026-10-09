import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-055 S10 (builder-header half) — the unified header unit suite.
 *
 * Pins the S5/S6/S7 contract from source, mirroring the read-the-source
 * convention of tests/cuba-candidate-portal.test.mjs and the real-route
 * cross-check used by tests/dir055-notifications.test.mjs.
 */

const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const CANDIDATE_SHELL = 'src/components/Candidate/CubaCandidateShell.jsx';
const BUILDER = 'src/components/BuildResume/BuildResume.jsx';

/** Strip comments so assertions test CODE, not prose that names the defect. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('S5: isApplicationShellRoute covers exactly the builder entry routes', async () => {
  const mod = await import('../src/components/AppShell/applicationShell.js');
  assert.equal(mod.isApplicationShellRoute('/build-resume'), true);
  assert.equal(mod.isApplicationShellRoute('/build-resume/heading'), true);
  assert.equal(mod.isApplicationShellRoute('/create-resume'), true);
  assert.equal(mod.isApplicationShellRoute('/dashboard'), false);
  assert.equal(mod.isApplicationShellRoute('/employer/jobs'), false);
  assert.equal(mod.isApplicationShellRoute(''), false);
});

test('S5: the predicate gained its FIRST production consumer', async () => {
  const src = await fs.readFile(CANDIDATE_SHELL, 'utf8');
  assert.match(src, /import \{ isApplicationShellRoute \} from '\.\.\/AppShell\/applicationShell'/);
  assert.match(src, /hideTopBar=\{isApplicationShellRoute\(location\.pathname\)\}/);
});

test('S5: hideTopBar skips ONLY the <header>, never the navigation surfaces', async () => {
  const src = await fs.readFile(SHELL, 'utf8');
  const code = stripComments(src);
  // The header element is gated...
  assert.match(code, /\{!hideTopBar && \(\s*<header/);
  assert.match(code, /<\/header>\s*\)\}/);
  // ...and nothing else is: the sidebar, skip link and palette all stay.
  assert.match(code, /data-testid="cuba-sidebar"/);
  assert.match(code, /Skip to main content/);
  assert.doesNotMatch(code, /\{!hideTopBar && \(\s*<aside/, 'the sidebar must never be gated by hideTopBar');
  assert.doesNotMatch(code, /\{!hideTopBar && \(\s*<CubaCommandPalette/, 'the palette must never be gated');
});

test('S5: the sidebar drops its phantom header-height offset when the bar is hidden', async () => {
  const src = await fs.readFile(SHELL, 'utf8');
  assert.match(src, /hideTopBar\s*\?\s*'cuba-glass sticky top-0 hidden h-screen/);
  assert.match(src, /:\s*'cuba-glass sticky top-\[var\(--cuba-header-h\)\]/);
});

test('S6: the builder top bar is the Cuba glass surface, not an ad-hoc white bar', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  const code = stripComments(src);
  const header = (code.match(/<header className="([^"]+)"/) || [])[1] || '';
  assert.ok(header, 'the builder must render a header');
  assert.match(header, /cuba-glass/);
  assert.match(header, /shadow-cuba-xl/);
  assert.doesNotMatch(header, /bg-white\/95/, 'the ad-hoc white bar must be gone');
  // The step ribbon carries the same surface.
  const ribbon = (code.match(/aria-label="Resume Steps Stepper" className="([^"]+)"/) || [])[1] || '';
  assert.match(ribbon, /cuba-glass/);
});

test('S6: every legacy header control is retained', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  for (const control of [
    'Save and exit to dashboard',        // Dashboard exit
    'Click to rename resume',            // click-to-edit title
    'Click to switch template',          // template selector pill
    'View ATS readiness details',        // ATS pill + drawer trigger
    'Sync sections with your Master Profile',
    'Open navigation menu',              // mobile menu
  ]) {
    assert.ok(src.includes(control), `header control "${control}" must be retained`);
  }
  assert.match(src, /role="status" aria-live="polite"/, 'the live save beacon must be retained');
  assert.match(src, /handleDownload/, 'the Download CTA must be retained');
  assert.match(src, /setShowPreview\(true\)/, 'the Preview CTA must be retained');
});

test('S6: the 11-step ribbon is intact', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  assert.match(src, /aria-label="Resume Steps Stepper"/);
  assert.match(src, /className=\{`step-nav-btn/);
  assert.match(src, /isCompleted \? '✓' : index \+ 1/, 'completed steps must render a checkmark');
});

test('S7: the builder header self-hosts the shell primitives from AuthContext', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  assert.match(src, /import M3NotificationCenter from '\.\.\/cuba\/M3NotificationCenter'/);
  assert.match(src, /import M3UserMenu from '\.\.\/cuba\/M3UserMenu'/);
  assert.match(src, /import \{ useAuth \} from '\.\.\/\.\.\/context\/AuthContext'/);
  assert.match(src, /const authUser = useAuth\(\)/);
  assert.match(src, /<M3NotificationCenter onNavigate=\{navigate\} \/>/);
  assert.match(src, /<M3UserMenu/);
});

test('S7: the title cannot be squeezed to a zero-size box', async () => {
  // REGRESSION GUARD. `truncate` sets `overflow:hidden`, which makes a flex
  // item's automatic minimum size resolve to 0. Once the right rail gained the
  // notification + identity controls, the title collapsed and DISAPPEARED at
  // 1280px. The explicit floor is what stops that.
  const src = await fs.readFile(BUILDER, 'utf8');
  assert.match(src, /group flex min-w-\[5rem\] items-center gap-1\.5/, 'the title button needs an explicit minimum width');
  assert.match(src, /flex items-center gap-2 min-w-\[6rem\] overflow-hidden/, 'the title container needs an explicit minimum width');
});

test('S7: the builder header is hosted INSIDE the one top bar', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  const headerStart = src.indexOf('<header className="cuba-glass');
  const headerEnd = src.indexOf('</header>', headerStart);
  assert.ok(headerStart > -1 && headerEnd > headerStart, 'the top bar must be found');
  const inside = src.slice(headerStart, headerEnd);
  assert.match(inside, /<M3NotificationCenter/, 'the notification centre must be inside the top bar');
  assert.match(inside, /<M3UserMenu/, 'the identity menu must be inside the top bar');
});
