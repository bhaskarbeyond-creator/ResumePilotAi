/**
 * DIR-063 — Complete the unfulfilled DIR-060/061 deliverables.
 *
 * Two proven gaps this suite pins:
 *
 *  1. PDF↔DOCX parity was STRUCTURAL ONLY. `backend/test/docx-parity.test.js`
 *     proved a valid package with content and colour, but never asserted section
 *     ORDER, TYPOGRAPHY, bullet INDENTATION, DATE normalisation or CONTACT parity —
 *     i.e. the directive's actual claims were unverified.
 *
 *  2. The 55-template A4 print/overflow verification had never run. TEMPLATE_IDS is
 *     Cv1..Cv51, so print-probe.mjs and overflow-probe.mjs silently never touched a
 *     single cover template, and both required an external lab server + a Linux
 *     Chromium that do not exist here.
 *
 * These are static assertions over the harness itself (fast, hermetic). The heavy
 * browser matrix is executed by `node template-lab/run-probes.mjs` and its output is
 * archived under template-lab/evidence/dir063/.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const { TEMPLATE_IDS, COVER_TEMPLATE_IDS, ALL_TEMPLATE_IDS } = await import(
  new URL('../template-lab/fixtures.js', import.meta.url).href
);

test('DIR-063: the lab exposes 51 resumes + 4 covers = 55 documents', () => {
  assert.equal(TEMPLATE_IDS.length, 51, 'TEMPLATE_IDS must stay at 51 (the certified visual baseline has 51 entries)');
  assert.deepEqual([...COVER_TEMPLATE_IDS], ['Cover1', 'Cover2', 'Cover3', 'Cover4'],
    'cover ids must match src/utils/templateRegistry.js (capital C)');
  assert.equal(ALL_TEMPLATE_IDS.length, 55, 'the probe set must reach all 55 documents');
  assert.equal(new Set(ALL_TEMPLATE_IDS).size, 55, 'template ids must be unique');
});

test('DIR-063: the lab accepts cover templates instead of silently falling back to Cv1', () => {
  const main = read('template-lab/main.jsx');
  assert.match(main, /ALL_TEMPLATE_IDS\.includes\(/, 'main.jsx must validate against ALL_TEMPLATE_IDS');
  // (The old 51-only check was `TEMPLATE_IDS.includes(params...)`, which silently
  // rendered Cv1 for every cover. `ALL_TEMPLATE_IDS.includes` contains that as a
  // substring, so assert the positive rather than a fragile negative.)
});

test('DIR-063: both A4 probes iterate all 55 templates', () => {
  for (const probe of ['print-probe.mjs', 'overflow-probe.mjs']) {
    const src = read(`template-lab/${probe}`);
    assert.match(src, /ALL_TEMPLATE_IDS/, `${probe} must use ALL_TEMPLATE_IDS`);
    assert.match(src, /import \{ ALL_TEMPLATE_IDS \} from '\.\/fixtures\.js'/, `${probe} must import ALL_TEMPLATE_IDS`);
    assert.doesNotMatch(src, /import \{[^}]*\bTEMPLATE_IDS\b[^}]*\} from/, `${probe} must not import the 51-only TEMPLATE_IDS`);
  }
});

test('DIR-063: cover templates are handled as sheets (they are not composed)', () => {
  for (const probe of ['print-probe.mjs', 'overflow-probe.mjs']) {
    const src = read(`template-lab/${probe}`);
    assert.match(src, /\[class\*="-board"\]/, `${probe} must accept the *-board root for cover letters`);
  }
  const print = read('template-lab/print-probe.mjs');
  assert.match(print, /if \(r\.hasShell\)/, 'shell-only assertions (doc padding, header/footer) must be gated');
});

test('DIR-063: the probe runner uses IN-PROCESS vite and ASYNC child spawn', () => {
  const runner = read('template-lab/run-probes.mjs');
  assert.match(runner, /createServer\(/, 'the runner must start vite in-process (no detached server)');
  assert.match(runner, /await server\.close\(\)/, 'the in-process vite server must be closed');
  // REGRESSION GUARD: execFileSync blocks the event loop that hosts the vite
  // server, so every navigation deadlocked with `page.goto: Timeout`.
  assert.doesNotMatch(runner, /execFileSync\s*\(/, 'the runner must NOT CALL execFileSync (deadlocks the in-process vite server)');
  assert.match(runner, /await execFileAsync\(/, 'the runner must spawn probes asynchronously');
  assert.match(runner, /findChromium\(\)/, 'the runner must auto-detect Chromium rather than hardcode /tmp/chromium-bin');
});

test('DIR-063: the parity suite asserts all five previously-unverified contracts', () => {
  const src = read('backend/test/docx-parity.test.js');
  for (const contract of [
    'stable section ORDER',
    'typography ranks the name',
    'native numbering WITH a defined indent',
    'employment dates survive as a normalised range',
    'no contact channel is dropped',
  ]) {
    assert.ok(src.includes(contract), `missing DIR-063 contract: ${contract}`);
  }
});
