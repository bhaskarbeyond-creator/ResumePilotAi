import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const file = path.join(__dirname, '../src/services/api/platform.js');
const content = fs.readFileSync(file, 'utf8');
const lines = content.split(/\r?\n/);

console.log('=== AUDITING CATCH BLOCKS IN platform.js ===');
const errorHidingFound = [];

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('catch')) {
        const snippet = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 8)).join('\n');
        // Check if returns success: true or empty array without error
        if (snippet.includes('success: true') || snippet.includes('return []') || snippet.includes('return {}') || snippet.includes('return null')) {
            errorHidingFound.push({
                line: i + 1,
                snippet: lines.slice(i, i + 6).join('\n')
            });
        }
    }
}

console.log(`Found ${errorHidingFound.length} potential error-hiding catch blocks:`);
errorHidingFound.forEach((eh, idx) => {
    console.log(`\n[#${idx + 1}] Line ${eh.line}:\n${eh.snippet}`);
});
