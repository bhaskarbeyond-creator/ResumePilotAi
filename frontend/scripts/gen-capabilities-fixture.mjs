#!/usr/bin/env node
/**
 * Generate the console's capability fixtures from the **backend's own resolver**.
 *
 * ## Why generate instead of hand-writing
 *
 * `tests/admin-console-ux.spec.ts` must render the console with no backend running so the
 * five-device-class, axe and visual-regression gates can execute on a laptop and in CI
 * without MariaDB. The obvious shortcut — a JSON blob typed by hand — rots the moment a tab
 * is added or a permission renamed, and the failure mode is silent: the console renders
 * fewer tabs and every assertion still passes.
 *
 * So the fixture is produced by `routes/capabilities.js` → `__test.resolveCapabilities()`,
 * the same function that answers `GET /api/me/capabilities` in production. Authority is
 * resolved from the **literal** role bundle (`services/adminRbac.permissionsForRole`), which
 * is exactly what the service falls back to when the store is unreachable — so a fixture
 * cannot claim a capability the running system would not grant a degraded backend.
 *
 * ## Usage
 *
 *   cd frontend && node scripts/gen-capabilities-fixture.mjs
 *
 * Writes `tests/fixtures/me-capabilities.<ROLE>.json`. Re-run after changing
 * `backend/security/capabilityMap.js` or a literal role bundle; `npm run verify:fixtures`
 * fails when the committed files differ from what this script produces.
 *
 * @module scripts/gen-capabilities-fixture
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// The resolver refuses to touch a persisted store in anything but the test seam; the literal
// bundle needs no store at all, so this only makes the intent explicit.
process.env.NODE_ENV = 'test';

const { __test } = require(join(here, '..', '..', 'backend', 'routes', 'capabilities.js'));
const configService = require(join(here, '..', '..', 'backend', 'services', 'configService.js'));

/** Roles the console spec exercises. SUPER_ADMIN for the baselines, ADMIN for a partial strip. */
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'AUDITOR'];

/**
 * `--check` compares instead of writing, so CI can fail on a fixture that no longer matches the
 * capability map. A stale fixture is the failure mode this whole file exists to prevent: the
 * console would render the old tab set and every assertion would still pass.
 */
const CHECK = process.argv.includes('--check');

const outDir = join(here, '..', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });

for (const role of ROLES) {
  const resolved = __test.resolveCapabilities({ uid: `fixture-${role.toLowerCase()}`, claims: { role } });
  const payload = { success: true, role, ...resolved };
  const file = join(outDir, `me-capabilities.${role}.json`);
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const allowed = payload.tabs.filter((tab) => tab.allowed).length;

  if (CHECK) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== next) {
      process.stderr.write(
        `${role}: fixture is stale (${allowed}/${payload.tabs.length} tabs allowed now). Run \`npm run gen:fixtures\`.\n`,
      );
      process.exitCode = 1;
    }
    continue;
  }

  writeFileSync(file, next, 'utf8');
  process.stdout.write(`${role}: ${allowed}/${payload.tabs.length} tabs allowed → ${file}\n`);
}

/*
 * The configuration census, from the same service that answers `GET /api/admin/config`.
 * With no store it resolves to the declared defaults and says so
 * (`authority.source: 'default'`, `degraded: true`), which is exactly the payload the console
 * must render — and the provenance labels the console UX test asserts are then real values from
 * the registry, not invented rows.
 */
const census = await configService.describeConfig({ actorPermissions: () => true });
const censusPayload = {
  success: true,
  authority: { ...census.authority, privileged: true },
  count: census.entries.length,
  scopes: ['PLATFORM', 'PLAN', 'TENANT', 'DEPLOYMENT'],
  entries: census.entries,
};
const censusFile = join(outDir, 'config-census.json');
const censusNext = `${JSON.stringify(censusPayload, null, 2)}\n`;
if (CHECK) {
  const current = existsSync(censusFile) ? readFileSync(censusFile, 'utf8') : '';
  if (current !== censusNext) {
    process.stderr.write('config census: fixture is stale. Run `npm run gen:fixtures`.\n');
    process.exitCode = 1;
  }
} else {
  writeFileSync(censusFile, censusNext, 'utf8');
  process.stdout.write(`config census: ${census.entries.length} entries → ${censusFile}\n`);
}
