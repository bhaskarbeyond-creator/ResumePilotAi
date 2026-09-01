import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDirs = [
    path.join(__dirname, '../tests'),
    path.join(__dirname, '../backend/test')
];

function scanDir(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            files.push(...scanDir(full));
        } else if (e.isFile() && /\.(js|mjs|cjs|ts)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const testFiles = testDirs.flatMap(scanDir);
console.log(`Scanning ${testFiles.length} test files for SQL mutations...`);

const sqlKeywords = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'UPSERT', 'DROP', 'ALTER'];
const matches = [];

for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
        for (const kw of sqlKeywords) {
            const regex = new RegExp(`\\b${kw}\\b\\s+(INTO|FROM|TABLE)?\\s*([a-zA-Z0-9_]+)?`, 'i');
            if (regex.test(line)) {
                // Check if it's an actual query or mock or string
                if (line.includes('query(') || line.includes('execute(') || line.includes('`') || line.includes('"') || line.includes("'")) {
                    matches.push({
                        file: path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/'),
                        line: idx + 1,
                        keyword: kw,
                        text: line.trim()
                    });
                }
            }
        }
    });
}

console.log(`Found ${matches.length} potential SQL mutation references in test suites.`);

// Group by file
const fileGroups = {};
for (const m of matches) {
    fileGroups[m.file] = (fileGroups[m.file] || 0) + 1;
}
console.log('Files with SQL references:', fileGroups);

fs.writeFileSync(
    path.join(__dirname, '../TEST_DATABASE_ISOLATION_AUDIT.json'),
    JSON.stringify(matches, null, 2)
);
