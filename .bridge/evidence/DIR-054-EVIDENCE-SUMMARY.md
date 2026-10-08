# DIR-054 — EVIDENCE SUMMARY

**Directive:** DIR-054 — Eliminate 429 Storm on `/api/messages/conversations`, Shared Poller Architecture & Rate-Limit Alignment
**Priority:** P0 · **Mode:** ACT (plan approved by the Lead at 2026-10-08T16:50Z)
**Workspace:** `D:\xampp\htdocs\IME365` (verified: `git rev-parse --show-toplevel` = same path)
**Servers:** all via XAMPP / bridge-managed only (`bridge xampp status` → Apache 80/443 UP, MariaDB 3306 UP, backend 8080 UP, healthy+ready). No detached server was spawned.

---

## 1. Root causes — confirmed against source, then measured live

| RCA | Claim | Verdict | Evidence |
| :-- | :---- | :------ | :------- |
| RCA-1 | 4 independent `useUnreadMessages()` instances each owned a private 15s interval | **CONFIRMED & AMPLIFIED** | `CubaCandidateShell.jsx:170`, `MessagesNavBadge.jsx:74`, `ProfileDisplay.jsx:34`, `EmployerSidebar.jsx:194` → 16 req/min = **80 req / 5 min** against a 30-request budget (exhausted in ~1.9 min) |
| RCA-2 | Global `messagingAccountLimiter` (30 / 5 min) applied to passive GET reads | **CONFIRMED LIVE** | Pre-fix probe: `RateLimit-Limit: 30`, requests 11-35 → `429 RATE_LIMITED`, `Retry-After: ~52` |
| RCA-3 | No backoff / no `Retry-After` respect; fixed `setInterval` retried forever | **CONFIRMED** | old `useUnreadMessages.js:99` `setInterval(refresh, POLL_INTERVAL_MS)`; catch only set `status='error'` |
| RCA-4 | No in-flight/coalescing dedup on the conversations read | **CONFIRMED** | old hook issued one request per instance per tick |
| RCA-5 | DIR-023 amber token regression from DIR-053 | **CONFIRMED** | `node --test tests/dir023-contrast-tokens.test.mjs` → 14 pass / **1 FAIL**: `bg-amber-50/95`, `border-amber-300/70`, `dark:text-amber-100/80` |
| RCA-5 correction | Spec names `src/components/cuba/CubaCandidateHero.jsx` | **DOES NOT EXIST** | real file: `src/components/Candidate/CubaCandidateHero.jsx:201,206` |

---

## 2. Changes

| File | Change |
| :--- | :----- |
| `backend/security/abuse.js` | new `messagingReadAccountLimiter` (`messaging-read`, `MESSAGING_READ_FIVE_MINUTE_LIMIT \|\| 300`, `failClosed:false`) + `messagingAccountLimiter` default raised 30 → **150** (still `failClosed:true`); both exported |
| `backend/index.js:555` | blanket `app.use('/api/messages', messagingAccountLimiter)` replaced by a **method-aware dispatcher**: GET/HEAD → read budget, everything else → mutation budget. The DIR-026 fail-closed module gate still follows, still after `requireAuth` |
| `backend/services/platformConfiguration.js` | `MESSAGING_READ_FIVE_MINUTE_LIMIT` registered so the admin panel can tune both budgets |
| `src/services/api/platform.js` | `apiJson` **additively** attaches `err.retryAfter` from the `Retry-After` header (delta-seconds or HTTP-date); all existing error fields untouched |
| `src/hooks/unreadMessagesPoller.js` **(new)** | pure, React-free singleton scheduler: refcounted subscribers, single in-flight read, shared snapshot, exponential ladder 15/30/60/120/240 → cap 300s, `Retry-After` honoured as a floor, injectable clock |
| `src/hooks/useUnreadMessages.js` | polls through the shared singleton; one shared module-flag read per minute for the whole app; `POLL_INTERVAL_MS = 15000`, the focus listener and the returned `{ unreadCount, error, status, enabled, refresh }` contract preserved |
| `src/components/Candidate/CubaCandidateHero.jsx` | `bg-amber-50/95`→`/90`, `border-amber-300/70`→`/80`, `dark:text-amber-100/80`→`dark:text-amber-100` (all already mapped in `cuba-tokens.css`) |
| `tests/dir054-shared-poller.test.mjs` **(new)** | 15-test battery (below), wired into `npm run test:product` |
| `package.json` | `test:product` now also runs the DIR-054 battery |

**Zero new `!important` token maps** — the fix reuses the audited classes, so the DIR-023 dark-harmonisation envelope is untouched.


---

## 3. Verification — static & unit gates

| Gate | Command | Result | Log |
| :--- | :------ | :----- | :-- |
| Security static | `npm run test:security:static` | **67 / 67 pass, 0 fail** (exit 0) | `.bridge/evidence/dir054-security-static.log` |
| Lint | `npm run lint` | **exit 0 — 0 errors**, 253 warnings (identical to the DIR-047 baseline of 253/0) | `.bridge/evidence/dir054-lint.log` |
| Full suite | `npm test` | **1715 tests, 0 failures** (exit 0) | `.bridge/evidence/dir054-npm-test.log` |
| Build | `npm run build` | **built in 3.38s** (budget < 4.0s), exit 0 | `.bridge/evidence/dir054-build.log` |
| DIR-054 + messaging + DIR-023 battery | `node --test tests/dir054-shared-poller.test.mjs tests/messaging-module-gate.test.mjs tests/messaging-regression.test.mjs tests/dir023-contrast-tokens.test.mjs` | **42 / 42 pass, 0 fail** (exit 0) — includes the DIR-026 hook/badge/gate contract and DIR-023 15/15 | `.bridge/evidence/dir054-final-battery.log` |
| Frozen baseline (INV-1) | `git diff e314f715 --stat -- src/cv-templates/ backend/services/aiRuntime.js` | **0 lines — strictly empty** | — |

