/**
 * DIR-103+ — Master UI/UX Transformation, Tier 2: parameterised ROUTE TEMPLATES.
 *
 * Tier 1 reviewed the distinct pages. Tier 2 requires every parameterised route template
 * to be audited against REAL record data (seeded from MariaDB where the collection is
 * empty) and ACCEPTED at >=98/100. Exits 1 until that holds.
 *
 * Usage: node scripts/ux-templates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'templates.json');

if (!fs.existsSync(INV)) {
    console.log('Tier 2 template inventory not yet built (.bridge/evidence/dir098/templates.json)');
    process.exit(1);
}
const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
const accepted = inv.units.filter((u) => u.acceptance === 'ACCEPTED');
const pending = inv.units.filter((u) => u.acceptance !== 'ACCEPTED' && u.acceptance !== 'BLOCKED');

console.log(`Tier 2 template completeness: ${accepted.length}/${inv.units.length} templates ACCEPTED`);
if (pending.length) console.log(`  outstanding: ${pending.map((u) => u.route).join(', ')}`);
process.exit(pending.length === 0 && accepted.length === inv.units.length ? 0 : 1);
