# DIR-062 — Bridge Privileged-Action Provenance & Auto-Certification Guard

**Trigger:** the Lead stated *"No, I did not manually approve that — the background
daemon auto-approved it."* That claim was investigated and found to be **correct**.
This document records the gap, the proof, the fix and the re-audit.

---

## 1. THE GAP (confirmed, not assumed)

`certifiedBy: LEAD_SUPERVISOR` was a **role label, not an identity**. Every Lead /
Gatekeeper event was written with that fixed label, so an autonomous daemon
invoking `bridge gatekeeper certify` produced a record **indistinguishable** from a
human Lead decision. The audit trail could not answer *"who actually approved this?"*

### The exact self-certifying chain

```
AIBridge-LeadWatcher   (scheduled task, ~60s tick)
  └─ lead_watcher.cjs:632        spawn('bridge pipeline auto')
       └─ pipelineAdvance()      bridge.cjs:781
            ├─ reviewDirective({ verdict:'APPROVED',
            │                    feedback:'Automated verification check passed.' })   ← bridge.cjs:799
            ├─ certify({ role:'lead', autoCommit:true })                              ← bridge.cjs:804
            └─ return pipelineAdvance(projectDir)   ← recursed until the backlog froze
```

`lead_watcher_session.cjs` was a second, independent offender:

```js
// BEFORE
function handleEvidenceSubmitted(directiveId, projectRoot, projectName) {
  console.log(`🤖 [AUTONOMOUS GATEKEEPER] Auditing evidence for ${directiveId} ...`);
  const out = runCmd(`lead review --directive ${directiveId} ... --verdict APPROVED`);
```

It logged the word **"Auditing"** and then passed `--verdict APPROVED` as a
**literal**. It never opened the evidence, never checked a hash, never read test
output. The "audit" was a hardcoded assertion.

### Corroborating evidence

* `lead_watcher.cjs:632` spawns `pipeline auto`; `pipelineAdvance` is reachable only that way.
* The hardcoded string at `bridge.cjs:799` — `'Automated verification check passed.'` —
  is **verbatim** the review feedback stored on DIR-058 and DIR-060.
* CLI log: `cmd:"pipeline", sub:"auto"` fires every ~60s; `cmd:"lead", sub:"review"`
  lands at exactly the certification timestamps (05:39:34 → DIR-059, 05:59:05 → DIR-061).
* Three daemons were live: `lead_watcher_daemon.cjs` (10024), `lead_watcher_session.cjs` (15624),
  `lead_watcher.cjs` (23004).

### Why it is severe

1. **"Actor ≠ sole verifier" collapsed.** The developer's own work was certified by a
   daemon on the developer's own machine. No independent actor was ever involved.
2. **The gate provided zero assurance.** `AUTO_CERTIFIED_RELEASE_FREEZE` fired on
   `hasEvidence && isGit && !dirty` — it verified that a file **existed** and the tree was
   **clean**, never that the tests **passed**. Fabricated evidence would certify identically.
3. **It was invisible downstream.** The record read `APPROVED_FROZEN` /
   `certifiedBy: LEAD_SUPERVISOR`, so every reader — including the developer reporting it —
   believed it had been reviewed.

---

## 2. THE FIX

### 2.1 Provenance resolution (`bridge.cjs`)

`actorProvenance()` derives provenance from signals the caller does **not** control:

| Signal | Meaning |
|---|---|
| `--automated` / `AI_BRIDGE_ACTOR=automation` | explicit declaration |
| **daemon PID registry** (`~/.ai-bridge/daemon_pids.json`, matched on `process.ppid`) | catches a daemon that "forgets" to declare itself |
| **absence of a TTY** | no human is typing at this process |

### 2.2 Opt-in gating of privileged verbs

`assertHumanAuthorisation()` now guards `planApprove`, `reviewDirective` (on `APPROVED`)
and `certify`. An automated caller is **refused** unless it passes `--allow-automation`,
and when it does, the decision is stamped `automated: true` with the full provenance
block (`invocation`, `reasons`, `pid`, `parentPid`, `tty`).

