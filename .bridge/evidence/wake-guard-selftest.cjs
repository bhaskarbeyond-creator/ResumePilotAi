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
check('Fix 1: a two-tier grace window is derived from lease reachability', /const graceMinutes = devAlive \? WAKE_INACTIVE_MINUTES : WAKE_INACTIVE_MINUTES_GONE/.test(WATCHER));
check('Fix 1: the stall verdict is PROGRESS-based', /if \(inactiveMin >= graceMinutes && canAlert\(/.test(WATCHER));
check('Fix 1: the grace window is surfaced in the watchdog log', /grace \$\{graceMinutes\}m, IDE \$\{devAlive \? 'reachable' : 'unreachable'\}/.test(WATCHER));

/* ── Fix 2: one live wake per (directive, role, mode) ─────────────────────── */
check('Fix 2: deliver() has the outstanding-wake guard', /Outstanding-wake guard/.test(AUTOWAKE) && /let adopted = null/.test(AUTOWAKE));
check('Fix 2: the guard keys on (directiveId, mode) and skips acked wakes', /e\.directiveId === o\.directiveId[\s\S]{0,160}!isAcked\(root, to, e\.id\)/.test(AUTOWAKE));
check('Fix 2: an adopted wake reuses the prior id', /const wakeId = adopted\s*\?\s*adopted\.id/.test(AUTOWAKE));
check('Fix 2: superseded siblings are retired, not appended', /e\.deliveredBy = 'superseded'/.test(AUTOWAKE));
check('Fix 2: deliver() reports deduped/superseded', /deduped: !!adopted, superseded: retiredIds\.length/.test(AUTOWAKE));

/* ── Fix 3: the cooldown must be cross-process ────────────────────────────── */
check('Fix 3: autoWakeDev claims a slot before spawning', /if \(!claimAutoWakeSlot\(\)\)/.test(WATCHER));
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

console.log('\n' + '-'.repeat(72));
console.log(`  RESULT: ${pass}/${pass + fail} checks passed`);
console.log('-'.repeat(72) + '\n');
process.exit(fail ? 1 : 0);
