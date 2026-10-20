/**
 * Write-boundary regression suite for scripts/sync-dist.mjs.
 *
 * Every scenario runs against a throw-away fixture repository under the OS temp
 * directory, so the real dist/ folder is never touched by this test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveSyncPlan, syncDist, SyncBoundaryError } from '../scripts/sync-dist.mjs';

const silent = { log: () => {}, warn: () => {} };

function fixture({ build = true, indexHtml = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-dist-'));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, 'frontend'), { recursive: true });
  if (build) {
    fs.mkdirSync(path.join(repo, 'frontend', 'dist', 'assets'), { recursive: true });
    if (indexHtml) fs.writeFileSync(path.join(repo, 'frontend', 'dist', 'index.html'), '<!doctype html><title>new</title>');
    fs.writeFileSync(path.join(repo, 'frontend', 'dist', 'assets', 'index-NEW.js'), 'console.log("new")');
  }
  const outside = path.join(base, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'untouched');
  return { base, repo, outside };
}

function snapshot(dir) {
  return fs.readdirSync(dir).sort().map(name => `${name}:${fs.readFileSync(path.join(dir, name), 'utf8')}`);
}

test('copies a complete build, keeps operator files, prunes only superseded entry chunks', () => {
  const { repo } = fixture();
  const dist = path.join(repo, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, '.htaccess'), 'RewriteEngine On');
  fs.writeFileSync(path.join(dist, 'assets', 'index-OLD.js'), 'old entry');
  fs.writeFileSync(path.join(dist, 'assets', 'smart-resume-document-OLD.js'), 'old chunk');
  fs.writeFileSync(path.join(dist, 'assets', 'route-chunk-OLD.js'), 'lazy chunk still referenced by open sessions');

  const result = syncDist({ repoRoot: repo, ...silent });

  assert.equal(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'), '<!doctype html><title>new</title>');
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'index-NEW.js')));
  assert.ok(fs.existsSync(path.join(dist, '.htaccess')), 'operator-managed files survive');
  assert.ok(fs.existsSync(path.join(dist, 'assets', 'route-chunk-OLD.js')), 'non-entry chunks are not pruned');
  assert.ok(!fs.existsSync(path.join(dist, 'assets', 'index-OLD.js')));
  assert.ok(!fs.existsSync(path.join(dist, 'assets', 'smart-resume-document-OLD.js')));
  assert.deepEqual(result.pruned.sort(), ['index-OLD.js', 'smart-resume-document-OLD.js']);
  assert.equal(result.copied, 2);
});

test('refuses a dist symlink that points outside the repository and writes nothing there', () => {
  const { repo, outside } = fixture();
  fs.symlinkSync(outside, path.join(repo, 'dist'), 'dir');
  const before = snapshot(outside);
  assert.throws(() => syncDist({ repoRoot: repo, ...silent }), SyncBoundaryError);
  assert.deepEqual(snapshot(outside), before);
});

test('refuses to write through a symlink nested inside dist', () => {
  const { repo, outside } = fixture();
  fs.mkdirSync(path.join(repo, 'dist'));
  fs.symlinkSync(outside, path.join(repo, 'dist', 'assets'), 'dir');
  const before = snapshot(outside);
  assert.throws(() => syncDist({ repoRoot: repo, ...silent }), SyncBoundaryError);
  assert.deepEqual(snapshot(outside), before, 'no file may land in the symlink target');
});

test('refuses to publish an incomplete build without index.html', () => {
  const { repo } = fixture({ indexHtml: false });
  assert.throws(() => resolveSyncPlan({ repoRoot: repo }), /incomplete build/);
  assert.ok(!fs.existsSync(path.join(repo, 'dist')));
});

test('missing build output is a warning, not a write', () => {
  const { repo } = fixture({ build: false });
  const warnings = [];
  const result = syncDist({ repoRoot: repo, log: () => {}, warn: message => warnings.push(message) });
  assert.equal(result.copied, 0);
  assert.equal(warnings.length, 1);
  assert.ok(!fs.existsSync(path.join(repo, 'dist')));
});

test('environment files are never copied into the DocumentRoot', () => {
  const { repo } = fixture();
  fs.writeFileSync(path.join(repo, 'frontend', 'dist', '.env.production'), 'SECRET=1');
  syncDist({ repoRoot: repo, ...silent });
  assert.ok(!fs.existsSync(path.join(repo, 'dist', '.env.production')));
});

test('the real script resolves both paths inside this repository', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const output = execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'sync-dist.mjs'), '--check'], { encoding: 'utf8' });
  const plan = JSON.parse(output);
  const realRoot = fs.realpathSync(repoRoot);
  assert.equal(plan.srcDir, path.join(repoRoot, 'frontend', 'dist'));
  assert.equal(plan.destDir, path.join(repoRoot, 'dist'));
  assert.ok(plan.realDestDir.startsWith(realRoot + path.sep), `${plan.realDestDir} must be inside ${realRoot}`);
});

test('frontend build script still chains the sync step after a successful vite build', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'frontend', 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /tsc -b && vite build && node \.\.\/scripts\/sync-dist\.mjs$/);
});
