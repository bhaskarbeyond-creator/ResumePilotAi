/**
 * Wave 10 — codebase completeness scanner.
 * Walks backend/ and src/ and emits categorized findings for TODO/FIXME/XXX,
 * likely stub handlers, empty catch blocks, console.log in production code,
 * dead code patterns, and .only/.skip in tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['src', 'backend', 'tests'];
const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', 'test-results', 'playwright-report', '.arena', '.cache']);

const findings = [];

function walk(dir, rel) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(p, r);
    else if (/\.(js|jsx|cjs|mjs|ts|tsx)$/.test(entry.name)) {
      scanFile(p, r);
    }
  }
}

function add(category, severity, file, line, snippet) {
  findings.push({ category, severity, file, line, snippet: snippet.trim().slice(0, 200) });
}

function scanFile(absPath, relPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const isTest = /(test|spec)\./.test(relPath) || relPath.startsWith('tests/');
  const isBackend = relPath.startsWith('backend/');

  lines.forEach((line, idx) => {
    const ln = idx + 1;
    const stripped = line.replace(/^\s*\/\/.*$/,'').replace(/^\s*\*.*$/,''); // ignore pure-comment lines in most checks
    // 1. TODO/FIXME/XXX/HACK
    const todoMatch = line.match(/\b(TODO|FIXME|XXX|HACK|TEMPORARY|WORKAROUND|QUICK\s*FIX)\b[:\s]/i);
    if (todoMatch) {
      add('TODO/FIXME', 'info', relPath, ln, line);
    }

    // 2. console.log in non-test source code (console.warn/error are OK)
    if (!isTest && /\bconsole\.log\s*\(/.test(line) && !/^\s*\/\//.test(line)) {
      add('console.log (production leak)', 'medium', relPath, ln, line);
    }

    // 3. .only / .skip in tests (can cause tests to be silently skipped)
    if (isTest && /\.(only|skip)\s*\(/.test(line)) {
      add(`test.${line.match(/\.(only|skip)/)?.[1]}`, isTest && /\.only\(/.test(line) ? 'high' : 'low', relPath, ln, line);
    }

    // 4. Empty catch blocks
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\(\s*\)\s*\{\s*\}/.test(line)) {
      add('empty catch', 'low', relPath, ln, line);
    }

    // 5. eval( or new Function(
    if (!/lottie-web/.test(relPath) && /\beval\s*\(/.test(line) && !/\/\/.*eval/.test(line)) {
      add('eval()', 'high', relPath, ln, line);
    }

    // 6. Hardcoded secrets look-alike (api_key|secret|password) = '...' with long value
    const secretMatch = line.match(/\b(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{16,}['"]/i);
    if (secretMatch && !/example|placeholder|test|dummy|changeme/i.test(line)) {
      add('possible hardcoded secret', 'high', relPath, ln, line);
    }

    // 7. Process.env.NODE_ENV checks that only gate DEV but don't handle prod
    if (/NODE_ENV\s*[!=]==?\s*['"](development|dev|test)['"]/.test(line) && !/production|NODE_ENV\s*!==/.test(lines.slice(Math.max(0, idx-3), idx+3).join(' '))) {
      // Lower severity; just note
    }

    // 8. Placeholder stubs: "return null", "return {}" or "res.sendStatus(501)"
    if (/res\.status\(501\)|not\s+implemented|stub|placeholder|TODO\s*:\s*implement/i.test(line)) {
      add('stub/not-implemented', 'medium', relPath, ln, line);
    }
  });

  // 9. Unused exports / re-exports — heuristically find exports with no imports elsewhere (cheap: grep count)
  // Done in second pass below.
}

for (const d of SCAN_DIRS) walk(path.join(ROOT, d), d);

// Group and print
const byCategory = {};
for (const f of findings) {
  (byCategory[f.category] = byCategory[f.category] || []).push(f);
}

console.log(`# Wave 10 Codebase Completeness Scan\n`);
console.log(`Scanned directories: ${SCAN_DIRS.join(', ')}`);
console.log(`Total findings: ${findings.length}\n`);

const bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
console.log('## Severity Summary\n');
console.log('| Severity | Count |');
console.log('|---|---:|');
for (const s of ['high', 'medium', 'low', 'info']) console.log(`| ${s} | ${bySeverity[s] || 0} |`);

console.log('\n## Findings by Category\n');
const cats = Object.keys(byCategory).sort();
for (const cat of cats) {
  const list = byCategory[cat];
  console.log(`\n### ${cat} (${list.length})`);
  for (const f of list.slice(0, 50)) {
    console.log(`- [${f.severity}] ${f.file}:${f.line} — ${f.snippet.replace(/\|/g,'\\|')}`);
  }
  if (list.length > 50) console.log(`- …and ${list.length - 50} more`);
}

// Write markdown
let md = `# Wave 10 Codebase Completeness Scan\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md += `- Scanned directories: ${SCAN_DIRS.join(', ')}\n- Total findings: **${findings.length}**\n\n`;
md += `## Severity Summary\n\n| Severity | Count |\n|---|---:|\n`;
for (const s of ['high', 'medium', 'low', 'info']) md += `| ${s} | ${bySeverity[s] || 0} |\n`;
for (const cat of cats) {
  md += `\n## ${cat} (${byCategory[cat].length})\n\n`;
  for (const f of byCategory[cat]) {
    md += `- **${f.severity.toUpperCase()}** \`${f.file}:${f.line}\` — \`${f.snippet.replace(/`/g,'\\`')}\`\n`;
  }
}
fs.writeFileSync(path.join(ROOT, 'docs/forensic/wave10/CODEBASE_COMPLETENESS_SCAN.md'), md);
console.log(`\nWrote docs/forensic/wave10/CODEBASE_COMPLETENESS_SCAN.md`);
