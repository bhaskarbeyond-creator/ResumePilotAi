import { readFileSync, writeFileSync } from 'node:fs';

const path = 'tests/e2e/dir021-command-copilot.spec.js';
let source = readFileSync(path, 'utf8');

// The DIR-012 wait pattern used a link name that does not exist in the live DOM.
// Matched line-by-line so the file's CRLF/LF convention is irrelevant.
const bad = [
    "    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });",
    "    await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible({ timeout: 60_000 });",
];
const good = '    await bootCandidate(page);';

const lines = source.split(/\r?\n/);
let replaced = 0;
for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === bad[0].trim() && lines[i + 1] && lines[i + 1].trim() === bad[1].trim()) {
        lines.splice(i, 2, good);
        replaced += 1;
        i += 1;
    }
}
source = lines.join('\n');
writeFileSync(path, source);

const remaining = (source.match(/getByRole\('link', \{ name: \/dashboard\//g) || []).length;
console.log(`replaced: ${replaced}`);
console.log(`remaining bad locators: ${remaining}`);
console.log(`bootCandidate call sites: ${(source.match(/await bootCandidate\(page\);/g) || []).length}`);