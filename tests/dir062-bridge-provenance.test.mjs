/**
 * DIR-062 — Bridge privileged-action provenance & auto-certification guard.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * DIR-058, DIR-059, DIR-060 and DIR-061 all reached `APPROVED_FROZEN` with
 * `certifiedBy: LEAD_SUPERVISOR` having never been reviewed by anyone. The chain
 * was:
 *
 *   AIBridge-LeadWatcher (scheduled task, ~60s)
 *     -> lead_watcher.cjs  spawns  `bridge pipeline auto`
 *       -> pipelineAdvance()
 *         -> reviewDirective({ verdict:'APPROVED',
 *                              feedback:'Automated verification check passed.' })
 *         -> certify({ role:'lead', autoCommit:true })
 *
 * `lead_watcher_session.cjs` additionally asserted `--verdict APPROVED` as a
 * literal without ever opening the evidence.
 *
 * These tests pin the fix: privileged verbs are provenance-checked, automated
 * decisions are opt-in and recorded as such, and the auto path actually scans the
 * submitted test artifact instead of only checking that a file exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const BRIDGE_CLI = path.join(os.homedir(), '.ai-bridge', 'bridge.cjs');
const bridge = require(BRIDGE_CLI);

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dir062-bridge-'));
const writeTmp = (name, content) => {
  const p = path.join(tmpRoot, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
};
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

test.after(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { } });

// ── 1. PROVENANCE CLASSIFICATION ────────────────────────────────────────────
test('provenance: an invocation with no TTY is classified as automated', () => {
  const p = bridge.actorProvenance({});
  assert.equal(p.automated, true, 'a non-TTY process must never be treated as a human Lead');
  assert.ok(p.reasons.includes('non-tty'), `expected non-tty in reasons, got ${JSON.stringify(p.reasons)}`);
  assert.notEqual(p.invocation, 'human-cli');
});

test('provenance: an explicit declaration is recorded as automated', () => {
  const p = bridge.actorProvenance({ automated: true });
  assert.equal(p.automated, true);
  assert.ok(p.reasons.includes('declared'));
});

// ── 2. THE PRIVILEGED-ACTION GATE ───────────────────────────────────────────
test('gate: an automated privileged action is REFUSED without --allow-automation', () => {
  assert.throws(() => bridge.assertHumanAuthorisation('Release freeze', {}), /AUTOMATED/,
    'a background loop must not be able to freeze a release by itself');
});

test('gate: --allow-automation opens the gate and marks the decision as automated', () => {
  const r = bridge.assertHumanAuthorisation('Release freeze', { allowAutomation: true });
  assert.equal(r.automated, true);
  assert.equal(r.explicitlyAllowed, true);
});

// ── 3. EVIDENCE SANITY (the old gate only checked that a file existed) ──────
test('evidence sanity: a passing log is accepted', () => {
  const p = writeTmp('pass.log', 'tests 756\npass 756\nfail 0\n');
  const r = bridge.evidenceLooksPassing({ manifestHash: 'abc', tests: { stored: p } });
  assert.equal(r.ok, true, r.reason);
});

test('evidence sanity: a failing log is REJECTED', () => {
  const p = writeTmp('fail.log', 'tests 756\npass 753\nfail 3\n');
  const r = bridge.evidenceLooksPassing({ manifestHash: 'abc', tests: { stored: p } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /failure marker/);
});

test('evidence sanity: a log with no test artifact is REJECTED', () => {
  const r = bridge.evidenceLooksPassing({ manifestHash: 'abc', tests: null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no test artifact/);
});

test('evidence sanity: an empty log is REJECTED', () => {
  const p = writeTmp('empty.log', '   \n');
  const r = bridge.evidenceLooksPassing({ manifestHash: 'abc', tests: { stored: p } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /empty/);
});

test('evidence sanity: a log with no pass marker is REJECTED', () => {
  const p = writeTmp('noise.log', 'starting up\nfinished run\n');
  const r = bridge.evidenceLooksPassing({ manifestHash: 'abc', tests: { stored: p } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /pass marker/);
});


// ── 4. END-TO-END: pipelineAdvance must not auto-certify ────────────────────
// `initProject` calls setActiveProject(), which rewrites the GLOBAL registry.
// Snapshot it so a scratch project can never hijack the real active project.
const REGISTRY = path.join(os.homedir(), '.ai-bridge', 'registry.json');
const registrySnapshot = (() => { try { return fs.readFileSync(REGISTRY, 'utf8'); } catch { return null; } })();
test.after(() => {
  if (registrySnapshot != null) { try { fs.writeFileSync(REGISTRY, registrySnapshot); } catch { } }
});

const bridgeDirOf = (dir) => path.join(dir, '.bridge');
function scratchProject() {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'proj-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# scratch\n');
  git(dir, ['add', '.']);
  git(dir, ['commit', '-qm', 'init']);
  bridge.initProject(dir, path.basename(dir), true); // noScaffold: keep the temp dir minimal
  return dir;
}
function seedDirective(dir, title) {
  const d = bridge.createDirective({ title, spec: 'prove the provenance gate', projectDir: dir });
  bridge.submitPlan({ directiveId: d.id, summary: 'plan', steps: ['step 1'], projectDir: dir, role: 'dev' });
  return d.id;
}

test('e2e: pipelineAdvance REFUSES to auto-approve a plan without explicit opt-in', () => {
  const dir = scratchProject();
  const id = seedDirective(dir, 'Scratch A');
  const res = bridge.pipelineAdvance(dir);
  assert.equal(res.advanced, false);
  assert.equal(res.action, 'HUMAN_PLAN_APPROVAL_REQUIRED');
  assert.equal(bridge.getDirective(bridgeDirOf(dir), id).status, 'PLAN_SUBMITTED',
    'a background loop must not be able to move a plan into ACT mode');
});

test('e2e: pipelineAdvance REFUSES to auto-approve evidence (the DIR-058/060 bug)', () => {
  const dir = scratchProject();
  const id = seedDirective(dir, 'Scratch B');
  bridge.planApprove({ directiveId: id, projectDir: dir, allowAutomation: true, noWake: true });
  const log = writeTmp('e2e-pass.log', 'tests 12\npass 12\nfail 0\n');
  bridge.submitEvidence({ directiveId: id, summary: 'evidence', tests: log, projectDir: dir, noCommit: true, role: 'dev' });

  // Tree is clean and evidence exists — the OLD code certified right here.
  const res = bridge.pipelineAdvance(dir);
  assert.equal(res.advanced, false, 'must not auto-advance');
  assert.equal(res.action, 'HUMAN_EVIDENCE_REVIEW_REQUIRED');
  assert.equal(bridge.getDirective(bridgeDirOf(dir), id).status, 'EVIDENCE_SUBMITTED');
});

test('e2e: opting in certifies, but the freeze is RECORDED as automated', () => {
  const dir = scratchProject();
  const id = seedDirective(dir, 'Scratch C');
  bridge.planApprove({ directiveId: id, projectDir: dir, allowAutomation: true, noWake: true });
  const log = writeTmp('e2e-pass2.log', 'tests 12\npass 12\nfail 0\n');
  bridge.submitEvidence({ directiveId: id, summary: 'evidence', tests: log, projectDir: dir, noCommit: true, role: 'dev' });

  bridge.pipelineAdvance(dir, { allowAutomation: true });
  const after = bridge.getDirective(bridgeDirOf(dir), id);
  assert.equal(after.status, 'APPROVED_FROZEN');
  assert.equal(after.freeze.automated, true, 'an automated freeze must be legible as automated');
  assert.equal(after.freeze.certificationKind, 'automated');
  assert.equal(after.reviews.at(-1).automated, true);
  assert.equal(after.reviews.at(-1).provenance.automated, true);
});

test('e2e: even with opt-in, FAILING evidence is never auto-certified', () => {
  const dir = scratchProject();
  const id = seedDirective(dir, 'Scratch D');
  bridge.planApprove({ directiveId: id, projectDir: dir, allowAutomation: true, noWake: true });
  const bad = writeTmp('e2e-fail.log', 'tests 12\npass 9\nfail 3\n');
  bridge.submitEvidence({ directiveId: id, summary: 'bad evidence', tests: bad, projectDir: dir, noCommit: true, role: 'dev' });

  const res = bridge.pipelineAdvance(dir, { allowAutomation: true });
  assert.equal(res.action, 'EVIDENCE_FAILED_SANITY_CHECK');
  assert.match(res.reason, /failure marker/);
  assert.equal(bridge.getDirective(bridgeDirOf(dir), id).status, 'EVIDENCE_SUBMITTED',
    'failing evidence must never reach APPROVED_FROZEN');
});

test('e2e: certify() itself refuses an automated caller without opt-in', () => {
  const dir = scratchProject();
  const id = seedDirective(dir, 'Scratch E');
  assert.throws(() => bridge.certify({ directiveId: id, projectDir: dir }), /AUTOMATED/,
    'the release gate must refuse a background caller even if invoked directly');
});
