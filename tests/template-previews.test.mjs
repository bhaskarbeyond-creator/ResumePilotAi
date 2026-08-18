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

  await t.test('Cv51 uses the canonical filename with no case-variant alias', () => {
    // The asset used to ship as `CV51.JPG` while every other template used the
    // `CvNN.JPG` form. On a case-insensitive filesystem the two names collide,
    // and the mixed-case import was a standing source of "missing preview"
    // failures. The canonical name is now the only one that may exist.
    const files = fs.readdirSync(ASSETS_DIR);
    assert.ok(files.includes('Cv51.JPG'), 'Cv51.JPG must exist');
    assert.equal(files.includes('CV51.JPG'), false, 'legacy CV51.JPG alias must not be reintroduced');
    const sources = ['src/components/Actions/ResumesSelector/ResumesSelector.jsx',
      'src/components/Actions/action-step-selection/ActionSelection.jsx',
      'src/components/BuildResume/TemplateSelectionModal.jsx',
      'src/components/admin/settings/TemplateManagerSettings.jsx'];
    for (const file of sources) {
      const source = fs.readFileSync(path.resolve(file), 'utf8');
      assert.equal(source.includes('resumesNew/CV51.JPG'), false, `${file} still imports the legacy CV51 alias`);
    }
  });

  await t.test('No unexpected or unregistered template files in resumesNew', () => {
    const files = fs.readdirSync(ASSETS_DIR);
    assert.equal(files.length, CV_IDS.length, `expected exactly ${CV_IDS.length} preview files`);
    for (const file of files) {
      const base = file.replace(/\.jpg$/i, '');
      assert.equal(CV_IDS.includes(base), true, `Unexpected file in resumesNew: ${file}`);
    }
  });
});
