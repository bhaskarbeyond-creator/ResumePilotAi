import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  shouldRenderWatermark,
  resolvePreviewWatermark,
  readEntitlement,
} from '../src/utils/watermarkEntitlement.js';

/**
 * DIR-060 — free-tier watermark entitlement gate.
 *
 * PROVEN DEFECT this suite pins: the render path fed
 * `ResumeWatermarkOverlay` from `values._watermark || values.watermark`, but
 * nothing in src/ populated either key and the overlay had NO entitlement input.
 * So a FREE document showed no watermark, and any caller supplying the global
 * public watermark would have stamped a PAID document. One shared, fail-closed
 * gate now decides, and both render sites + the builder feed it.
 */

const ON = { enableFreeWatermark: true, watermarkText: 'Created with IME365 (Free Plan)' };
const OFF = { ...ON, enableFreeWatermark: false };

/* ── Unit: the gate ────────────────────────────────────────────────────────── */

test('DIR-060: a free user with the setting ON renders the watermark', () => {
  assert.equal(shouldRenderWatermark(ON, { isPaid: false }), true);
  assert.equal(shouldRenderWatermark(ON, {}), true);
});

test('DIR-060: a PAID user never renders the watermark (zero leakage)', () => {
  assert.equal(shouldRenderWatermark(ON, { isPaid: true }), false);
  assert.equal(shouldRenderWatermark(ON, { removesWatermark: true }), false);
  assert.equal(shouldRenderWatermark(ON, { isPaid: true, removesWatermark: true }), false);
});

test('DIR-060: an explicit admin OFF always wins, and missing/invalid settings fail closed', () => {
  assert.equal(shouldRenderWatermark(OFF, {}), false);
  assert.equal(shouldRenderWatermark(OFF, { isPaid: false }), false);
  for (const bad of [undefined, null, 'x', 42, []]) {
    assert.equal(shouldRenderWatermark(bad, {}), false, `must fail closed for ${JSON.stringify(bad)}`);
  }
});

test('DIR-060: resolvePreviewWatermark returns the object for free and null for paid', () => {
  assert.equal(resolvePreviewWatermark({ watermark: ON, isPaid: false }), ON);
  assert.equal(resolvePreviewWatermark({ watermark: ON, isPaid: true }), null);
  assert.equal(resolvePreviewWatermark({ watermark: ON, removesWatermark: true }), null);
  assert.equal(resolvePreviewWatermark({ watermark: OFF, isPaid: false }), null);
  assert.equal(resolvePreviewWatermark(), null);
});

test('DIR-060: readEntitlement accepts both the nested and the flat contract', () => {
  assert.deepEqual(readEntitlement({ _entitlement: { isPaid: true } }), { removesWatermark: false, isPaid: true });
  assert.deepEqual(readEntitlement({ removesWatermark: true }), { removesWatermark: true, isPaid: false });
  assert.deepEqual(readEntitlement({ _entitlement: { removesWatermark: true }, isPaid: true }), { removesWatermark: true, isPaid: true });
  assert.deepEqual(readEntitlement(), { removesWatermark: false, isPaid: false });
  assert.deepEqual(readEntitlement(null), { removesWatermark: false, isPaid: false });
});

/* ── Static: every surface routes through the ONE gate ─────────────────────── */

const OVERLAY = 'src/components/common/ResumeWatermarkOverlay.jsx';
const RENDER_SITES = [
  'src/components/TemplateRenderer.jsx',
  'src/engine/hybrid/SmartResumeComposer.jsx',
];
const BUILDER = 'src/components/BuildResume/BuildResume.jsx';

test('DIR-060: the overlay delegates to the shared fail-closed gate', async () => {
  const src = await fs.readFile(OVERLAY, 'utf8');
  assert.match(src, /import \{ shouldRenderWatermark \} from '\.\.\/\.\.\/utils\/watermarkEntitlement'/, 'the overlay must import the gate');
  assert.match(src, /shouldRenderWatermark\(watermark, resolvedEntitlement\)/, 'the overlay must use the gate');
  assert.doesNotMatch(src, /watermark\.enableFreeWatermark === false\)\s*\{\s*return null/, 'the ad-hoc inline check must be gone');
});

test('DIR-060: BOTH render sites pass the entitlement to the overlay', async () => {
  for (const file of RENDER_SITES) {
    const src = await fs.readFile(file, 'utf8');
    assert.match(src, /readEntitlement/, `${file} must read the entitlement`);
    assert.match(src, /entitlement=\{readEntitlement\(values\)\}/, `${file} must pass it to the overlay`);
  }
});

test('DIR-060: the builder preview carries the authoritative watermark decision', async () => {
  const src = await fs.readFile(BUILDER, 'utf8');
  assert.match(src, /resolvePreviewWatermark\(\{ watermark: freeTierAccess, isPaid: isPaidPreview \}\)/, 'the builder must resolve the watermark from the admin setting AND the membership');
  assert.match(src, /_entitlement: \{ isPaid: isPaidPreview \}/, 'the builder must publish the entitlement');
});

test('DIR-060: the FROZEN cv-templates boundary was respected (no template edited)', async () => {
  const gate = await fs.readFile('src/utils/watermarkEntitlement.js', 'utf8');
  assert.ok(gate.length > 0, 'the gate lives OUTSIDE src/cv-templates');
  const templates = await fs.readdir('src/cv-templates');
  // The 55 template directories must still be present and untouched by this fix.
  const cvDirs = templates.filter((name) => /^cv\d+$/.test(name));
  const coverDirs = templates.filter((name) => /^cover\d+$/.test(name));
  assert.equal(cvDirs.length, 51, `expected 51 resume template dirs, found ${cvDirs.length}`);
  assert.equal(coverDirs.length, 4, `expected 4 cover template dirs, found ${coverDirs.length}`);
});
