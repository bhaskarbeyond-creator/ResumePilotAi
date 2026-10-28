#!/usr/bin/env node
/**
 * AUDIT-ONLY inventory extractor (developer-review/tools/).
 *
 * Produces a complete, reproducible accounting of:
 *   - every legacy file under src/ (root JSX tree), with domain mapping,
 *   - every modern file under frontend/src/,
 *   - the API surface each tree references,
 *   - signals used to classify stubs / fabricated state (seed arrays, api calls,
 *     timeouts, localStorage).
 *
 * Output: developer-review/Evidence/artifacts/legacy-modern-inventory.json
 *         developer-review/Evidence/artifacts/legacy-file-inventory.tsv
 *
 * It makes NO judgement about parity. Classification lives in
 * developer-review/FEATURE-PARITY-MATRIX.md and is evidence-referenced back to
 * this file's records by path.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'developer-review', 'Evidence', 'artifacts');
const LEGACY = path.join(ROOT, 'src');
const MODERN = path.join(ROOT, 'frontend', 'src');

/** Directory-prefix → feature domain. First match wins, longest prefix first. */
const LEGACY_DOMAIN_RULES = [
  ['src/components/PortfolioBuilder', 'C-portfolio-webcv'],
  ['src/components/PortfolioTemplates', 'C-portfolio-webcv'],
  ['src/components/PublicPortfolio', 'C-portfolio-webcv'],
  ['src/cv-templates', 'E-resume-templates'],
  ['src/components/BuildResume', 'E-resume-builder'],
  ['src/components/Boards', 'E-resume-builder'],
  ['src/components/Actions', 'E-resume-builder'],
  ['src/components/Exporter', 'E-resume-builder'],
  ['src/components/Form', 'E-resume-builder'],
  ['src/components/admin', 'A-super-admin'],
  ['src/enterprise', 'B-enterprise'],
  ['src/components/enterprise', 'B-enterprise'],
  ['src/components/Dashboard/DashboardInterviews', 'D-voice-interview'],
  ['src/hooks/useInterviewMedia', 'D-voice-interview'],
  ['src/components/Candidate', 'D-candidate-experience'],
  ['src/components/Dashboard', 'D-candidate-experience'],
  ['src/components/Dashboard2', 'D-candidate-experience'],
  ['src/components/cuba', 'D-candidate-experience'],
  ['src/components/AppShell', 'D-candidate-experience'],
  ['src/components/EmployerPortal', 'F-employer'],
  ['src/components/JobsListings', 'F-employer'],
  ['src/components/JobsLanding', 'F-employer'],
  ['src/components/AppliedJobs', 'F-employer'],
  ['src/components/Billing', 'A-super-admin'],
  ['src/components/Marketing', 'A-super-admin'],
  ['src/components/Blog', 'G-content'],
  ['src/components/CustomPage', 'G-content'],
  ['src/components/MetaManager', 'G-content'],
  ['src/components/auth', 'G-platform-shared'],
  ['src/components/common', 'G-platform-shared'],
  ['src/components/Toasts', 'G-platform-shared'],
  ['src/components/Spinner', 'G-platform-shared'],
  ['src/components/welcome', 'G-platform-shared'],
  ['src/components/initailisation', 'G-platform-shared'],
  ['src/components/PublicResume', 'E-resume-builder'],
  ['src/components/CoverLetter', 'D-candidate-experience'],
  ['src/components/Contact', 'G-content'],
  ['src/engine', 'G-platform-shared'],
  ['src/services', 'G-platform-shared'],
  ['src/utils', 'G-platform-shared'],
  ['src/models', 'G-platform-shared'],
  ['src/conf', 'G-platform-shared'],
  ['src/locales', 'G-platform-shared'],
];

