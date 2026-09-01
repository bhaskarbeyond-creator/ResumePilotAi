/**
 * AUDIT ALL CATCH BLOCKS IN REPOSITORY
 * Finds:
 * catch { return [] }
 * catch { return {} }
 * catch { return 0 }
 * catch { return null }
 * and analyzes whether error propagation is preserved or hidden.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const targets = [
  'backend/routes',
  'backend/services',
  'backend/repositories',
  'src/services',
  'src/components/admin',
  'src/enterprise'
];

console.log('================================================================');
console.log('AUDITING CATCH BLOCKS FOR SILENT ERROR HIDING');
console.log('================================================================\n');

function findFiles(dir, exts = ['.js', '.jsx', '.cjs', '.mjs']) {
  let files = [];
  const full = path.join(rootDir, dir);
  if (!fs.existsSync(full)) return files;
  const list = fs.readdirSync(full, { withFileTypes: true });
  for (const item of list) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      files = files.concat(findFiles(p, exts));
    } else if (exts.some(ext => item.name.endsWith(ext))) {
      files.push(p);
    }
  }
  return files;
}

const suspiciousPatterns = [
  { name: 'catch-return-empty-array', regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s*\[\s*\]\s*;?\s*\}/g },
  { name: 'catch-return-empty-object', regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s*\{\s*\}\s*;?\s*\}/g },
  { name: 'catch-return-zero', regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s*0\s*;?\s*\}/g },
  { name: 'catch-return-null', regex: /catch\s*\([^)]*\)\s*\{[^}]*return\s*null\s*;?\s*\}/g },
  { name: 'catch-empty-block', regex: /catch\s*\([^)]*\)\s*\{\s*\}/g },
  { name: 'catch-set-zero-state', regex: /catch\s*\([^)]*\)\s*\{[^}]*set[A-Za-z0-9]+\(\s*0\s*\)/g },
  { name: 'catch-set-empty-array', regex: /catch\s*\([^)]*\)\s*\{[^}]*set[A-Za-z0-9]+\(\s*\[\s*\]\s*\)/g }
];

const findings = [];

for (const target of targets) {
  const files = findFiles(target);
  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    for (const pattern of suspiciousPatterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const line = content.slice(0, match.index).split('\n').length;
        const snippet = match[0].replace(/\s+/g, ' ').slice(0, 100);
        findings.push({
          file: file.replace(/\\/g, '/'),
          line,
          pattern: pattern.name,
          snippet
        });
      }
    }
  }
}

console.log(`Audited ${targets.length} target directories.`);
console.log(`Total catch-block patterns detected: ${findings.length}\n`);

// Classify findings
const classified = findings.map(f => {
  let classification = 'REVIEW_REQUIRED';
  let justification = '';

  if (f.file.includes('admin') || f.file.includes('platform')) {
    classification = 'ADMIN_UI_OR_API';
    justification = 'Admin route or UI component handling';
  } else if (f.file.includes('repositories') || f.file.includes('services')) {
    classification = 'CORE_SERVICE';
    justification = 'Core persistence or service layer';
  } else {
    classification = 'GENERIC_UI';
    justification = 'Frontend presentation layer';
  }

  return { ...f, classification, justification };
});

console.table(classified.slice(0, 30));
if (classified.length > 30) {
  console.log(`... and ${classified.length - 30} more items recorded.`);
}

fs.writeFileSync(path.join(rootDir, 'test-results/CATCH_BLOCK_AUDIT.json'), JSON.stringify(classified, null, 2), 'utf8');
console.log('\nAudit written to test-results/CATCH_BLOCK_AUDIT.json');
