/**
 * COMPREHENSIVE HARDCODED DOMAIN AUDITOR
 * Scans repository for domain occurrences and classifies each.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_STRINGS = [
  'airesume.projectdemo.guru',
  'ai-resume-builder.local',
  'localhost',
  '127.0.0.1'
];

const SCAN_DIRS = ['backend', 'src', 'public', 'scripts'];
const IGNORE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.docx', '.zip', '.tar', '.gz', '.map'];

const results = [];

function scanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IGNORE_EXTS.includes(ext)) return;
  if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('dist')) return;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');

    for (const target of TARGET_STRINGS) {
      let startIndex = 0;
      while ((startIndex = content.indexOf(target, startIndex)) !== -1) {
        // find line number
        const linesUpTo = content.substring(0, startIndex).split('\n');
        const lineNum = linesUpTo.length;
        const lineContent = content.split('\n')[lineNum - 1].trim();

        // Classify
        let category = 'A. LEGITIMATE DEFAULT (env/configurable fallback)';
        let notes = '';

        if (relPath.includes('test') || relPath.includes('fixture') || relPath.startsWith('scripts/')) {
          category = 'D. TEST / FIXTURE ONLY';
          notes = 'Used in test suites or verification harnesses';
        } else if (lineContent.startsWith('//') || lineContent.startsWith('/*') || lineContent.startsWith('*') || relPath.endsWith('.md')) {
          category = 'C. DOCUMENTATION / COMMENT';
          notes = 'Documentation, JSDoc, or code comments';
        } else if (lineContent.includes('process.env.') || lineContent.includes('import.meta.env.') || lineContent.includes('||') || lineContent.includes('??')) {
          category = 'A. LEGITIMATE DEFAULT (env fallback)';
          notes = 'Fallback after environment variable check';
        } else if (target === 'airesume.projectdemo.guru') {
          category = 'B. PRODUCTION DEFECT (hardcoded external staging domain)';
          notes = 'CRITICAL: hardcoded external domain found in source code!';
        } else {
          category = 'E. DYNAMIC / CONFIGURABLE / INTERNAL';
          notes = 'Internal socket or host configuration';
        }

        results.push({
          target,
          file: relPath,
          line: lineNum,
          category,
          lineSnippet: lineContent.slice(0, 120),
          notes
        });

        startIndex += target.length;
      }
    }
  } catch (err) {
    // skip binary or unreadable
  }
}

function walkDir(dir) {
  const fullPath = path.resolve(ROOT_DIR, dir);
  if (!fs.existsSync(fullPath)) return;
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'test-results') continue;
    const itemPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(path.relative(ROOT_DIR, itemPath));
    } else if (entry.isFile()) {
      scanFile(itemPath);
    }
  }
}

console.log('Scanning repository for domain occurrences...');
for (const dir of SCAN_DIRS) {
  walkDir(dir);
}

const reportDir = path.resolve(ROOT_DIR, 'test-results');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'DOMAIN_HARDCODING_AUDIT.json'), JSON.stringify(results, null, 2));

const byCategory = {};
for (const r of results) {
  byCategory[r.category] = (byCategory[r.category] || 0) + 1;
}

const stagingOccurrences = results.filter(r => r.target === 'airesume.projectdemo.guru');

console.log('\n================================================================');
console.log('DOMAIN HARDCODING AUDIT SUMMARY:');
console.log('Total Occurrences Found:', results.length);
console.log('Breakdown by Category:');
console.table(byCategory);

console.log('\nOccurrences of airesume.projectdemo.guru:', stagingOccurrences.length);
if (stagingOccurrences.length > 0) {
  console.table(stagingOccurrences.map(s => ({ file: s.file, line: s.line, category: s.category, snippet: s.lineSnippet })));
}
console.log('================================================================\n');

const p0Defects = results.filter(r => r.category.includes('B. PRODUCTION DEFECT'));
if (p0Defects.length > 0) {
  console.error('P0 DEFECTS FOUND:', p0Defects.length);
  process.exit(1);
} else {
  console.log('ZERO P0 HARDCODING DEFECTS FOUND.');
  process.exit(0);
}
