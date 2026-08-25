import fs from 'node:fs';
import path from 'node:path';

console.log('====================================================');
console.log('WHOLE-PRODUCT CODEBASE FORENSIC QUALITY SCAN');
console.log('====================================================\n');

const srcDir = path.resolve('src');
const backendDir = path.resolve('backend');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'test-results' || file === 'test') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else if (/\.(jsx?|tsx?|mjs|cjs)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const allSrcFiles = walk(srcDir);
const allBackendFiles = walk(backendDir);

const findings = {
  windowAlerts: [],
  windowConfirms: [],
  emptyCatches: [],
  todoFixme: [],
  hardcodedSecrets: []
};

for (const file of allSrcFiles) {
  const code = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);
  
  if (/window\.alert\(|alert\(/g.test(code) && !file.includes('test') && !code.includes('// allowed-alert')) {
    // Check if it's actual window alert and not a custom alert component
    const matches = code.match(/window\.alert\([^)]+\)/g);
    if (matches) findings.windowAlerts.push({ file: relPath, count: matches.length });
  }

  if (/window\.confirm\(|confirm\(/g.test(code) && !file.includes('test')) {
    const matches = code.match(/window\.confirm\([^)]+\)/g);
    if (matches) findings.windowConfirms.push({ file: relPath, count: matches.length });
  }

  // Check for suspicious empty catch blocks catch\s*\([^)]*\)\s*\{\s*\}
  const emptyCatchMatches = code.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
  if (emptyCatchMatches) {
    findings.emptyCatches.push({ file: relPath, count: emptyCatchMatches.length });
  }

  const todoMatches = code.match(/\b(TODO|FIXME|HACK|STUB|XXX)\b/gi);
  if (todoMatches) {
    findings.todoFixme.push({ file: relPath, count: todoMatches.length });
  }
}

for (const file of allBackendFiles) {
  const code = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);

  const emptyCatchMatches = code.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
  if (emptyCatchMatches) {
    findings.emptyCatches.push({ file: relPath, count: emptyCatchMatches.length });
  }

  const todoMatches = code.match(/\b(TODO|FIXME|HACK|STUB|XXX)\b/gi);
  if (todoMatches) {
    findings.todoFixme.push({ file: relPath, count: todoMatches.length });
  }
}

fs.writeFileSync('test-results/WHOLE_REPO_FORENSIC_SCAN.json', JSON.stringify(findings, null, 2));

console.log(`Scan completed across ${allSrcFiles.length + allBackendFiles.length} source and backend files.`);
console.log(`- Native window.alert() in client code: ${findings.windowAlerts.length}`);
console.log(`- Native window.confirm() in client code: ${findings.windowConfirms.length}`);
console.log(`- Silent empty catch blocks: ${findings.emptyCatches.length}`);
console.log(`- TODO / FIXME tags: ${findings.todoFixme.length}`);
console.log('\n====================================================');
