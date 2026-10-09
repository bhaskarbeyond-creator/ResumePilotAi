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