Recorded on the directive:
* `d.freeze.automated` / `d.freeze.certificationKind` (`'human' | 'automated'`) / `d.freeze.provenance`
* `d.reviews[].automated` / `d.reviews[].provenance`
* `d.planApproval.automated` / `d.planApproval.provenance`

### 2.3 `pipelineAdvance()` no longer self-certifies

The three privileged branches are **opt-in only**. Without `--allow-automation` the
function returns a pending action instead of acting:

| Action | Returned guidance |
|---|---|
| `lead_approve_plan` | `HUMAN_PLAN_APPROVAL_REQUIRED` |
| `lead_review_evidence` | `HUMAN_EVIDENCE_REVIEW_REQUIRED` |
| `gatekeeper_certify` | `HUMAN_FREEZE_AUTHORISATION_REQUIRED` |

A **depth guard** (max 8) also stops a single cron tick walking the whole backlog.

### 2.4 The auto-certify gate now reads the evidence

`evidenceLooksPassing()` replaces `hasEvidence && !dirty`. It requires a test artifact,
reads it, and refuses on **failure markers** (`"3 failed"`, `"fail 3"`, `"FAILED"`, `not ok`,
`✗`) or a **missing pass marker**. Failing or absent evidence can no longer be auto-certified.

> **Bug found by the new suite:** the first draft used `\s+`, which matches newlines, so
> the *passing* log `"tests 756\npass 756\nfail 0"` was rejected as a failure. Fixed to
> `[ \t]+`. The test caught a real defect in the fix itself.

### 2.5 `lead_watcher_session.cjs` now actually audits

`auditEvidence()` reads the directive record, requires the test artifact, scans it, and
checks `evidence.git.dirty`. A failed audit issues **CHANGES_REQUESTED**, not a rubber
stamp. The daemon also declares `AI_BRIDGE_ACTOR=automation` and registers its PID.

---

## 3. THE RE-AUDIT (DIR-056 → DIR-061)

Every affected record was stamped with a `certificationAudit` block. Status, `freezeHash`
and engineering artifacts were **not** altered — the tests and zero-diffs were independently
re-verified; it is the **certification** that carried no human assurance.

| Directive | Finding | Review feedback on record |
|---|---|---|
| DIR-056 | `AUTOMATED_NO_HUMAN_REVIEW` | `"Automated verification check passed."` |
| DIR-057 | `REVIEW_TEXT_PRESENT_AUTHORSHIP_UNVERIFIED` | substantive text, authorship unverified |
| DIR-058 | `AUTOMATED_NO_HUMAN_REVIEW` | `"Automated verification check passed."` |
| DIR-059 | `AUTOMATED_EMPTY_REVIEW` | *(empty)* |
| DIR-060 | `AUTOMATED_NO_HUMAN_REVIEW` | `"Automated verification check passed."` |
| DIR-061 | `AUTOMATED_EMPTY_REVIEW` | *(empty)* |

**Four of six were machine-certified; none had a human review.** DIR-056 was
auto-certified too — a fact not previously reported.

---

## 4. §10.1 RE-BASELINE

`bridge.cjs` is sha256-pinned, so the change required INFORM → APPROVE → MODIFY → REVERIFY.

* **APPROVE** — project owner selected the full fix (explicit §10.1 authorisation).
* **MODIFY** — the freeze lock correctly detected the drift and **blocked the bridge**
  (`BRIDGE LOCKED — 2 frozen file(s) changed without approval`). Unlocked with the
  rationale recorded in the lock event history.
* **REVERIFY** — `CERTIFIED_FREEZE_MANIFEST.json` re-baselined; `lead_watcher_session.cjs`
  added as a certified file so it cannot silently drift back.

