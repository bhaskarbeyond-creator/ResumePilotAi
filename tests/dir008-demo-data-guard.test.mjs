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
  const source = fs.readFileSync(path.join(SRC, 'pages', 'portfolio', 'builder.tsx'), 'utf8');
  const block = source.slice(source.indexOf('const DEFAULT_PORTFOLIO'), source.indexOf('const THEMES'));
  assert.match(block, /fullName:\s*''/, 'portfolio default still invents a name');
  assert.match(block, /headline:\s*''/);
  assert.match(block, /bio:\s*''/);
  assert.match(block, /avatarUrl:\s*''/, 'portfolio default still ships a photo URL');
  assert.match(block, /projects:\s*\[\]/, 'portfolio default still ships sample projects');
  assert.match(block, /skills:\s*\[\]/, 'portfolio default still ships sample skills');
  assert.match(source, /Your name appears here/, 'preview has no empty-state prompt');
  assert.match(source, /No projects yet/, 'preview has no empty project state');
});

test('the login demo shortcut is compile-time gated out of production', () => {
  const source = fs.readFileSync(path.join(SRC, 'pages', 'auth', 'login.tsx'), 'utf8');
  assert.match(source, /!import\.meta\.env\.PROD/, 'demo login block is not production-gated');
});
