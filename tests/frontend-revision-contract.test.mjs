/**
 * Client/server revision contract parity (frontend half).
 *
 * The backend floors a missing revision at 1 (database/migrations/001_baseline.sql
 * -> `revision INT NOT NULL DEFAULT 1`, enforced by backend/services/revision.js).
 * The frontend used ad-hoc `revision || 1` coercions; the backend used
 * `Number(revision || 0)`. That divergence turned a NULL revision into a
 * permanent spurious 409 that refreshing could not clear.
 *
 * These tests pin the shared client helper and forbid the ad-hoc coercion from
 * returning to the shipped frontend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendSrc = path.join(repoRoot, 'frontend', 'src');

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('the client revision helper mirrors the backend contract', () => {
  const client = fs.readFileSync(path.join(frontendSrc, 'lib', 'revision.ts'), 'utf8');
  const server = fs.readFileSync(path.join(repoRoot, 'backend', 'services', 'revision.js'), 'utf8');
  assert.match(client, /export const REVISION_FLOOR = 1;/);
  assert.match(server, /const REVISION_FLOOR = 1;/);
  assert.match(client, /export const REVISION_CEILING = 1_000_000;/);
  assert.match(server, /const REVISION_CEILING = 1_000_000;/);
});

test('no shipped frontend write path re-introduces an ad-hoc revision coercion', () => {
  const offenders = [];
  for (const file of collect(frontendSrc)) {
    const rel = path.relative(repoRoot, file);
    if (rel.endsWith(path.join('lib', 'revision.ts'))) continue; // the helper defines the rule
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/revision\s*(\|\||\?\?)\s*1/g)) {
      offenders.push(`${rel}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `use normalizeRevision() from @/lib/revision instead:\n${offenders.join('\n')}`);
});

test('the compare-and-set write paths import the shared helper', () => {
  const guarded = [
    path.join(frontendSrc, 'components', 'employer', 'CompanyProfile.tsx'),
    path.join(frontendSrc, 'components', 'enterprise', 'EnterpriseAiTab.tsx'),
    path.join(frontendSrc, 'components', 'enterprise', 'EnterpriseRolesTab.tsx'),
  ];
  for (const file of guarded) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /from '@\/lib\/revision'/, `${path.basename(file)} must use the shared contract`);
    assert.match(source, /normalizeRevision\(/, `${path.basename(file)} must normalize before sending expectedRevision`);
  }
});
