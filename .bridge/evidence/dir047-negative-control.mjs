// DIR-047 negative control: prove the relaxed guard still fails when the
// Tailwind import is genuinely missing. Temporary, self-deleting.
import fs from 'node:fs';
const p = 'tests/cuba-design-system.test.mjs';
const orig = fs.readFileSync(p, 'utf8');
const broken = orig.replace(
    "@import\\s+'tailwindcss'[^;]*;",
    "@import\\s+'XBREAKtailwindcss'[^;]*;",
);
if (broken === orig) {
    console.error('NEGATIVE CONTROL SETUP FAILED: pattern not found');
    process.exit(2);
}
fs.writeFileSync('tests/_negctl.tmp.mjs', broken);
const { execFileSync } = await import('node:child_process');
let out = '';
let code = 0;
try {
    out = execFileSync(process.execPath, ['--test', 'tests/_negctl.tmp.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
    code = e.status ?? 1;
}
fs.rmSync('tests/_negctl.tmp.mjs', { force: true });
const failed = /not ok|AssertionError/.test(out) || code !== 0;
console.log(`negative-control exit=${code} guardRejectedMissingImport=${failed}`);
if (!failed) {
    console.error('REGRESSION: guard accepted a tailwind.css with no Tailwind import');
    process.exit(1);
}