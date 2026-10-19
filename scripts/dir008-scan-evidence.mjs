#!/usr/bin/env node
/**
 * DIR-008 — committed-evidence secret & PII scan (R-48).
 *
 * Scans the evidence bundle that ships with the repository (`docs/templates`,
 * `docs/audits`, `docs/acceptance`, `docs/test-reports`, `docs/release`).
 *
 * Design rules:
 *   • A hit is reported with its location and a redacted fingerprint — the
 *     scanner never copies a secret into its own report.
 *   • Synthetic evidence identities are allowed only when they use reserved
 *     documentation domains (`example.com/.org/.net`, `example.test`) and
 *     reserved phone numbers (the 0000 test block).
 *   • `findHits` is exported so the efficacy test can prove the rules fire on
 *     real secret shapes instead of trusting a clean report.
 *
 * Usage: node scripts/dir008-scan-evidence.mjs
 * Exit: 0 when clean, 1 when a blocking hit is found.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TARGETS = [
  'docs/templates',
  'docs/audits',
  'docs/acceptance',
  'docs/test-reports',
  'docs/release',
];

export const RULES = [
  { id: 'private-key', severity: 'block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'aws-access-key', severity: 'block', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'github-token', severity: 'block', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { id: 'stripe-key', severity: 'block', pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { id: 'slack-token', severity: 'block', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', severity: 'block', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { id: 'openai-key', severity: 'block', pattern: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { id: 'jwt', severity: 'block', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'password-assignment', severity: 'block', pattern: /(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
  { id: 'bearer-token', severity: 'block', pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/ },
  {
    id: 'real-email',
    severity: 'review',
    pattern: /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: 'non-reserved-phone',
    severity: 'review',
    // Requires a country code or a separator so digit runs inside hashes and
    // hexadecimal fingerprints are not mistaken for telephone numbers.
    pattern:
      /(?<![0-9A-Za-z])(?:\+\d{1,3}[\s-]\d{2,5}[\s-]\d{3,5}(?:[\s-]\d{3,4})?|\(\d{2,5}\)\s?\d{3,5}[\s-]\d{3,4})(?![0-9A-Za-z])/g,
  },
];

export function fingerprint(match) {
  const value = String(match);
  if (value.length <= 8) return `${value.slice(0, 2)}…(${value.length})`;
  return `${value.slice(0, 4)}…${value.slice(-2)}(${value.length})`;
}

/**
 * Pure rule evaluation over a block of text.
 */
export function findHits(text, file = '<memory>') {
  const found = [];
  text.split('\n').forEach((line, index) => {
    for (const rule of RULES) {
      const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
      const regex = new RegExp(rule.pattern.source, flags);
      for (const match of line.matchAll(regex)) {
        if (rule.id === 'non-reserved-phone') {
          const digits = match[0].replace(/\D/g, '');
          if (/^1?0{6,}$/.test(digits)) continue;
          if (digits.includes('0000')) continue;
          if (digits.length < 10) continue;
        }
        found.push({
          rule: rule.id,
          severity: rule.severity,
          file,
          line: index + 1,
          fingerprint: fingerprint(match[0]),
        });
      }
    }
  });
  return found;
}

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (/\.(md|json|html|svg|txt|ts|tsx|js|mjs|css)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

async function main() {
  const files = [];
  for (const target of TARGETS) await walk(path.join(ROOT, target), files);

  const hits = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    hits.push(...findHits(content, path.relative(ROOT, file)));
  }

  const blocking = hits.filter((hit) => hit.severity === 'block');
  const review = hits.filter((hit) => hit.severity === 'review');

  const report = {
    directive: 'DIR-008',
    requirement: 'R-48',
    generatedAt: new Date().toISOString(),
    scanned: { directories: TARGETS, files: files.length },
    rules: RULES.map((rule) => rule.id),
    blocking: blocking.length,
    review: review.length,
    hits,
    note: 'Fingerprints are redacted; the scanner never copies a matched value into the report. Synthetic identities on reserved documentation domains and reserved phone numbers are not reported.',
  };

  await fs.mkdir(path.join(ROOT, 'docs', 'test-reports'), { recursive: true });
  await fs.writeFile(
    path.join(ROOT, 'docs', 'test-reports', 'DIR-008-evidence-secret-scan.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const md = [];
  md.push('# DIR-008 — evidence secret & PII scan (R-48)');
  md.push('');
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Scanned: ${files.length} files across ${TARGETS.length} evidence directories.`);
  md.push('');
  md.push(`**Blocking findings:** ${blocking.length}  •  **Review findings:** ${review.length}`);
  md.push('');
  md.push('| Rule | Severity | File | Line | Redacted match |');
  md.push('| --- | --- | --- | --- | --- |');
  if (hits.length === 0) md.push('| — | — | — | — | none |');
  for (const hit of hits) {
    md.push(`| ${hit.rule} | ${hit.severity} | \`${hit.file}\` | ${hit.line} | \`${hit.fingerprint}\` |`);
  }
  md.push('');
  md.push(report.note);
  md.push('');
  await fs.writeFile(path.join(ROOT, 'docs', 'test-reports', 'DIR-008-evidence-secret-scan.md'), md.join('\n'));

  console.log(`scanned ${files.length} files: ${blocking.length} blocking, ${review.length} review`);
  if (blocking.length > 0) {
    console.error('blocking findings present');
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
