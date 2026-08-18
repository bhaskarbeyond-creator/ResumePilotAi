import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CV_IDS = Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`);
const ASSETS_DIR = path.resolve('src/assets/resumesNew');

test('Template Previews Audit Suite', async (t) => {
  await t.test('All 51 CV template preview files exist in src/assets/resumesNew', () => {
    for (const id of CV_IDS) {
      const filePath = path.join(ASSETS_DIR, `${id}.JPG`);
      assert.equal(fs.existsSync(filePath), true, `Missing preview image for ${id}`);
    }
  });

  await t.test('All 51 preview files have non-zero valid size (50KB < size < 400KB)', () => {
    for (const id of CV_IDS) {
      const filePath = path.join(ASSETS_DIR, `${id}.JPG`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 50000, `${id}.JPG is too small (${stat.size} bytes)`);
      assert.ok(stat.size < 400000, `${id}.JPG is too large (${stat.size} bytes)`);
    }
  });

  await t.test('All 51 preview files are authentic JPEGs with valid magic headers', () => {
    for (const id of CV_IDS) {
      const filePath = path.join(ASSETS_DIR, `${id}.JPG`);
      const buffer = fs.readFileSync(filePath);
      assert.equal(buffer[0], 0xFF, `${id}.JPG missing JPEG marker byte 0`);
      assert.equal(buffer[1], 0xD8, `${id}.JPG missing JPEG marker byte 1`);
      assert.equal(buffer[2], 0xFF, `${id}.JPG missing JPEG marker byte 2`);
    }
  });

  await t.test('Cv51 and legacy CV51 alias are synchronized', () => {
    const cv51Path = path.join(ASSETS_DIR, 'Cv51.JPG');
    const upperPath = path.join(ASSETS_DIR, 'CV51.JPG');
    assert.equal(fs.existsSync(cv51Path), true, 'Cv51.JPG must exist');
    assert.equal(fs.existsSync(upperPath), true, 'CV51.JPG alias must exist');
    const stat1 = fs.statSync(cv51Path);
    const stat2 = fs.statSync(upperPath);
    assert.equal(stat1.size, stat2.size, 'Cv51.JPG and CV51.JPG must match size');
  });

  await t.test('No unexpected or unregistered template files in resumesNew', () => {
    const files = fs.readdirSync(ASSETS_DIR);
    for (const file of files) {
      const base = file.replace(/\.jpg$/i, '');
      const isValid = CV_IDS.includes(base) || base === 'CV51';
      assert.equal(isValid, true, `Unexpected file in resumesNew: ${file}`);
    }
  });
});
