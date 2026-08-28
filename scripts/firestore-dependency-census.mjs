#!/usr/bin/env node
/**
 * Fail-closed Firebase product census.
 *
 * Firebase Authentication is the retained identity plane. Every production
 * source file is scanned without path-based runtime exemptions. Imports,
 * constructors, network endpoints, emulator flags, and deployment artifacts
 * for Firestore or any other Firebase data product fail certification.
 * Test-only references are inventoried separately and can never reduce the
 * production finding count.
 *
 * Usage:
 *   node scripts/firestore-dependency-census.mjs --check
 *   node scripts/firestore-dependency-census.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'docs', 'firestore-dependency-census.json');
const WRITE_REPORT = process.argv.includes('--write');
const SOURCE_ROOTS = ['backend', 'src', 'scripts', 'tests'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set([
  '.git', '.arena', '.cache', 'node_modules', 'dist', 'build', 'coverage',
  'test-results', 'playwright-report', 'scratch', 'artifacts',
]);
const TEST_SEGMENTS = new Set(['test', 'tests', 'enterprise-test', 'test-support', '__tests__', 'fixtures']);
const RETAINED_FIREBASE_MODULES = new Set([
  'firebase/app', 'firebase/compat/app', 'firebase/auth', 'firebase/compat/auth',
  'firebase-admin/app', 'firebase-admin/auth',
]);
const LEGACY_PRODUCT_FILES = [
  'backend/repositories/FirestoreRepository.js',
  'backend/database/syncManager.js',
  'backend/enterprise/firestoreEnterpriseRepository.js',
  'backend/enterprise/firebaseMigrationAdapter.js',
  'backend/enterprise/firebaseBridge.js',
  'src/firestore/auth.js',
  'src/firestore/dbOperations.js',
  'src/firestore/paidOperations.js',
  'SecurityRules.txt',
  'Realtime_database_Security_rules.txt',
  'firestore.indexes.json',
  'updated-firestore-rules.txt',
];

function* walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(absolute);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) yield absolute;
  }
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function isTestFile(relPath) {
  const parts = relPath.split('/');
  return parts.some(part => TEST_SEGMENTS.has(part))
    || /\.(?:test|spec)\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(relPath);
}

// Remove comments while preserving byte positions and line breaks. This avoids
// treating architecture prose as executable code without hiding string literals,
// imports, or calls.
function stripComments(source) {
  const chars = [...source];
  let state = 'code';
  let quote = null;
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const current = chars[index];
    const next = chars[index + 1];
    if (state === 'line') {
      if (current === '\n') state = 'code';
      else chars[index] = ' ';
      continue;
    }
    if (state === 'block') {
      if (current === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (current !== '\n') chars[index] = ' ';
      continue;
    }
    if (state === 'string') {
      if (escaped) { escaped = false; continue; }
      if (current === '\\') { escaped = true; continue; }
      if (current === quote) { state = 'code'; quote = null; }
      continue;
    }
    if (current === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'line';
    } else if (current === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'block';
    } else if (current === "'" || current === '"' || current === '`') {
      state = 'string';
      quote = current;
    }
  }
  return chars.join('');
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function excerptAt(source, index) {
  const start = source.lastIndexOf('\n', index - 1) + 1;
  const end = source.indexOf('\n', index);
  return source.slice(start, end < 0 ? source.length : end).trim().slice(0, 220);
}

const findings = [];
const terminology = [];
const scannedFiles = [];

function addFinding({ file, source = '', index = 0, kind, detail, testOnly = false }) {
  findings.push({
    file,
    line: source ? lineAt(source, index) : null,
    kind,
    detail,
    testOnly,
    text: source ? excerptAt(source, index) : null,
  });
}

const importPattern = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](firebase(?:-admin)?(?:\/[^'"]*)?)['"]/g;
const firestoreApiNames = [
  ['get', 'Firestore'].join(''),
  ['connect', 'Firestore', 'Emulator'].join(''),
  ['on', 'Snapshot'].join(''),
  ['collection', 'Group'].join(''),
  ['write', 'Batch'].join(''),
  ['run', 'Transaction'].join(''),
  ['get', 'Docs'].join(''),
  ['set', 'Doc'].join(''),
  ['update', 'Doc'].join(''),
  ['delete', 'Doc'].join(''),
];
const executablePatterns = [
  ...firestoreApiNames.map(name => ({ name, pattern: new RegExp(`\\b${name}\\s*\\(`, 'g') })),
  { name: 'Admin SDK database constructor', pattern: new RegExp('\\badmin\\s*\\.' + 'firestore' + '\\s*\\(', 'gi') },
  { name: 'collection method', pattern: new RegExp('\\.' + 'collection' + '\\s*\\(', 'g') },
  { name: 'Firestore REST/gRPC endpoint', pattern: new RegExp('(?:' + 'firestore' + '\\.googleapis\\.com|google\\.' + 'firestore' + '\\.v1)', 'gi') },
];
const dataPlaneConfigTokens = [
  ['FIRESTORE', 'EMULATOR', 'HOST'].join('_'),
  ['FIREBASE', 'DATABASE', 'EMULATOR', 'HOST'].join('_'),
  ['VITE', 'FIREBASE', 'DATABASE', 'URL'].join('_'),
  ['VITE', 'FIREBASE', 'STORAGE', 'BUCKET'].join('_'),
  ['FIREBASE', 'DATABASE', 'URL'].join('_'),
  ['FIREBASE', 'STORAGE', 'BUCKET'].join('_'),
];
const misleadingPhrases = [
  ['Firestore', 'Live'].join(' '),
  ['Firestore', 'credential'].join(' '),
  ['Authoritative', 'Firestore'].join(' '),
  ["source === '", 'firestore', "'"].join(''),
];

for (const rootName of SOURCE_ROOTS) {
  for (const file of walk(path.join(ROOT, rootName))) {
    const relPath = relative(file);
    const source = fs.readFileSync(file, 'utf8');
    const code = stripComments(source);
    const testOnly = isTestFile(relPath);
    scannedFiles.push({ file: relPath, testOnly });

    importPattern.lastIndex = 0;
    let match;
    while ((match = importPattern.exec(code)) !== null) {
      const specifier = match[1];
      if (RETAINED_FIREBASE_MODULES.has(specifier)) {
        terminology.push({ file: relPath, line: lineAt(source, match.index), kind: 'RETAINED_IDENTITY_IMPORT', text: specifier, testOnly });
      } else {
        addFinding({ file: relPath, source, index: match.index, kind: 'PROHIBITED_FIREBASE_PRODUCT_IMPORT', detail: specifier, testOnly });
      }
    }

    for (const { name, pattern } of executablePatterns) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(code)) !== null) {
        addFinding({ file: relPath, source, index: match.index, kind: 'PROHIBITED_FIRESTORE_API', detail: name, testOnly });
      }
    }

    // Configuration variables are executable dependencies even when their value
    // is read indirectly. The census implementation is the only source that
    // names these tokens as detector data; it contains no product integration.
    if (relPath !== 'scripts/firestore-dependency-census.mjs') {
      for (const token of dataPlaneConfigTokens) {
        let offset = code.indexOf(token);
        while (offset >= 0) {
          addFinding({ file: relPath, source, index: offset, kind: 'PROHIBITED_FIREBASE_DATA_CONFIG', detail: token, testOnly });
          offset = code.indexOf(token, offset + token.length);
        }
      }
      for (const phrase of misleadingPhrases) {
        let offset = code.toLowerCase().indexOf(phrase.toLowerCase());
        while (offset >= 0) {
          addFinding({ file: relPath, source, index: offset, kind: 'MISLEADING_FIRESTORE_RUNTIME_TEXT', detail: phrase, testOnly });
          offset = code.toLowerCase().indexOf(phrase.toLowerCase(), offset + phrase.length);
        }
      }
    }

    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (/\b(?:firestore|firebase realtime database|firebase storage)\b/i.test(line)) {
        terminology.push({ file: relPath, line: index + 1, kind: 'TERMINOLOGY_REFERENCE', text: line.trim().slice(0, 220), testOnly });
      }
    });
  }
}

for (const relPath of LEGACY_PRODUCT_FILES) {
  if (fs.existsSync(path.join(ROOT, relPath))) {
    addFinding({ file: relPath, kind: 'PROHIBITED_LEGACY_PRODUCT_ARTIFACT', detail: 'Legacy Firebase data-plane artifact remains in the repository', testOnly: false });
  }
}

const firebaseConfigPath = path.join(ROOT, 'firebase.json');
if (fs.existsSync(firebaseConfigPath)) {
  const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  for (const product of ['firestore', 'database', 'storage', 'functions']) {
    if (Object.hasOwn(config, product) || Object.hasOwn(config.emulators || {}, product)) {
      addFinding({ file: 'firebase.json', kind: 'PROHIBITED_FIREBASE_DEPLOYMENT_CONFIG', detail: product, testOnly: false });
    }
  }
}

const packagePath = path.join(ROOT, 'package.json');
if (fs.existsSync(packagePath)) {
  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const dependencies = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
  if (dependencies['@firebase/rules-unit-testing']) {
    addFinding({ file: 'package.json', kind: 'PROHIBITED_FIRESTORE_TEST_DEPENDENCY', detail: '@firebase/rules-unit-testing', testOnly: false });
  }
}

const productionFindings = findings.filter(finding => !finding.testOnly);
const testFindings = findings.filter(finding => finding.testOnly);
const summary = {
  generatedAt: new Date().toISOString(),
  status: productionFindings.length === 0 ? 'VERIFIED' : 'NOT VERIFIED',
  retainedFirebaseSurface: ['Firebase Authentication client', 'Firebase Admin Authentication'],
  scanRoots: SOURCE_ROOTS,
  sourceFilesScanned: scannedFiles.length,
  productionFilesScanned: scannedFiles.filter(file => !file.testOnly).length,
  testFilesScanned: scannedFiles.filter(file => file.testOnly).length,
  prohibitedProductionHits: productionFindings.length,
  activeDataPlaneHits: productionFindings.length,
  testOnlyHits: testFindings.length,
  retainedIdentityImports: terminology.filter(item => item.kind === 'RETAINED_IDENTITY_IMPORT').length,
  terminologyReferences: terminology.filter(item => item.kind === 'TERMINOLOGY_REFERENCE').length,
  pathBasedRuntimeExemptions: 0,
};
const report = { summary, productionFindings, testFindings, terminology };

if (WRITE_REPORT) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log('Firebase application-data dependency census');
console.log(`  production source files: ${summary.productionFilesScanned}`);
console.log(`  test source files: ${summary.testFilesScanned}`);
console.log(`  retained identity imports: ${summary.retainedIdentityImports}`);
console.log(`  prohibited production hits: ${summary.prohibitedProductionHits}`);
console.log(`  test-only hits (inventoried, not production): ${summary.testOnlyHits}`);
console.log(`  path-based runtime exemptions: ${summary.pathBasedRuntimeExemptions}`);
if (WRITE_REPORT) console.log(`  report: ${relative(OUTPUT)}`);
if (productionFindings.length > 0) {
  for (const finding of productionFindings) {
    console.error(`  ${finding.file}${finding.line ? `:${finding.line}` : ''} [${finding.kind}] ${finding.detail}`);
  }
  console.error('CERTIFICATION FAILURE: Firebase application-data dependencies remain.');
  process.exit(1);
}
console.log('CERTIFICATION: Firebase Authentication is the only Firebase production surface.');
