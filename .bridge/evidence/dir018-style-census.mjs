/** Enumerate inline `style` colour constructs in the DIR-018 billing surfaces. */
import fs from 'node:fs';

const FILES = [
    'src/components/Billing/Plans/Plans.jsx',
    'src/components/Billing/Plans/Checkout.jsx',
    'src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx',
];

const gradients = new Map();
const rgba = new Map();
const hexOnly = new Map();

for (const f of FILES) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/linear-gradient\([^)]*\)/g)) {
        gradients.set(m[0], (gradients.get(m[0]) || 0) + 1);
    }
    for (const m of s.matchAll(/rgba\([^)]*\)/g)) {
        rgba.set(m[0], (rgba.get(m[0]) || 0) + 1);
    }
}

const dump = (title, map) => {
    console.log(`\n=== ${title} (${map.size} distinct) ===`);
    for (const [k, v] of [...map].sort((a, b) => b[1] - a[1])) {
        console.log(`${String(v).padStart(3)}x  ${k}`);
    }
};

dump('linear-gradient()', gradients);
dump('rgba()', rgba);