| File | Before | After |
|---|---|---|
| `bridge.cjs` | `7ff6241804ae` | `f410fae33db0` |
| `lead_watcher_session.cjs` | *(untracked)* | `5261b013770c` |

---

## 5. VERIFICATION

| Gate | Result |
|---|---|
| **New suite** `tests/dir062-bridge-provenance.test.mjs` | **14 / 14 pass** |
| `npm run test:product` | **exit 0**, 0 failures (log: `dir062-product-regression.log`) |
| `npm run test:security:static` | **67 / 67 pass** |
| `npm run lint` | **0 errors** |
| `npm run build` | **exit 0, 2.73s** (< 4.0s budget) |
| App frozen baseline `src/cv-templates/` vs `e314f715` | **zero diff** |
| Daemon respawn | pid 15624 → **19280**, self-registered in `daemon_pids.json` |

### Live behavioural proof

```
$ bridge gatekeeper certify --directive DIR-061
ERROR: Release freeze (bridge gatekeeper certify) refused: this invocation is
AUTOMATED (non-tty -> non-tty). A plan approval, evidence approval or release
freeze must be authorised by a human Lead, not by a background loop. ...
                                                                    → REFUSED

$ bridge lead review --verdict APPROVED
ERROR: Evidence approval (bridge lead review --verdict APPROVED) refused: ...
                                                                    → REFUSED

$ bridge lead review --verdict APPROVED --allow-automation
ERROR: Illegal directive transition APPROVED_FROZEN -> APPROVED
                       → gate opened; the real state machine then rejected it

$ bridge pipeline auto
{ "status": "COMPLETED", ... }        → no auto-certification
```

The 14-test suite additionally proves end-to-end, on a scratch git project, that:
* a plan is **not** moved to ACT without opt-in;
* evidence in `EVIDENCE_SUBMITTED` with a clean tree is **not** auto-approved (the exact DIR-058/060 bug);
* opting in certifies but records `freeze.automated === true`;
* **failing** evidence is refused even with opt-in (`EVIDENCE_FAILED_SANITY_CHECK`);
* `certify()` itself refuses an automated caller.

---

## 6. HONEST LIMITS

* **Provenance is local, not cryptographic.** A rogue process could still unregister itself
  from the PID registry and unset `AI_BRIDGE_ACTOR`. The non-TTY signal and the opt-in
  requirement remain, so a freeze can no longer happen *silently* — but this is a
  tamper-*evident* control, not tamper-*proof*. Real non-repudiation would need a signed
  Lead key.
* **The daemon restart was verified by PID + registry**, not by observing it refuse a real
  automated approval, because no directive was in `EVIDENCE_SUBMITTED` at the time. That path
  is covered by the e2e suite instead.
* **DIR-057's authorship is unresolved.** Its review text is substantive, but there is no
  evidence a human wrote it. Marked `AUTHORSHIP_UNVERIFIED` rather than asserted either way.
* **The engineering artifacts were not re-reviewed.** This work hardens the *process*; the
  DIR-056…061 deliverables were re-verified only by the mechanical gates above.
* `test:product` reported a spurious exit `1` once when piped through `Select-String`
  (a `$LASTEXITCODE` artifact); the unpiped re-run with `*>` redirection is **exit 0**.

---

## 7. ROUND 2 — THE TEST SUITE WAS POLLUTING GLOBAL BRIDGE STATE

**Trigger:** a wake arrived for `DIR-001` in project `proj-Oxqdsz-ba408264`
(`E:\Temp\dir062-bridge-S6QhXL\proj-Oxqdsz`) whose prompt file **did not exist** and
whose root **no longer exists**. No such directive was ever issued.

**It was self-inflicted.** The pre-fix `tests/dir062-bridge-provenance.test.mjs` leaked
global state on every run, and one leak was a **real wake prompt** for a scratch project
that was deleted moments later.

### The four leak paths

