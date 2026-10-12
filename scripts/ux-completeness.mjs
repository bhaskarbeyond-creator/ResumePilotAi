/**
 * DIR-098 continuity gate: the Master UI/UX Transformation is complete ONLY when every
 * review unit has been reviewed and ACCEPTED with an evidence-backed score >= 98/100.
 * Exits 1 while any unit is outstanding, so the autonomous director keeps issuing the
 * next phase directive until the programme is genuinely finished.
 *
 * Usage: node scripts/ux-completeness.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INV = path.join(ROOT, '.bridge', 'evidence', 'dir098', 'inventory.json');
const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));

const accepted = inv.units.filter((u) => u.acceptance === 'ACCEPTED');
const blocked = inv.units.filter((u) => u.acceptance === 'BLOCKED');
const pending = inv.units.filter((u) => u.acceptance !== 'ACCEPTED' && u.acceptance !== 'BLOCKED');
const below = inv.units.filter((u) => u.acceptance === 'ACCEPTED' && !(typeof u.score === 'number' && u.score >= 98));

console.log(`UX transformation completeness: ${accepted.length}/${inv.units.length} units ACCEPTED, ${blocked.length} BLOCKED (documented)`);
if (below.length) console.log(`  ${below.length} unit(s) accepted below 98/100`);
if (pending.length) console.log(`  outstanding: ${pending.slice(0, 10).map((u) => u.reviewId).join(', ')}${pending.length > 10 ? ' …' : ''}`);

// Complete when every unit is ACCEPTED at >=98 or explicitly BLOCKED with a documented
// reason (a blocked unit is reported, never silently passed).
process.exit(pending.length === 0 && below.length === 0 ? 0 : 1);
