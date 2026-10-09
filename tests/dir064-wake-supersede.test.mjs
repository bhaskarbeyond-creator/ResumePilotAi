/**
 * DIR-064 — supersede-on-state-change: a wake for a TERMINAL directive must never
 * be delivered.
 *
 * WHY: DIR-063 emitted 15 lifecycle wakes (ISSUED / PLAN_SUBMITTED / IN_PROGRESS)
 * that were all delivered AFTER the directive reached APPROVED_FROZEN. The existing
 * outstanding-wake guard in autowake.cjs collapses duplicates for the same
 * (directiveId, role, mode) — but a directive that advances plan -> act -> lead
 * emits wakes with DIFFERENT modes, so nothing stopped a stale wake being delivered.
 * Each one cost a turn confirming there was nothing to do.
 *
 * The guard must be conservative: NEVER suppress when the state cannot be read, or a
 * live wake would be silently swallowed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A test harness must never mutate the GLOBAL bridge registry (see DIR-062).
process.env.AI_BRIDGE_HERMETIC = '1';

const require = createRequire(import.meta.url);
const AW = require(path.join(os.homedir(), '.ai-bridge', 'autowake.cjs'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dir064-supersede-'));
test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });

/** Scaffold a project whose .bridge/directives/<id>.json holds the given status. */
function projectWith(status) {
  const root = fs.mkdtempSync(path.join(tmp, 'proj-'));
  const dir = path.join(root, '.bridge', 'directives');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, '.bridge', 'bridge.json'), JSON.stringify({ projectName: path.basename(root), projectRoot: root }));
  fs.writeFileSync(path.join(dir, 'DIR-001.json'), JSON.stringify({ id: 'DIR-001', status }));
  return root;
}

const deliverFor = (root, id = 'DIR-001') =>
  AW.deliver({ projectDir: assertScratch(root), toRole: 'dev', directiveId: id, mode: 'act', promptText: 'test wake' });

/**
 * HARD GUARD (DIR-064). A dedup *verification command* was once run against the live
 * IME365 project instead of a scratch dir, which minted a real wake for the synthetic
 * directive id `DIR-999` — leaking into wake_outbox.jsonl, seen_wakes.json,
 * cline_wake_ack.json, cline_inbox.json and a real prompt file. That is the same class
 * of leak DIR-062 fixed. This assertion makes it impossible to repeat from the suite:
 * every delivery must target a directory under the OS temp root.
 */
function assertScratch(root) {
  const resolved = path.resolve(root).toLowerCase();
  const tmpRoot = path.resolve(os.tmpdir()).toLowerCase();
  assert.ok(resolved.startsWith(tmpRoot),
    `refusing to run a wake test against a non-temp project: ${root} (this would write REAL wake state)`);
  return root;
}

test('DIR-064: the suite itself only ever targets temp projects', () => {
  // Meta-test: proves the guard above is actually in force.
  assert.throws(() => assertScratch('D:/xampp/htdocs/IME365'), /non-temp project/);
  assert.equal(assertScratch(tmp), tmp);
});

test('DIR-064: a wake for an APPROVED_FROZEN directive is SUPPRESSED', () => {
  const r = deliverFor(projectWith('APPROVED_FROZEN'));
  assert.equal(r.suppressed, 'directive-terminal', 'a frozen directive can never be acted on');
  assert.equal(r.wakeId, null, 'no wake id may be minted for a terminal directive');
});

test('DIR-064: a wake for a CANCELLED directive is SUPPRESSED', () => {
  assert.equal(deliverFor(projectWith('CANCELLED')).suppressed, 'directive-terminal');
});

test('DIR-064: a wake for a LIVE directive is NOT suppressed', () => {
  const r = deliverFor(projectWith('IN_PROGRESS'));
  assert.equal(r.suppressed, undefined, 'a live directive must still be woken');
  assert.ok(r.wakeId, 'a live wake must mint an id');
});

test('DIR-064: a missing/unreadable directive record is NEVER suppressed', () => {
  // Conservative by design: an unreadable state must not silently swallow a wake.
  const r = deliverFor(projectWith('APPROVED_FROZEN'), 'DIR-404');
  assert.equal(r.suppressed, undefined, 'an unknown directive must still be delivered');
  assert.ok(r.wakeId, 'an unknown directive must mint an id');
});

test('DIR-064: a corrupt directive record is NEVER suppressed', () => {
  const root = projectWith('IN_PROGRESS');
  fs.writeFileSync(path.join(root, '.bridge', 'directives', 'DIR-001.json'), '{ not json');
  const r = deliverFor(root);
  assert.equal(r.suppressed, undefined, 'a corrupt record must not suppress delivery');
});