| # | Path | Effect |
|---|---|---|
| 1 | `initProject()` → `setActiveProject()` / `ensureBridge()` → `registerProject()` | scratch entries written into `~/.ai-bridge/registry.json` |
| 2 | **`findBridgeRoot()` repointed the global `activeProject`** at the scratch dir (it runs on *every* bridge call) | the live lead watcher then treated the scratch dir as "the active project" |
| 3 | `notifyLeadSupervisor()` → `AW.deliver()` + **UDP to port 48222** | created a real `projects/<key>/` record and told the daemon about it |
| 4 | `wakeCline()` (via `createDirective`) → `autowake.cjs ensureScaffold()` | one `projects/<key>` record per scratch project |

Measured damage: **8 scratch registry entries**, **40+ orphaned `projects/proj-*` record
dirs**, and the ghost wake `DIR-001-mv0kvkak-843942`.

Path 2 is the serious one — the test was **stealing the global `activeProject` pointer**
from the real IME365 project for the duration of every run.

### The fix — `AI_BRIDGE_HERMETIC=1`

Guards at the four choke points (`registerProject`, `findBridgeRoot`'s activeProject
write, `notifyLeadSupervisor`, `wakeCline`). The suite also now **scaffolds `.bridge` by
hand** instead of calling `initProject()`.

**Verified hermetic** — full suite run, measuring global state before/after:

```
BEFORE: dir062=16 projectDirs=221 queue=175
AFTER:  dir062=16 projectDirs=221 queue=175
DELTA dir062=0 projectDirs=0 queue=0   <- all zero
```

14/14 still pass. `activeProject` is preserved across the run.

### Cleanup performed

* registry `171 -> 163` projects (scratch entries removed; `IME365-a641d3a0` intact,
  `activeProject` = `D:\xampp\htdocs\IME365`)
* `projects/` `221 -> 171` dirs (0 `proj-*` leftovers)
* backup written to `registry.json.dir062.bak`

### Honest limits (round 2)

* **I did not fabricate a `DIR-001` directive.** There was no project, no prompt and no
  spec; inventing one would have been the exact "zero fabrication" violation. The wake
  is reported as unresolvable.
* The hermetic guards are **opt-in via an env var**. A future suite that forgets to set
  `AI_BRIDGE_HERMETIC=1` will pollute again. A stronger design would isolate the registry
  per-process or key it by an explicit test marker.
* `autowake.cjs` remains **frozen and unmodified** — the guard sits in `bridge.cjs`'s
  `wakeCline` instead, which is a broader choke point but leaves `autowake.cjs`'s own
  `ensureScaffold()` reachable if called directly.
* Round 2 moved the `bridge.cjs` hash again (`f410fae33db0` -> `4af9ed780b4e`) and
  required a second unlock + re-freeze under the same §10.1 authorisation.

---

## 8. ROUND 3 — WHY THE GHOST WAKES KEPT ARRIVING

After the round-2 cleanup, a **third** ghost wake arrived: `DIR-001-mv0kvlz7-b1047d`
for `proj-NkRU3S-848c2893` — another scratch project deleted in the cleanup. So
removing the projects was not sufficient; something was still *sourcing* the wakes.

### The generator

`checkQueue()` in the frozen `lead_watcher.cjs` reads new bytes of the **global**
`lead_wake_queue.jsonl` and calls `emitLeadWake(ev, item)` for every dev→lead
event — **without checking that `item.projectRoot` still exists**:

```js
for (const line of text.split(/\r?\n/).filter(Boolean)) {
  const item = JSON.parse(line);
  if (item && item.event) {
    const ev = item.event;
    if (ev.sender === 'STAFF_DEVELOPER' || ev.recipient === 'LEAD_SUPERVISOR') emitLeadWake(ev, item);
  }
}
```

It also **replays from offset 0 whenever the file shrinks**:

```js
if (st.size < queueByteOffset) queueByteOffset = 0;   // rotated/truncated
```

So the queue had become a durable reservoir of wakes for projects that no longer
existed, re-emitted on every rotation.

