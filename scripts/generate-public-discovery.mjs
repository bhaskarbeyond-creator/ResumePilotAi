#!/usr/bin/env node
/**
 * DIR-031 — Regenerates public/robots.txt and public/sitemap.xml from
 * scripts/public-discovery-policy.mjs.
 *
 * The sitemap URL set is imported from the backend's own STABLE_PUBLIC_PATHS
 * (backend/services/publicSitemap.js) rather than duplicated here, so the static
 * build-time fallback and the live /sitemap.xml route cannot drift apart: if a path
 * is added to the backend list it is added to the static fallback too.
 *
 * Usage:  node scripts/generate-public-discovery.mjs          (write)
 *         node scripts/generate-public-discovery.mjs --check  (verify, exit 1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { renderPublicRobotsTxt, renderPublicSitemapXml, resolveDiscoveryOrigin } from './public-discovery-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// The backend service is the authoritative stable-path list. Requiring it (rather
// than re-listing the paths) is what makes sitemap parity structural.
const { STABLE_PUBLIC_PATHS } = require(path.join(root, 'backend/services/publicSitemap.js'));

const origin = resolveDiscoveryOrigin(process.env);
const TARGETS = [
  ['public/robots.txt', renderPublicRobotsTxt(origin)],
  ['public/sitemap.xml', renderPublicSitemapXml(STABLE_PUBLIC_PATHS, origin)],
];

const check = process.argv.includes('--check');
let drift = 0;

console.log(`origin: ${origin}`);
for (const [target, next] of TARGETS) {
  const absolute = path.join(root, target);
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  if (current === next) {
    console.log(`OK       ${target}`);
    continue;
  }
  if (check) {
    console.error(`DRIFT    ${target} — run: node scripts/generate-public-discovery.mjs`);
    drift += 1;
    continue;
  }
  fs.writeFileSync(absolute, next, 'utf8');
  console.log(`UPDATED  ${target}`);
}

if (drift > 0) {
  console.error(`\n${drift} file(s) out of sync with the canonical public discovery policy.`);
  process.exit(1);
}
if (check) console.log('\nStatic public discovery documents match the canonical policy.');