### The DIR-054 battery (`tests/dir054-shared-poller.test.mjs`, 15 tests, executed — not grepped)
* ladder `15s → 30s → 60s → 120s → 240s → 300s → 300s`
* `Retry-After` is a **floor**: 45s wins over the ladder; the ladder (120s) wins over a 1s `Retry-After`; 900s is clamped to 300s
* **4 consumers ⇒ 1 read per tick** — 25 reads over 6 virtual minutes at an exactly 15000ms cadence (the pre-DIR-054 design would have issued 96); a late subscriber triggers no extra read and receives the shared snapshot immediately
* concurrent refreshes (a focus event heard by all instances) collapse onto the single in-flight read
* a persistent outage costs ≤ 7 reads in 20 virtual minutes (vs 80 at the old fixed interval)
* `Retry-After` is honoured to the second, and `refresh()` cannot jump the deadline
* one success resets the cadence to 15s and clears `error`/`failures`
* a failed read keeps the last known count — never a fabricated zero inbox
* the last unsubscribe clears the shared timer; a closed tab issues no further traffic
* wire contract: read/mutation namespaces + defaults 300/150, the method-aware mount, the gate still after `requireAuth`, the registry entries, `err.retryAfter`, and the absence of the three unmapped amber classes

---

## 4. Verification — LIVE differential probe on the real vhost (`https://ime365.local`)

One-shot probe (`.bridge/tmp/dir054-limit-probe.mjs`), real Firebase ID token for `bhaskar.beyond@gmail.com`.

| Run | Requests | 200 | 429 | Advertised limit | Evidence |
| :-- | :------- | :-- | :-- | :--------------- | :------- |
| **Before** (pre-restart backend) | 35 | 10 | **25** | `RateLimit-Limit: 30` | `.bridge/evidence/dir054-limit-probe-baseline-before-fix.json` |
| **After** (method-aware limiter live) | 150 | **150** | **0** | `RateLimit-Limit: 300` | `.bridge/evidence/dir054-limit-probe-after-fix.json` |

The storm is reproduced on demand and then eliminated: 150 consecutive reads — five times the old ceiling — all return `200`.

---

## 5. Verification — LIVE 6.5-minute dashboard capture (S10)

`.bridge/tmp/dir054-live-capture.mjs` — headless Chromium, real Firebase session (`window.fire.auth().signInWithCustomToken`), real MariaDB data (admin uid `OhZdiSIFL7ePA1TMkfu9bnR935D3`, 2 conversations / 18 messages, `public_config.modules.enableMessagesModule = true`, revision 58), 390 continuous seconds on `/dashboard`.

| Metric | Result |
| :----- | :----- |
| Duration | 390 000 ms continuous |
| `GET /api/messages/conversations` | **26 requests — expected 26 ticks** |
| Status codes | **26 × 200** |
| **429 responses** | **0** |
| Cadence (inter-arrival) | min **15 320 ms** / max 17 133 ms / mean **15 495 ms** |
| **Bursts** (gap < 7.5s, the 4-instance signature) | **0** |
| Console errors containing 429 | **0** |
| Badge state | `aria-label="Messages, 0 unread"`, present at start and at end (stable, no error pill) |
| DIR-053 reconnect banner | absent |
| Served bundle under test | `assets/useUnreadMessages-DGYs-KZh.js` — **contains `readsDispatched`**, i.e. the shared poller really is what the browser ran |

Evidence: `.bridge/evidence/dir054-live-capture.json`, `.bridge/evidence/dir054-live-capture.log`, `.bridge/evidence/dir054-smoke.json`.

### Honest limitations of the capture (zero fabrication)
The capture recorded **5 console error lines, none of them a 429 and none from the messaging pipeline**:
* **4 × `Failed to load resource: 404 (Not Found)`** — all from `GET https://ime365.local/api/resumes/OhZdiSIFL7ePA1TMkfu9bnR935D3`, i.e. the candidate shell asking for a resume whose id is the user's uid (`src/components/Candidate/CubaCandidateShell.jsx:273` → `getResumeById(currentId)`). **Pre-existing, non-messaging, out of DIR-054 scope**; not introduced or touched by this directive. Recommend a follow-up directive.
* **1 × `net::ERR_CONNECTION_RESET` to `https://m.stripe.com/6`** — third-party Stripe telemetry, blocked in the local sandbox.

No messaging request failed, none returned ≥ 400, and `requestfailed` recorded no application request.

---

## 6. Invariants upheld
* **INV-1 Frozen baseline:** `git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js` = **0 bytes**.
* **Zero fabrication:** every number above is read from a real run; the badge count is the server's `totalUnread`.
* **STRICT XAMPP:** Apache/MySQL/backend lifecycle only via `bridge xampp stop|start all`; no detached `node`/`vite`/`nodemon` process was created. All probes are one-shot CLIs.
* **DIR-026 contracts preserved:** module-gate polarity, participant isolation, hook return shape, `POLL_INTERVAL_MS = 15000`, focus refresh, badge a11y (`messaging-module-gate.test.mjs` 12/12 green).
* **DIR-023 token envelope preserved:** 15/15 green with zero new `!important` maps.