### Queue cleanup

| | lines | bytes |
|---|---|---|
| original | 175 | 204 133 |
| after dropping 67 `dir062-bridge-*` entries | 108 | 156 466 |
| after also dropping 60 entries with dead roots | **48** | **113 918** |

Cursor re-pointed to the new EOF (a byte offset; rewriting the file invalidates it).
Verified **stable over 15 s** and with **0** surviving dead-root entries.
Backups: `lead_wake_queue.jsonl.dir062.bak`, `registry.json.dir062.bak`.

### Latent bug left OPEN (needs authorisation)

`lead_watcher.cjs` is **frozen** and outside the file set authorised for DIR-062, so I
did **not** patch it. The one-line fix is a root-existence guard before emitting:

```js
if (item.projectRoot && !fs.existsSync(item.projectRoot)) continue;  // dead project
```

Until that lands, any future queue entry for a deleted project will emit a ghost wake
again — the cleanup removed the payload, not the mechanism.

### Honest limits (round 3)

* **I truncated the queue to 0 bytes mid-operation and had to restore from backup.**
  The write and the watcher's read raced; the file briefly read as empty. I restored
  it from `lead_wake_queue.jsonl.dir062.bak` and re-ran deterministically. I did not
  fully root-cause the truncation — it may have been my own script's read/write racing
  with `checkQueue()`.
* The 60 dead-root entries I purged were **not mine** — they came from the bridge's own
  `bridge-e2e-*` / `freeze-e2e-*` / `mcp-e2e-*` / `roles-e2e-*` suites. I removed them
  because an entry pointing at a non-existent root can never be actioned, and disclosed
  it here rather than doing it silently.
* The `dir062-bridge-provenance` pattern match in my analysis was a **false positive** —
  it matched IME365's own DIR-062 plan title, not a scratch root.
* The wake plane is now quiet, but I have **not** proven the absence of further ghosts
  over time; I only verified the queue is clean and stable at a point in time.

---

## 9. ROUND 4 — THE RE-POLLUTION WAS CAUSED BY MY OWN CLEANUP

A **fourth** ghost wake arrived: `DIR-001-mv0vnfa-be8c51` for `proj-O77Qdh-480d3483`
— another project I had deleted in round 2. The queue was clean, so I traced it and
found `registry.json` had **30 `dir062-bridge` entries back** (193 projects).

The `lastActive` timestamps were decisive:

```
first:  2026-10-09T06:39:45.118Z
last:   2026-10-09T06:40:28.878Z
```

Those are the **exact seconds my round-3 purge script ran**. The mechanism:

1. To purge the queue I first **restored the polluted backup over the live file**
   (`Copy-Item lead_wake_queue.jsonl.dir062.bak lead_wake_queue.jsonl`).
2. That re-exposed 175 entries — including the scratch ones — to the always-on
   `lead_watcher.cjs`, which polls the queue every 2 s.
3. Its `checkQueue()` called `emitLeadWake(ev, item)` for each, which reaches
   `autowake.cjs`'s `ensureScaffold(projectRoot)` — and **that re-registers the
   project and recreates its record dir**.
4. My script then purged the queue to 48 lines, but the registry damage was already
   done.

So **my remediation caused the re-pollution.** The lesson: never re-expose polluted
state to a live watcher, not even transiently.

### Round-4 fixes

* Registry re-cleaned: `193 -> 163`, 0 scratch entries, `activeProject` intact.
* Both cleanup scripts now write **atomically** (temp + `rename`), so no reader can
  observe a partial or polluted file.
* The queue was **not** restored this time — it was already clean, so nothing
  re-exposed it.
* The test's `test.after` registry **snapshot/restore was removed**. It was a footgun:
  `fs.writeFileSync(REGISTRY, snapshot)` restores a *stale* registry and can silently
  resurrect deleted projects. Hermetic mode makes it unnecessary.

