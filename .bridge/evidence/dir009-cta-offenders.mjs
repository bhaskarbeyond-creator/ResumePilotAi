// Temporary helper: dump every CTA whose computed background is NOT the
// canonical Cuba primary gradient, so the fix list is empirical not guessed.
import fs from 'node:fs';

const CANONICAL = 'linear-gradient(135deg, rgb(115, 102, 255) 0%, rgb(89, 73, 214) 100%)';
const report = JSON.parse(fs.readFileSync('.bridge/evidence/dir009-dom-crawl.json', 'utf8'));

for (const [route, facts] of Object.entries(report.routes)) {
    if (facts.error || !facts.ctas) continue;
    const bad = facts.ctas.filter(
        (c) => c.bgImage.includes('gradient') && c.bgImage !== CANONICAL,
    );
    if (!bad.length) continue;
    console.log(`\n===== ${route} (${bad.length} non-canonical)`);
    for (const c of bad) {
        console.log(`  <${c.tag}> text="${c.text}"`);
        console.log(`     cls : ${c.cls}`);
        console.log(`     bg  : ${c.bgImage}`);
        console.log(`     fg  : ${c.color}`);
    }
}
console.log(`\nCANONICAL = ${CANONICAL}`);
