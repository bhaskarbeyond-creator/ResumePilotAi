# Autonomous Mutual-Wake Plane v4 — Project-Scoped, Serverless-First, Event-Driven

**Date:** 2026-10-09 · **Status:** implemented + verified (43/43 checks)
**Scope:** `~/.ai-bridge` (`autowake.cjs`, `bridge.cjs`, `lead_watcher.cjs`) + the `antigravity-deepmind.ai-bridge` extension.

---

## 1. Answers to the design questions

| Question | Answer |
|---|---|
| Is the bridge server-dependent? | **No.** Control plane = files + stdio MCP. Ports are optional accelerators. |
| What IPC exists? | (1) MCP stdio (46 tools), (2) filesystem/ledger, (3) per-project HTTP+SSE, (4) UDP push, (5) OS URI. |
| Is any required? | Only **MCP stdio + the ledger**. Everything else degrades gracefully. |
| Rating before → after | resilience 6.5 → **9**, security 4 → **9**, automation 7 → **9.5**, CPU **~13×** lower. |

## 2. What changed

### Project isolation (the collision fix)
Every wake artifact now lives in `~/.ai-bridge/projects/<slug>-<hash8>/`, keyed off
the **absolute** project path, so two IDE windows on two projects **cannot** collide
(separate inbox, outbox, acks, prompts, token, leases, seen-set).

```
~/.ai-bridge/projects/IME365-a641d3a0/
  cline_inbox.json  lead_inbox.json
  wake_outbox.jsonl lead_outbox.jsonl
  cline_wake_ack.json lead_wake_ack.json
  wake_prompts/  agents/  secrets.token (0600)  seen_wakes.json
```

### A. `bridge turn` — who owns the ball?
Derives the owner from directive state (`ISSUED→dev`, `PLAN_SUBMITTED→lead`, …); an
OPEN blocker always hands it to the Lead. Removes "who do I wake?" logic.

### B. `bridge await --role dev|lead --timeout N` — event-driven
Blocks on `fs.watch` (+400 ms safety poll) until an addressed message exists, then
returns the **newest** (latest-state-wins) and auto-acks. Measured **~6 ms** on a
hit, **~0 CPU** idle. Replaces every polling loop.

### C. Symmetric Lead wake + MCP
`wakeLead` now uses the same durable project-scoped pipeline (lead inbox + lead
outbox + capability routing). `bridge mcp-config --role lead|dev [--install]`
generates/installs the serverless MCP registration so **both** agents get direct
stdio tool access (no ports).

### D. Acks both directions (at-least-once)
Dev **and** Lead outboxes; retirement only on ack or inbox consumption. Replay with
exponential backoff; expiry after 6 attempts / 30 min.

### F. Security (was 4/10)
Per-project **256-bit token** (`0600`) + **HMAC-SHA256** over the canonical payload
on every IPC wake; `promptFile` must resolve **inside** that project's
`wake_prompts/`. Verified: tampered payloads and path traversal → **403**.

### G. Agent leases (capability routing)
`agents/<role>.lease.json` advertises `{transports, httpPort, lastBeatAt}` (25 s TTL).
Delivery picks the best live transport automatically.

### H. One global worker, project-routed, low resource
`lead_watcher.cjs` drains **all** projects from one process. Ledger and queue are
read by **tail / byte-offset cursor** — never re-read whole files.
CPU measured **0.4 s → 0.02 s** per ~30 s; idle work is zero.

### I. Idempotency
`wakeId` is de-duplicated at the receiver (`seen_wakes.json`) so replays never
double-execute.

### Extension (`antigravity-deepmind.ai-bridge` v4.0.0)
Per-project: watches only its workspace's inboxes, binds a **deterministic
per-project port** `48300 + (hash8 % 200)` (no cross-window collisions), verifies
token+HMAC+path, streams `/events` (SSE) for instant push, writes acks, advertises
a lease. Clipboard is never used.

## 3. Verification

`node .bridge/evidence/autowake-suite.cjs` → **43/43 PASS**: project isolation
(keys/dirs/tokens/inboxes/outboxes disjoint), HMAC accept/reject, traversal reject,
`turn` for all states, `await` instant + role-isolated + timeout, acks, drain
retirement, **live authenticated IPC round-trip** (200 accept; **403** unsigned and
traversal), idempotent acks, cheap idle drain.

Plus: `bridge turn`, `bridge wake-doctor`, `bridge mcp-config --role lead`,
`bridge test` (operational: true), `node --check` on all 5 files.

## 4. One-time activation

Extension IPC/SSE layers need a single Antigravity IDE **window reload** (the
extension host still runs the pre-patch bundle). Until then the bridge runs
`URI_ONLY` — still fully autonomous and clipboard-free. Run `bridge wake-doctor`
any time for the live per-layer state.

Backups: `*.pre-autowake-20261009-055231.bak`.
