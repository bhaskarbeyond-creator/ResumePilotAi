#!/usr/bin/env node
'use strict';
/**
 * wake-guard-selftest.cjs — regression guards for the DIR-055 wake-storm fixes.
 *
 * The stall watchdog re-woke a WORKING developer 109 times (DIR-055) because:
 *   1. liveness was judged from the ledger sender only (a dev turn writes none)
 *   2. wake dedup keyed on the always-fresh wake id
 *   3. the auto-wake cooldown lived in ONE process's memory
 *   4. the thresholds were tighter than a normal developer turn
 *   5. the 45s wake guard exempted every unconfirmed dispatch
 *
 * Fixes 1/3/4/5 live inside lead_watcher.cjs and bridge.cjs, which cannot be
 * `require()`d without starting a rogue daemon (top-level spawn + UDP listener +
 * timers). They are therefore pinned here as SOURCE INVARIANTS — a silent revert
 * of any one of them fails this suite. Fix 2 is covered behaviourally by
 * autowake-suite.cjs §8.
 *
 *   node wake-guard-selftest.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BRIDGE_DIR = path.join(os.homedir(), '.ai-bridge');
const read = (f) => { try { return fs.readFileSync(path.join(BRIDGE_DIR, f), 'utf8'); } catch { return ''; } };
const WATCHER = read('lead_watcher.cjs');
const BRIDGE = read('bridge.cjs');
const AUTOWAKE = read('autowake.cjs');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`\x1b[32m✔\x1b[0m ${name}`); }
  else { fail++; console.log(`\x1b[31m✘ ${name}\x1b[0m${detail ? '  — ' + detail : ''}`); }
}

console.log('\n' + '='.repeat(72));
console.log('  WAKE-GUARD SELFTEST — DIR-055 wake-storm regression guards');
console.log('='.repeat(72) + '\n');

/* ── Fix 1: the lease informs DELIVERY; PROGRESS decides the stall ────────── */
check('Fix 1: devIsAlive() consults the agent lease', /function devIsAlive\(/.test(WATCHER) && /readLease\(projectRoot, 'dev'\)/.test(WATCHER));
check('Fix 1: the lease must NEVER veto the stall verdict', !/if \(!devAlive &&/.test(WATCHER), 'a live lease is not evidence of progress');
check('Fix 1: a two-tier grace window is derived from lease reachability', /devAlive \? WAKE_INACTIVE_MINUTES : WAKE_INACTIVE_MINUTES_GONE/.test(WATCHER));
check('Fix 1: the stall verdict is PROGRESS-based', /if \(inactiveMin >= graceMinutes && canAlert\(/.test(WATCHER));
check('Fix 1: the grace window is surfaced in the watchdog log', /grace \$\{graceMinutes\}m, IDE \$\{devAlive \? 'reachable' : 'unreachable'\}/.test(WATCHER));

/* ── Fix 2: one live wake per (directive, role, mode) ─────────────────────── */
check('Fix 2: deliver() has the outstanding-wake guard', /Outstanding-wake guard/.test(AUTOWAKE) && /let adopted = null/.test(AUTOWAKE));
check('Fix 2: the guard keys on (directiveId, mode) and skips acked wakes', /e\.directiveId === o\.directiveId[\s\S]{0,160}!isAcked\(root, to, e\.id\)/.test(AUTOWAKE));
check('Fix 2: an adopted wake reuses the prior id', /const wakeId = adopted\s*\?\s*adopted\.id/.test(AUTOWAKE));
check('Fix 2: superseded siblings are retired, not appended', /e\.deliveredBy = 'superseded'/.test(AUTOWAKE));
check('Fix 2: deliver() reports deduped/superseded', /deduped: !!adopted, superseded: retiredIds\.length/.test(AUTOWAKE));

/* ── Fix 3: the cooldown must be cross-process ────────────────────────────── */
check('Fix 3: autoWakeDev claims a slot before spawning', /if \(!claimAutoWakeSlot\(/.test(WATCHER));
check('Fix 3: the claim is atomic via O_EXCL ("wx")', /fs\.openSync\(AUTO_WAKE_GUARD_PATH, 'wx'\)/.test(WATCHER));
check('Fix 3: a live guard is honoured, a stale one is taken over', /peer holds it/.test(WATCHER) && /stale → take over/.test(WATCHER));

/* ── Fix 4: thresholds must fit a real developer turn ─────────────────────── */
const inactive = Number((WATCHER.match(/WAKE_INACTIVE_MINUTES = (\d+)/) || [])[1]);
const gone = Number((WATCHER.match(/WAKE_INACTIVE_MINUTES_GONE = (\d+)/) || [])[1]);
const cooldown = Number((WATCHER.match(/AUTO_WAKE_COOLDOWN_MS = (\d+)/) || [])[1]);
check('Fix 4: reachable-IDE inactivity threshold is 10 minutes', inactive === 10, 'value=' + inactive);
check('Fix 4: unreachable-IDE threshold escalates at 2 minutes', gone === 2, 'value=' + gone);
check('Fix 4: the gone-tier escalates faster than the reachable tier', gone < inactive, `${gone} vs ${inactive}`);
check('Fix 4: auto-wake cooldown raised to 10 minutes', cooldown === 600000, 'value=' + cooldown);
check('Fix 4: the cooldown is not shorter than the inactivity window', cooldown >= inactive * 60000, `${cooldown} vs ${inactive * 60000}`);

/* ── Fix 5: the 45s wake guard must not exempt unconfirmed dispatches ─────── */
// Match the CODE only (the explanatory comment deliberately quotes the old
// pattern, so a whole-file regex would produce a false positive).
const guardCode = (BRIDGE.match(/if \(exists\(bridgeDir\) && dId && !o\.force\) \{[\s\S]{0,600}?\.at\(-1\);/) || [''])[0];
check('Fix 5: the wake guard still keys on directiveId + mode', /e\.payload\?\.directiveId === dId/.test(guardCode) && /e\.payload\?\.mode === mode/.test(guardCode));
check('Fix 5: the wake guard no longer exempts unconfirmed dispatches', guardCode.length > 0 && !/dispatchConfirmed/.test(guardCode), 'guardCode length=' + guardCode.length);

/* ── Fix 3 (behavioural): the O_EXCL claim really is exclusive on this FS ─── */
const TMP = path.join(os.tmpdir(), `wake-guard-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
const probe = path.join(TMP, 'guard.json');
let firstClaim = false, secondClaim = false;
try { const fd = fs.openSync(probe, 'wx'); fs.writeSync(fd, '{}'); fs.closeSync(fd); firstClaim = true; } catch { firstClaim = false; }
try { const fd = fs.openSync(probe, 'wx'); fs.closeSync(fd); secondClaim = true; } catch (e) { secondClaim = e.code !== 'EEXIST'; }
check('O_EXCL claim is exclusive (2nd concurrent claim blocked)', firstClaim === true && secondClaim === false, `first=${firstClaim} second=${secondClaim}`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { }

/* ── RCA FIX: continuation signal (stall-detector → work-driver) ────────────
 * The wake plane could only ask "has the developer gone quiet?". It cannot see a
 * TURN BOUNDARY, so an agent yielding with approved work remaining waited the
 * full stall threshold. `--continue` is the explicit signal that closes it.
 */
const cont = Number((WATCHER.match(/WAKE_CONTINUE_MINUTES = (\d+)/) || [])[1]);
const contCooldown = Number((WATCHER.match(/CONTINUE_COOLDOWN_MS = (\d+)/) || [])[1]);
check('Continuation: a dedicated short grace exists', cont === 2, 'value=' + cont);
check('Continuation: a dedicated short cooldown exists', contCooldown === 120000, 'value=' + contCooldown);
check('Continuation: the grace is SHORTER than the stall threshold', cont < inactive, `${cont} vs ${inactive}`);
check('Continuation: CASE 5 reads d.continuationPending', /const wantsContinue = d\.continuationPending === true/.test(WATCHER));
check('Continuation: the wake uses the short cooldown when declared', /wantsContinue \? CONTINUE_COOLDOWN_MS : AUTO_WAKE_COOLDOWN_MS/.test(WATCHER));
check('Continuation: autoWakeDev accepts a cooldown override', /function autoWakeDev\(directiveId, mode, projectRoot, prompt, cooldownMs = AUTO_WAKE_COOLDOWN_MS\)/.test(WATCHER));
check('Continuation: claimAutoWakeSlot accepts a cooldown override', /function claimAutoWakeSlot\(cooldownMs = AUTO_WAKE_COOLDOWN_MS\)/.test(WATCHER));
check('Continuation: heartbeat persists the flag on the directive', /d\.continuationPending = continuationPending/.test(BRIDGE));
check('Continuation: transition CLEARS the flag when leaving IN_PROGRESS', /if \(next !== 'IN_PROGRESS'\) d\.continuationPending = false/.test(BRIDGE));
check('Continuation: the MCP tool exposes continue', /continue: \{ type: 'boolean' \}/.test(BRIDGE));

/* ── RCA FIX: rejection target (CHANGES_REQUESTED is ambiguous) ─────────────
 * A rejection can mean "revise the PLAN" or "revise the EVIDENCE", and the two
 * need OPPOSITE wake modes. The old derived path returned ACT for BOTH, so a
 * plan rejection told the developer to write code.
 */
check('Rejection: plan rejection records revisionTarget=plan', /d\.revisionTarget = 'plan'/.test(BRIDGE));
check('Rejection: evidence rejection records revisionTarget=evidence', /if \(verdict !== 'APPROVED'\) d\.revisionTarget = 'evidence'/.test(BRIDGE));
check('Rejection: arbitrateMode resolves the ambiguity', /if \(d\.status === 'CHANGES_REQUESTED'\) return d\.revisionTarget === 'evidence' \? 'act' : 'plan'/.test(BRIDGE));
check('Rejection: the old blanket-ACT derived path is GONE', !/d\.plan && \(d\.status === 'IN_PROGRESS' \|\| d\.status === 'CHANGES_REQUESTED'\)/.test(BRIDGE));
check('Rejection: transition CLEARS the target on re-submission', /if \(next === 'PLAN_SUBMITTED' \|\| next === 'IN_PROGRESS' \|\| next === 'EVIDENCE_SUBMITTED'\) d\.revisionTarget = null/.test(BRIDGE));
check('Rejection: the plan-rejection wake is un-suppressible (force)', /wakeCline\(\{ directiveId: d\.id, mode: 'plan', force: true/.test(BRIDGE));
check('Rejection: the evidence-rejection wake is un-suppressible (force)', /mode: 'act',\s*\n\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*force: true,/.test(BRIDGE));
check('Rejection: reviewDirective guides the Lead to the plan verbs', /To review the PLAN use "bridge lead approve-plan"/.test(BRIDGE));
check('Rejection: the watchdog CASE 4 derives the revision mode', /const revisionMode = needsEvidence \? 'act' : 'plan'/.test(WATCHER));
check('Rejection: CASE 4 wakes with that mode', /autoWakeDev\(d\.id, revisionMode, proj\.projectRoot\)/.test(WATCHER));

/* Behavioural: the ambiguity is actually resolved by arbitrateMode. */
try {
  const B = require(path.join(BRIDGE_DIR, 'bridge.cjs'));
  const mk = (extra) => ({ id: 'DIR-900', title: 'p', spec: 'p', status: 'CHANGES_REQUESTED', plan: { steps: [] }, ...extra });
  check('Behavioural: plan rejection derives PLAN mode', B.arbitrateMode(mk({ revisionTarget: 'plan' }), undefined) === 'plan');
  check('Behavioural: evidence rejection derives ACT mode', B.arbitrateMode(mk({ revisionTarget: 'evidence' }), undefined) === 'act');
  check('Behavioural: a legacy target-less rejection fails safe to PLAN', B.arbitrateMode(mk({}), undefined) === 'plan');
  check('Behavioural: explicit intent still wins', B.arbitrateMode(mk({ revisionTarget: 'plan' }), 'act') === 'act');
} catch (e) { check('Rejection behavioural harness', false, e.message); }

console.log('\n' + '-'.repeat(72));
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log('-'.repeat(72) + '\n');
process.exit(fail ? 1 : 0);
