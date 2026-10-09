# Lead Liveness Guard — 100% automated self-healing for the Lead side of the bridge

**Status:** INSTALLED & VERIFIED (self-test 10/10).
**Artifacts:** `~/.ai-bridge/lead_liveness_guard.cjs`, `~/.ai-bridge/lead_guard_silent.vbs`,
tasks `AIBridge-LeadGuard-Periodic` (every 2 min) + `AIBridge-LeadGuard-Logon`.

## 1. The defect this closes

A directive could park forever at `PLAN_SUBMITTED` / `EVIDENCE_SUBMITTED` with **no
error and no recovery**. Root cause, proven from the running system:

| Fact | Evidence |
|---|---|
| The Lead wake can only use `file` + IPC | `bridge.cjs:3868` — `wakeLead()` calls `AW.deliver({ …, noUri: true })`; only `wakeCline()` passes a URI |
| IPC needs a **live Lead lease** (TTL 25s) | `autowake.cjs:642` — `leaseLive = (now - lease.lastBeatAt) <= LEASE_TTL_MS`; `LEASE_TTL_MS = 25000` |
| The Lead lease frequently does not exist | `projects/<key>/agents/` contained **`dev.lease.json` only** — no `lead.lease.json` |
| So every Lead dispatch fell back to a file | `logs/bridge.jsonl` → `{"to":"lead","via":"file","ipcOk":false,"uri":false,"leaseLive":false}` |
| The drain loop can only retry IPC | `autowake.cjs:655` — `if (leaseLive && lease.httpPort && token)` … then the entry **expires** after 6 attempts / 30 min |
| The watcher only *logs* | `lead_watcher.cjs:833-857` (CASE 6) prints an alert; it never re-dispatches |
| Nothing can start a dead Lead | `wakeLead` sets `noUri:true`, so the one channel that **launches the IDE** was disabled for the Lead |

Net effect: a silent permanent stall, recoverable only by a human noticing.

## 2. What the guard does (every 2 minutes, no human)

For each **real** project (root exists + has `.bridge/ledger.jsonl` + `.git`):

1. `AW.turn()` → only act when `owner === 'lead'`.
2. `AW.readLease(root,'lead')` → if the lease is **live**, do nothing.
3. If the Lead is **unreachable** (no/expired lease) or the ball has sat with the
   Lead past `STALL_MS` (3 min), re-deliver the Lead wake **with the URI channel
   enabled** (`noUri:false`). `dispatchUri()` then opens/focuses Antigravity IDE on
   the durable prompt file — the only mechanism that can resurrect a dead agent.
4. After `ESCALATE_AFTER` (3) failed launches it **notifies the human on Telegram**
   (throttled to 30 min), so the loop can never fail silently. After escalation the
   retry cadence drops to the 30-min escalation cadence, so the IDE is never
   relaunched every few minutes forever.

It never fakes a lease, never marks an undelivered wake delivered, and **never
modifies a frozen bridge file** — it is purely additive.

## 3. Proof

```
$ node .bridge/evidence/lead-guard-selftest.cjs
PASS — 10 passed, 0 failed
```

Live recovery, triggered by the **Windows scheduled task** (not by hand):

```
{"ts":"2026-10-09T04:53:13.075Z","event":"LEAD_RELAUNCH",
 "detail":{"projectKey":"IME365-a641d3a0","directiveId":"DIR-057",
           "reason":"Open blocker question evt_mv0h507c_85f3460fbba6 awaits the Lead",
           "leaseLive":false,"stalled":true,"attempt":1,"via":"uri","uri":true}}
```

`via:"uri", uri:true` = the IDE was launched/focused with the Lead wake. The dev
lease re-registered at `04:53:22`, confirming the IDE came up.

## 4. Observability

- Log: `~/.ai-bridge/logs/lead_liveness_guard.jsonl` (`TICK` heartbeat every run,
  `LEAD_RELAUNCH`, `LEAD_ESCALATED`).
- State: `~/.ai-bridge/lead_liveness_guard_state.json` (per project+directive
  attempt counters and backoff).
- Manual run: `node ~/.ai-bridge/lead_liveness_guard.cjs --once` (add `--dry-run`
  to evaluate without launching).

## 5. Honest residual limit (not over-claimed)

The guard can **guarantee the Lead is woken** and **guarantee a human is told if
that fails**. It cannot *force* an LLM Lead to complete the review — that still
requires the opened task to act. What is now impossible is the previous failure
mode: a directive stalling **silently and permanently**.

## 6. Optional permanent fix (needs frozen-module authorisation)

The root cause is one line in a frozen file: `wakeLead()` passes `noUri: true`.
Allowing the URI fallback there (`noUri:false` + `uriExt`) would make the Lead
recoverable *natively*, without a side daemon. That is a **2-line change to
`bridge.cjs`**, which is sha256-pinned in `CERTIFIED_FREEZE_MANIFEST.json`, so it
requires AGENTS.md §10.1 (INFORM → APPROVE → MODIFY → REVERIFY). The guard above
delivers the same outcome today without touching any frozen surface.
