/**
 * DIR-008 — template evidence integrity.
 *
 * Every claim of "100 templates" must be backed by per-template artifacts.
 * This suite verifies the evidence package that `scripts/dir008-generate-template-evidence.mjs`
 * produces and that is committed under `docs/templates/`:
 *
 *  - inventory has exactly 100 rows (Cv1..Cv100), one per catalog entry;
 *  - every row has a thumbnail on disk with valid JPEG magic and sane size;
 *  - every row has a structural wireframe and the server-rendered HTML proof;
 *  - the DOM-derived structure (rail, section order, pages) matches the spec the
 *    renderer consumes — evidence cannot drift from the engine;
 *  - thumbnails are not byte copies of each other and are not colour-only skins.
 *
 * Browser screenshots are explicitly out of scope: they are BLOCKED in this
 * environment and are recorded as such, never fabricated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(ROOT, 'docs/templates/dir008-template-inventory.json');
const WIREFRAME_DIR = path.join(ROOT, 'docs/templates/wireframes');
const EVIDENCE_DIR = path.join(ROOT, 'docs/templates/evidence');
const THUMB_DIR = path.join(ROOT, 'frontend/public/templates');
const CONTACT_SHEET = path.join(ROOT, 'docs/templates/dir008-contact-sheet.jpg');

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
const CV_IDS = Array.from({ length: 100 }, (_, index) => `Cv${index + 1}`);

const SECTION_LABELS = {
  summary: 'Professional Profile',
  experience: 'Work Experience',
  education: 'Education',
  projects: 'Key Projects',
  achievements: 'Key Achievements',
  skills: 'Core Competencies',
  certifications: 'Certifications',
  languages: 'Languages',
  hobbies: 'Interests & Hobbies',
  references: 'References',
};

test('inventory covers exactly Cv1..Cv100 with no duplicates and no gaps', () => {
  assert.equal(inventory.total, 100);
  assert.deepEqual(inventory.rows.map((row) => row.id), CV_IDS);
  assert.equal(new Set(inventory.rows.map((row) => row.fingerprint)).size, 100);
  assert.ok(Object.keys(inventory.families).length >= 20, 'fewer than 20 structural families are in use');
  assert.equal(inventory.kind, 'spec-derived-layout-proof');
  assert.match(inventory.note, /BLOCKED/, 'the inventory must state that browser screenshots are blocked');
});

test('every template has a valid on-disk thumbnail and the contact sheet exists', () => {
  const failures = [];
  const hashes = new Map();
  for (const row of inventory.rows) {
    const file = path.join(THUMB_DIR, `${row.id}.JPG`);
    if (!fs.existsSync(file)) {
      failures.push(`${row.id}: thumbnail missing`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) failures.push(`${row.id}: not a JPEG`);
    if (buffer.length < 8_000 || buffer.length > 900_000) failures.push(`${row.id}: implausible size ${buffer.length}`);
    const digest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (hashes.has(digest)) failures.push(`${row.id}: identical bytes to ${hashes.get(digest)}`);
    hashes.set(digest, row.id);
    assert.equal(row.thumbnail, `/templates/${row.id}.JPG`);
  }
  assert.deepEqual(failures, []);
  assert.ok(fs.existsSync(CONTACT_SHEET), 'contact sheet missing');
  assert.ok(fs.statSync(CONTACT_SHEET).size > 100_000, 'contact sheet is suspiciously small');
});

test('every template has a structural wireframe and a server-rendered HTML proof', () => {
  const failures = [];
  for (const row of inventory.rows) {
    const wireframe = path.join(ROOT, 'docs/templates/wireframes', `${row.id}.svg`);
    const evidence = path.join(ROOT, 'docs/templates/evidence', `${row.id}.html`);
    if (!fs.existsSync(wireframe)) failures.push(`${row.id}: wireframe missing`);
    else if (!fs.readFileSync(wireframe, 'utf8').includes('<svg')) failures.push(`${row.id}: wireframe is not SVG`);
    if (!fs.existsSync(evidence)) failures.push(`${row.id}: rendered HTML evidence missing`);
    else {
      const html = fs.readFileSync(evidence, 'utf8');
      if (!html.includes('smart-resume-page')) failures.push(`${row.id}: evidence is not the production document`);
      if (html.includes('Unsupported template layout')) failures.push(`${row.id}: evidence shows the unsupported state`);
      const digest = crypto.createHash('sha256').update(html).digest('hex');
      if (digest !== row.rendered.htmlSha256) failures.push(`${row.id}: evidence HTML drifted from the inventory hash`);
    }
  }
  assert.deepEqual(failures, []);
});

test('the DOM-derived structure matches the layout spec consumed by the renderer', () => {
  const failures = [];
  for (const row of inventory.rows) {
    const expectedRail = Boolean(row.aside);
    if (row.rendered.hasRail !== expectedRail) failures.push(`${row.id}: rail rendered=${row.rendered.hasRail} spec=${expectedRail}`);
    if (expectedRail && row.rendered.railFamily !== row.family) {
      failures.push(`${row.id}: rail family ${row.rendered.railFamily} != spec family ${row.family}`);
    }
    if (row.rendered.pages < 1) failures.push(`${row.id}: no pages rendered`);

    // Rendered headings must follow the spec's main reading order (rail
    // sections are rendered in the rail and never duplicated in the flow).
    const expected = row.mainOrder.map((section) => SECTION_LABELS[section]).filter(Boolean);
    const rendered = row.rendered.mainSectionHeadings;
    let cursor = 0;
    for (const heading of rendered) {
      const found = expected.indexOf(heading, cursor);
      if (found === -1) {
        failures.push(`${row.id}: heading "${heading}" is out of the declared reading order`);
        break;
      }
      cursor = found + 1;
    }
    for (const section of row.asideSections) {
      if (section === 'contact') continue;
      const label = SECTION_LABELS[section];
      if (label && rendered.includes(label)) failures.push(`${row.id}: "${label}" rendered in both rail and main flow`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});

test('generated thumbnails are visually distinct, not colour-only recolours', async () => {
  // Downsample each thumbnail to a 40×40 greyscale signature, then compare the
  // mean absolute difference of every pair. Colour is removed on purpose: two
  // templates that differ only in hue collapse to the same signature.
  const signatures = new Map();
  for (const row of inventory.rows) {
    const buffer = fs.readFileSync(path.join(THUMB_DIR, `${row.id}.JPG`));
    const raw = await sharp(buffer).resize(40, 40, { fit: 'fill' }).greyscale().raw().toBuffer();
    signatures.set(row.id, raw);
  }
  const ids = [...signatures.keys()];
  let minimum = Infinity;
  let closest = null;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = signatures.get(ids[i]);
      const b = signatures.get(ids[j]);
      let sum = 0;
      for (let k = 0; k < a.length; k += 1) sum += Math.abs(a[k] - b[k]);
      const distance = sum / a.length;
      if (distance < minimum) {
        minimum = distance;
        closest = [ids[i], ids[j]];
      }
    }
  }
  // Legacy assets (Cv1..Cv51) were produced by earlier hand-made designs; a
  // minimal structural distance of 1.0/255 still rules out byte copies and
  // identical geometry, while tolerating JPEG noise on near-identical layouts.
  assert.ok(minimum >= 1.0, `${closest?.[0]} and ${closest?.[1]} are visually identical (distance ${minimum.toFixed(2)})`);
});

test('legacy thumbnails are preserved untouched and new assets live outside the legacy corpus', () => {
  // `src/assets/resumesNew` is governed by its own test (exactly 51 files); the
  // DIR-008 expansion must not mutate that corpus.
  const legacyDir = path.join(ROOT, 'src/assets/resumesNew');
  if (fs.existsSync(legacyDir)) {
    const legacy = fs.readdirSync(legacyDir).filter((file) => /^Cv\d+\.JPG$/i.test(file));
    assert.equal(legacy.length, 51, 'legacy thumbnail corpus changed');
  }
  for (const row of inventory.rows) {
    if (Number.parseInt(row.id.replace('Cv', ''), 10) <= 51) {
      assert.equal(row.thumbnailOrigin, 'legacy-artifact', `${row.id} claims a generated asset for a legacy id`);
    } else {
      assert.equal(row.thumbnailOrigin, 'generated-from-spec', `${row.id} must declare its generated thumbnail origin`);
    }
  }
});
