/**
 * DIR-008 — integrity of the legacy parity ledger (R-06/R-07/R-09/R-51).
 *
 * The ledger is the artifact that stops the project from claiming parity it
 * cannot show. These tests keep it honest:
 *   • all 51 canonical templates are present exactly once;
 *   • only the three restored deep dives may carry the RESTORED verdict, and
 *     each one must name a real evidence file;
 *   • the restored templates' catalog palettes must actually match their legacy
 *     stylesheet colours;
 *   • the generated markdown must keep the open-limitation statement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, 'docs', 'templates', 'legacy-parity.json');
const MD_PATH = path.join(ROOT, 'docs', 'templates', 'legacy-parity.md');

const ledger = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const markdown = fs.readFileSync(MD_PATH, 'utf8');
const byId = new Map(ledger.rows.map((row) => [row.id, row]));

test('the ledger covers all 51 canonical templates exactly once', () => {
  assert.equal(ledger.rows.length, 51);
  assert.deepEqual(
    ledger.rows.map((row) => row.id),
    Array.from({ length: 51 }, (_, index) => `Cv${index + 1}`),
  );
  const counted = Object.values(ledger.summary).reduce((sum, value) => sum + value, 0);
  assert.equal(counted, 51);
});

test('only the verified deep dives claim RESTORED, each with evidence', () => {
  const restored = ledger.rows.filter((row) => row.verdict === 'RESTORED');
  assert.deepEqual(restored.map((row) => row.id), ['Cv1', 'Cv25', 'Cv34']);
  for (const row of restored) {
    assert.ok(row.evidence, `${row.id} claims RESTORED without evidence`);
    const evidenceFile = row.evidence.split(' — ')[0].trim();
    assert.ok(fs.existsSync(path.join(ROOT, evidenceFile)), `${row.id} evidence file is missing: ${evidenceFile}`);
  }
  for (const row of ledger.rows) {
    if (row.verdict !== 'RESTORED') assert.equal(row.evidence, null, `${row.id} has evidence but is not RESTORED`);
  }
});

test('restored catalog palettes trace back to the legacy stylesheet colours', () => {
  const expectations = {
    Cv1: ['1e40af', '475569'],
    Cv25: ['274472', '3d6485'],
    Cv34: ['6c5ce7', '0f766e', 'fd79a8'],
  };
  for (const [id, expected] of Object.entries(expectations)) {
    const row = byId.get(id);
    const catalog = [row.catalogPrimary, row.catalogSecondary, row.catalogAccent]
      .filter(Boolean)
      .map((value) => value.replace('#', '').toLowerCase());
    assert.deepEqual(catalog, expected, `${id} catalog palette drifted from its legacy identity`);
    const stylesheet = fs.readFileSync(path.join(ROOT, row.legacyStylesheet), 'utf8').toLowerCase();
    for (const color of expected) {
      assert.ok(stylesheet.includes(`#${color}`), `${id} stylesheet no longer contains #${color}`);
    }
    // The template's lead colour must survive the neutral filter, i.e. it is an
    // identity colour, not a grey that happens to be in the stylesheet.
    assert.ok(row.legacyIdentityColors.includes(expected[0]), `${id} lead colour ${expected[0]} is not an identity colour`);
  }
});

test('every ledger row has renderable structure and an honest verdict', () => {
  const verdicts = new Set(['RESTORED', 'PALETTE_LINKED', 'PALETTE_DIVERGENT', 'CATALOG_ONLY']);
  for (const row of ledger.rows) {
    assert.ok(verdicts.has(row.verdict), `${row.id} has an unknown verdict ${row.verdict}`);
    assert.ok(row.family, `${row.id} has no renderer family`);
    assert.ok(Array.isArray(row.mainOrder) && row.mainOrder.length > 0, `${row.id} has an empty reading order`);
    if (row.verdict === 'CATALOG_ONLY') {
      assert.equal(row.legacyIdentityColors.length, 0, `${row.id} is CATALOG_ONLY but has legacy colours`);
    }
  }
});

test('the markdown ledger keeps the open limitation and names every template', () => {
  assert.match(markdown, /## Open limitation/);
  assert.match(markdown, /not\*\* claimed as legacy parity|not\*\* claimed as legacy parity/i);
  assert.match(markdown, /R-51 therefore stays PARTIAL/);
  for (const id of byId.keys()) {
    assert.ok(markdown.includes(`| ${id} |`), `${id} is missing from the markdown ledger`);
  }
});
