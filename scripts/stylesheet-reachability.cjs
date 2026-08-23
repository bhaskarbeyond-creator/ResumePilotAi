'use strict';

/**
 * Stylesheet reachability analysis.
 *
 * A stylesheet is REACHABLE if any of the following holds:
 *   - a JS/JSX module under src/** imports it (statically or dynamically),
 *   - another reachable stylesheet pulls it in via @use / @import / @forward,
 *   - it is referenced from index.html or the public/ directory,
 *   - it is a SCSS partial (`_name.scss`) consumed by the above.
 *
 * Anything else is unreferenced by the build graph and cannot affect the
 * rendered application. Reporting it is safe; DELETING it still requires the
 * per-file checks in `verifyDeletable` below, because a file can be pulled in
 * by a non-obvious mechanism (string-built import, tooling config, template
 * lab, or a build script).
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const STYLE_EXTENSIONS = ['.css', '.scss', '.sass'];
const CODE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = file => path.relative(REPO_ROOT, file).split(path.sep).join('/');

function resolveStyleSpecifier(fromFile, specifier) {
  if (!specifier || /^[a-z]+:/i.test(specifier)) return null;
  const cleaned = specifier.replace(/^~/, '');
  if (!cleaned.startsWith('.') && !cleaned.startsWith('/')) return null;
  const base = path.resolve(path.dirname(fromFile), cleaned);
  const dirName = path.dirname(base);
  const baseName = path.basename(base);
  const candidates = [
    base,
    ...STYLE_EXTENSIONS.map(ext => base + ext),
    // SCSS partials may be referenced without the leading underscore.
    ...STYLE_EXTENSIONS.map(ext => path.join(dirName, `_${baseName}${ext}`)),
    ...STYLE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

/** Compute the set of stylesheets reachable from the application entry points. */
function analyze() {
  const srcFiles = walk(path.join(REPO_ROOT, 'src'));
  const allStyles = srcFiles.filter(file => STYLE_EXTENSIONS.includes(path.extname(file)));
  // template-lab/ is a second Rollup entry point declared in vite.config.js, so
  // its modules are part of the build graph and can keep a src/ stylesheet alive
  // (src/index.css is reachable only this way).
  const codeFiles = [...srcFiles, ...walk(path.join(REPO_ROOT, 'template-lab'))]
    .filter(file => CODE_EXTENSIONS.includes(path.extname(file)));

  const reachable = new Set();
  const referencedBy = new Map();
  const queue = [];

  const note = (target, source) => {
    if (!referencedBy.has(target)) referencedBy.set(target, new Set());
    referencedBy.get(target).add(source);
    if (!reachable.has(target)) { reachable.add(target); queue.push(target); }
  };

  // Seed 1: stylesheets imported by any JS/JSX module.
  for (const file of codeFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"]([^'"]+\.(?:css|scss|sass))['"]/g)) {
      const resolved = resolveStyleSpecifier(file, match[1]);
      if (resolved) note(resolved, rel(file));
    }
  }

  // Seed 2: stylesheets referenced from HTML entry points and other roots.
  const htmlRoots = [
    path.join(REPO_ROOT, 'index.html'),
    path.join(REPO_ROOT, 'src/index.html'),
    path.join(REPO_ROOT, 'template-lab/index.html'),
  ].filter(file => fs.existsSync(file));
  for (const file of htmlRoots) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/href=['"]([^'"]+\.(?:css|scss))['"]/g)) {
      const resolved = resolveStyleSpecifier(file, match[1]);
      if (resolved) note(resolved, rel(file));
    }
  }

  // Propagate through @use / @import / @forward inside reachable stylesheets.
  while (queue.length) {
    const current = queue.shift();
    const source = fs.readFileSync(current, 'utf8');
    for (const match of source.matchAll(/@(?:use|import|forward)\s+((?:['"][^'"]+['"]\s*,?\s*)+)/g)) {
      for (const spec of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const resolved = resolveStyleSpecifier(current, spec[1]);
        if (resolved) note(resolved, rel(current));
      }
    }
  }

  const unreferenced = allStyles.filter(file => !reachable.has(file));
  return {
    allStyles: allStyles.map(rel),
    reachable: [...reachable].map(rel).sort(),
    unreferenced: unreferenced.map(rel).sort(),
    referencedBy,
  };
}

/**
 * Extra safety net before deleting a stylesheet: prove the basename appears
 * nowhere outside stylesheet files themselves. Catches string-constructed
 * imports, tooling configuration, scripts and test fixtures that the module
 * graph cannot see.
 */
function verifyDeletable(relativeStylePath) {
  const baseName = path.basename(relativeStylePath);
  const stem = baseName.replace(/\.(css|scss|sass)$/, '');
  const searchRoots = ['src', 'scripts', 'tests', 'template-lab', 'public', 'backend']
    .map(dir => path.join(REPO_ROOT, dir))
    .filter(dir => fs.existsSync(dir));

  const hits = [];
  for (const root of searchRoots) {
    for (const file of walk(root)) {
      if (rel(file) === relativeStylePath) continue;
      const extension = path.extname(file);
      if (!['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.html', '.json', '.css', '.scss'].includes(extension)) continue;
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes(baseName)) hits.push({ file: rel(file), match: baseName });
      else if (STYLE_EXTENSIONS.includes(extension) && new RegExp(`@(?:use|import|forward)[^;]*['"][^'"]*${stem}['"]`).test(source)) {
        hits.push({ file: rel(file), match: stem });
      }
    }
  }
  const configFiles = ['vite.config.js', 'tailwind.config.js', 'package.json', 'eslint.config.js']
    .map(name => path.join(REPO_ROOT, name))
    .filter(file => fs.existsSync(file));
  for (const file of configFiles) {
    if (fs.readFileSync(file, 'utf8').includes(baseName)) hits.push({ file: rel(file), match: baseName });
  }
  return { deletable: hits.length === 0, hits };
}

module.exports = { REPO_ROOT, walk, rel, analyze, verifyDeletable };