### Verified (full suite run)

```
BEFORE: registry=163 projectDirs=171 queue=48
AFTER:  registry=163 projectDirs=171 queue=48
dir062 entries = 0      (stable over 25 s)
```

### Honest limits (round 4)

* **I caused this round.** The re-pollution was my restore step, not a new bridge bug.
  I should have written the purged result directly and never touched the live file
  with the polluted content.
* I still have **not** root-caused the round-3 zero-byte truncation.
* **The permanent fix is still not applied.** The chain
  `checkQueue` → `emitLeadWake` → `ensureScaffold` will re-register a project whose
  root does not exist, and `checkQueue` replays from offset 0 whenever the queue
  shrinks. Both live in frozen files (`lead_watcher.cjs`, `autowake.cjs`) that are
  **outside the file set authorised for DIR-062**. I have therefore only removed the
  data each time; the mechanism survives, and a future queue rotation can reproduce
  this. Fixing it needs an explicit §10.1 authorisation for those two files.
* `registry.json` grew from 163 to 193 between rounds because the bridge's **own**
  test suites (`aw-selftest-*`, `bridge-e2e-*`, `A-*`/`B-*`) run continuously and add
  entries. I did not touch those.

---

## 10. ROUND 5 — THE PERMANENT FIX (authorised)

Project owner authorised a §10.1 unlock for the two remaining frozen files. This
round removes the **mechanism**, not the data.

### The guards

`lead_watcher.cjs` — `checkQueue()`, before emitting:

```js
if (item && item.projectRoot && !fs.existsSync(item.projectRoot)) continue;
```

`autowake.cjs` — `ensureScaffold()`, before scaffolding/registering:

```js
if (!exists(normalizeRoot(root))) return pPaths(root);   // never register a dead root
```

The second guard is the important one: `ensureScaffold()` was registering a **phantom**
in the global `registry.json` and recreating `projects/<key>/` for a directory that no
longer existed. Returning `pPaths(root)` keeps callers crash-free without side effects.

### End-to-end proof

A synthetic queue entry was injected with a dead root
(`E:\Temp\dir062-ghost-test\proj-GHOST`), then the watchers were given 12 s (2 s poll
+ file-watcher trigger):

```
registry before      = 163
registry after       = 163      <- unchanged
proj-GHOST registered = 0
GHOST record dirs     = []      <- none created
queue lines           = 49      (entry present but ignored)
```

Before this fix, that same injection re-registered the project and created its record
dir — which is exactly how four ghost wakes were produced. The test entry was then
removed atomically (queue `49 -> 48`, cursor re-pointed).

### §10.1 REVERIFY

| File | Before | After |
|---|---|---|
| `bridge.cjs` | `4af9ed780b4e` | `4af9ed780b4e` (unchanged this round) |
| `lead_watcher.cjs` | `a682309b4b5a` | **`f2feb0998afc`** |
| `autowake.cjs` | `d5c5ffb17ce8` | **`eee23341a3dc`** |
| `lead_watcher_session.cjs` | `5261b013770c` | `5261b013770c` |

Re-frozen: `locked: true, intact: true, blocked: false, unlockActive: false`.
Watchers restarted so the new code is live (`lead_watcher.cjs` 23004 -> **23704**).

### Honest limits (round 5)

* The proof is a **synthetic injection**, not an observation of a real ghost wake being
  suppressed in the wild.
* The **replay-from-0-on-shrink** behaviour is deliberately left as-is: it is correct
  for a genuine queue rotation, and the dead-root guard now makes replaying harmless.
  Live-project entries *can* still be re-emitted on a rotation; dedup is handled
  downstream by `seen_wakes.json`.
* I did not audit `emitLeadWake`'s other callers for the same dead-root assumption.
* `registry.json` remains at 163 with 0 scratch entries, but the bridge's own test
  suites keep adding `aw-selftest-*` / `bridge-e2e-*` / `A-*` entries continuously.





