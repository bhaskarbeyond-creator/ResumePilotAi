import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targets = [
    path.join(__dirname, '../src/components/admin'),
    path.join(__dirname, '../src/services'),
    path.join(__dirname, '../backend/routes'),
    path.join(__dirname, '../backend/services'),
    path.join(__dirname, '../backend/repositories')
];

const patterns = ['mock', 'dummy', 'demo', 'sample', 'fallback', 'hardcoded', 'localStorage', 'sessionStorage', 'Firestore'];

function scanDir(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') {
            files.push(...scanDir(full));
        } else if (e.isFile() && /\.(jsx?|tsx?)$/.test(e.name)) {
            files.push(full);
        }
    }
    return files;
}

const allFiles = targets.flatMap(scanDir);
const matches = [];

for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
        for (const p of patterns) {
            const regex = new RegExp(`\\b${p}\\b`, 'i');
            if (regex.test(line)) {
                // Ignore test files or comments that explicitly disclaim
                matches.push({
                    file: path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/'),
                    line: idx + 1,
                    pattern: p,
                    text: line.trim().slice(0, 120)
                });
            }
        }
    });
}

console.log(`Total pattern occurrences found: ${matches.length}`);

// Group by pattern
const grouped = {};
for (const m of matches) {
    grouped[m.pattern] = (grouped[m.pattern] || 0) + 1;
}
console.log('Grouped counts:', grouped);

fs.writeFileSync(
    path.join(__dirname, '../SUPER_ADMIN_AUTHORITY_AUDIT.json'),
    JSON.stringify(matches, null, 2)
);
console.log('Saved detailed audit to SUPER_ADMIN_AUTHORITY_AUDIT.json');
