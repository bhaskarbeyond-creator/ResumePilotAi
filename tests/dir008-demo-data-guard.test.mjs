/**
 * DIR-008 — demo-data guard (R-37).
 *
 * Production-facing surfaces must never ship a fake candidate. This scan is
 * deliberately blunt: if a person-shaped demo identity reappears anywhere under
 * `frontend/src`, the release gate fails. Tests are excluded because fixtures
 * legitimately need names.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'frontend', 'src');

const DEMO_NAMES = ['Alex Morgan', 'Sarah Administrator', 'alex-morgan'];
const DEMO_ASSETS = ['images.unsplash.com/photo-1534528741775-53994a69daeb'];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = walk(SRC);

test('no production surface ships a demo persona or stock headshot', () => {
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const needle of [...DEMO_NAMES, ...DEMO_ASSETS]) {
      assert.equal(source.includes(needle), false, `${path.relative(ROOT, file)} still ships "${needle}"`);
    }
  }
});

test('the portfolio builder starts from an empty, honest scaffold', () => {
  // P002 C8 moved the scaffold into lib/portfolio-document.ts, which the builder
  // and the public view share; the builder starts from emptyCanonical().
  const builder = fs.readFileSync(path.join(SRC, 'pages', 'portfolio', 'builder.tsx'), 'utf8');
  const documentModel = fs.readFileSync(path.join(SRC, 'lib', 'portfolio-document.ts'), 'utf8');
  const view = fs.readFileSync(path.join(SRC, 'components', 'portfolio', 'portfolio-view.tsx'), 'utf8');
  assert.match(builder, /useState<PortfolioCanonical>\(\(\) => emptyCanonical\(\)\)/, 'the builder does not start from the empty scaffold');
  const heading = documentModel.slice(documentModel.indexOf('export function emptyHeading'), documentModel.indexOf('export function emptyCanonical'));
  const scaffold = documentModel.slice(documentModel.indexOf('export function emptyCanonical'), documentModel.indexOf('function headingFrom'));
  assert.match(heading, /fullName:\s*''/, 'portfolio default still invents a name');
  assert.match(heading, /occupation:\s*''/, 'portfolio default still invents a headline');
  assert.match(heading, /photo:\s*''/, 'portfolio default still ships a photo URL');
  assert.match(scaffold, /heading:\s*emptyHeading\(\)/);
  assert.match(scaffold, /summary:\s*''/, 'portfolio default still invents a bio');
  assert.match(scaffold, /heroImage:\s*''/, 'portfolio default still ships a hero image');
  assert.match(scaffold, /projects:\s*\[\]/, 'portfolio default still ships sample projects');
  assert.match(scaffold, /skills:\s*\[\]/, 'portfolio default still ships sample skills');
  assert.match(view, /Unnamed portfolio/, 'preview has no empty-state prompt');
  assert.match(view, /This portfolio has no content yet\./, 'preview has no empty content state');
  assert.match(builder, /No projects added\./, 'editor has no empty project state');
});

test('the login demo shortcut is compile-time gated out of production', () => {
  const source = fs.readFileSync(path.join(SRC, 'pages', 'auth', 'login.tsx'), 'utf8');
  assert.match(source, /!import\.meta\.env\.PROD/, 'demo login block is not production-gated');
});
