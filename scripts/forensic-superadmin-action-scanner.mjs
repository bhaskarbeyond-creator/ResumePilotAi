import fs from 'fs';
import path from 'path';

// Scan all admin components
const adminDir = path.resolve('src/components/admin');
const enterpriseDir = path.resolve('src/enterprise');

function walk(dir) {
    let files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
            files = files.concat(walk(fullPath));
        } else if (/\.(jsx|js|tsx|ts)$/.test(e.name)) {
            files.push(fullPath);
        }
    }
    return files;
}

const adminFiles = walk(adminDir).concat(walk(enterpriseDir));

console.log('Discovered Admin & Enterprise UI files:', adminFiles.length);

const actions = [];
let actionIdCounter = 1;

// Regex patterns to identify UI action elements and handlers
const buttonRegex = /<(button|IconButton|Button|ButtonBase|Link|Tab|Switch|Select|MenuItem|a)[^>]*?(onClick|onChange|onSubmit|to)={([^}]+)}[^>]*?>([\s\S]*?)<\/\1>/gi;
const inputButtonRegex = /<input[^>]*?type=["'](button|submit|checkbox)["'][^>]*?(onChange|onClick)={([^}]+)}[^>]*?>/gi;
const fetchCallRegex = /(?:fetch|axios|apiClient|platformApi|enterpriseApi|adminApi)\.?(?:get|post|put|patch|delete)?\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;

// Also extract API endpoints defined in src/services/
const servicesDir = path.resolve('src/services');
const serviceFiles = walk(servicesDir);

console.log('Discovered Service files:', serviceFiles.length);

// Analyze catch blocks across frontend
const catchBlocks = [];
const allSrcFiles = walk(path.resolve('src'));
for (const file of allSrcFiles) {
    const code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/catch\s*\([^\)]*\)\s*\{\s*\}/.test(line) || /catch\s*\{\s*\}/.test(line)) {
            catchBlocks.push({ file: path.relative('.', file), line: i + 1, snippet: line.trim(), type: 'EMPTY_CATCH' });
        } else if (/catch\s*\([^\)]*\)\s*\{\s*\/\/[^\n]*\}/.test(line)) {
            catchBlocks.push({ file: path.relative('.', file), line: i + 1, snippet: line.trim(), type: 'COMMENTED_EMPTY_CATCH' });
        } else if (/catch\s*\([a-zA-Z0-9_]+\)\s*\{\s*console\.(log|warn|error)\([^)]+\);?\s*\}/.test(line)) {
            // Log only catch - check if it notifies user
            if (!line.includes('toast') && !line.includes('setError') && !line.includes('alert') && !line.includes('notification')) {
                catchBlocks.push({ file: path.relative('.', file), line: i + 1, snippet: line.trim(), type: 'LOG_ONLY_CATCH' });
            }
        }
    }
}

console.log('\n--- CATCH BLOCK AUDIT RESULTS ---');
console.log('Total potential silent catch blocks in src/:', catchBlocks.length);
fs.writeFileSync('test-results/FORENSIC_CATCH_AUDIT.json', JSON.stringify(catchBlocks, null, 2));

// Print summary of catch blocks in src/components/admin
const adminCatches = catchBlocks.filter(c => c.file.includes('admin') || c.file.includes('enterprise'));
console.log('Catch blocks in Admin/Enterprise components:', adminCatches.length);
adminCatches.forEach(c => console.log(`  [${c.type}] ${c.file}:${c.line} -> ${c.snippet}`));