function domainFor(relPath) {
  const normalised = relPath.replace(/\\/g, '/');
  const rules = [...LEGACY_DOMAIN_RULES].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, domain] of rules) {
    if (normalised === prefix || normalised.startsWith(prefix + '/')) return domain;
  }
  return 'G-unclassified';
}

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
        stack.push(full);
      } else if (exts.includes(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

const API_RE = /['"`](\/api\/[A-Za-z0-9_\-/${}.]*)['"`]/g;
const API_CALL_RE = /(?:apiClient|client)\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*['"`]([^'"`]+)['"`]/g;
const BARE_HELPER_RE = /\b(?:get|post|patch|put|del)(?:<[^>]*>)?\(\s*['"`](\/[A-Za-z0-9_\-/${}.]+)['"`]/g;

function normaliseEndpoint(raw) {
  let value = String(raw);
  if (value.startsWith('/api/')) value = value.slice(4);
  value = value.replace(/\$\{[^}]*\}/g, '{X}').replace(/\{X\}+/g, '{X}');
  return value.replace(/\/+$/, '') || '/';
}

function endpointsIn(text) {
  const found = new Set();
  for (const re of [API_RE, API_CALL_RE, BARE_HELPER_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) found.add(normaliseEndpoint(match[1]));
  }
  return [...found].sort();
}

function signals(text) {
  return {
    seedArrays: (text.match(/const (?:INITIAL|MOCK|FAKE|SAMPLE|DEMO|DEFAULT|FALLBACK)[A-Z_]*\s*(?::[^=]+)?=\s*\[/g) || []).length,
    apiCalls: (text.match(/apiClient\.|enterpriseApi\.|from '@\/lib\/api-client'|\bawait (?:get|post|patch|put|del)</g) || []).length,
    localStorage: (text.match(/localStorage\./g) || []).length,
    setTimeoutFake: (text.match(/setTimeout\(/g) || []).length,
    todoMarkers: (text.match(/(?:\/\/|\*)\s*(?:TODO|FIXME|not implemented|placeholder)/gi) || []).length,
    speechApis: (text.match(/SpeechRecognition|webkitSpeechRecognition|speechSynthesis|getUserMedia|MediaRecorder|AudioContext/g) || []).length,
    qrCode: (text.match(/qrcode|QRCode|qr-code/gi) || []).length,
    imageCrop: (text.match(/crop|Cropper|zoom/gi) || []).length,
    puck: (text.match(/@puckeditor/g) || []).length,
    mapProvider: (text.match(/google.*maps|@react-google-maps|leaflet|mapbox/gi) || []).length,
  };
}

function collect(baseDir, exts, label) {
  return walk(baseDir, exts).map(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    return {
      tree: label,
      path: rel,
      bytes: Buffer.byteLength(text),
      lines: text.split('\n').length,
      domain: label === 'legacy' ? domainFor(rel) : null,
      endpoints: endpointsIn(text),
      signals: signals(text),
    };
  });
}

const legacy = collect(LEGACY, ['.js', '.jsx'], 'legacy');
const modern = collect(MODERN, ['.ts', '.tsx'], 'modern');

const legacyApi = new Set(legacy.flatMap(f => f.endpoints));
const modernApi = new Set(modern.flatMap(f => f.endpoints));

const byDomain = {};
for (const file of legacy) {
  const d = (byDomain[file.domain] ??= { files: 0, jsx: 0, lines: 0, endpoints: new Set() });
  d.files += 1;
  if (file.path.endsWith('.jsx')) d.jsx += 1;
  d.lines += file.lines;
  file.endpoints.forEach(e => d.endpoints.add(e));
}
for (const value of Object.values(byDomain)) value.endpoints = [...value.endpoints].sort();

const payload = {
  generatedAt: new Date().toISOString(),
  revision: require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(),
  counts: {
    legacyFiles: legacy.length,
    legacyJsx: legacy.filter(f => f.path.endsWith('.jsx')).length,
    legacyLines: legacy.reduce((n, f) => n + f.lines, 0),
    modernFiles: modern.length,
    modernTsx: modern.filter(f => f.path.endsWith('.tsx')).length,
    modernLines: modern.reduce((n, f) => n + f.lines, 0),
    legacyEndpoints: legacyApi.size,
    modernEndpoints: modernApi.size,
    legacyOnlyEndpoints: [...legacyApi].filter(e => !modernApi.has(e)).length,
    modernOnlyEndpoints: [...modernApi].filter(e => !legacyApi.has(e)).length,
    sharedEndpoints: [...legacyApi].filter(e => modernApi.has(e)).length,
  },
  endpointOverlap: {
    shared: [...legacyApi].filter(e => modernApi.has(e)).sort(),
    legacyOnly: [...legacyApi].filter(e => !modernApi.has(e)).sort(),
    modernOnly: [...modernApi].filter(e => !legacyApi.has(e)).sort(),
  },
  domains: Object.fromEntries(Object.entries(byDomain).map(([k, v]) => [k, {
    files: v.files, jsx: v.jsx, lines: v.lines, endpoints: v.endpoints.length,
  }])),
  files: { legacy, modern },
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'legacy-modern-inventory.json'), JSON.stringify(payload, null, 1));

const tsv = ['domain\tpath\tlines\tendpoints\tseedArrays\tapiCalls\tspeechApis\tqrCode\timageCrop\tpuck\tmapProvider'];
for (const f of legacy) {
  tsv.push([
    f.domain, f.path, f.lines, f.endpoints.length, f.signals.seedArrays, f.signals.apiCalls,
    f.signals.speechApis, f.signals.qrCode, f.signals.imageCrop, f.signals.puck, f.signals.mapProvider,
  ].join('\t'));
}
fs.writeFileSync(path.join(OUT_DIR, 'legacy-file-inventory.tsv'), tsv.join('\n') + '\n');

console.log('legacy files      :', payload.counts.legacyFiles, `(${payload.counts.legacyJsx} .jsx, ${payload.counts.legacyLines} lines)`);
console.log('modern files      :', payload.counts.modernFiles, `(${payload.counts.modernTsx} .tsx, ${payload.counts.modernLines} lines)`);
console.log('endpoints legacy  :', payload.counts.legacyEndpoints);
console.log('endpoints modern  :', payload.counts.modernEndpoints);
console.log('shared / legacy-only / modern-only:',
  payload.counts.sharedEndpoints, '/', payload.counts.legacyOnlyEndpoints, '/', payload.counts.modernOnlyEndpoints);
console.log('\ndomain                 files  jsx   lines  endpoints');
for (const [domain, v] of Object.entries(payload.domains).sort()) {
  console.log(`${domain.padEnd(22)}${String(v.files).padStart(6)}${String(v.jsx).padStart(5)}${String(v.lines).padStart(8)}${String(v.endpoints).padStart(11)}`);
}
