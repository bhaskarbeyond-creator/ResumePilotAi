# DIR-017 — Evidence-Integrity Re-Verification (auto-retry #2)

**Trigger:** `SUPERVISOR_AUTO_RETRY` (heartbeat lapse > 480s while DIR-017 sat at
`EVIDENCE_SUBMITTED`). No product regression occurred, but re-inspection found a **genuine evidence
defect** that had to be corrected before the Gatekeeper could certify.

## Defect found and fixed: stale, self-contradicting JSON artifact

My previously submitted evidence pack cited `.bridge/evidence/dir017-results.json` as the AC-6
artifact. That file had been **overwritten by a later, narrower diagnostic probe** (a
`-g "stage 2"` grep run that hit the historical 420s timeout). The on-disk JSON therefore read
`expected=0, unexpected=1, status: timedOut` while my prose claimed 6/6 green — a direct
contradiction that would have failed Gatekeeper review.

**Fix:** re-ran the **full** 6-stage AC-6 suite (no grep filter) so the cited JSON is regenerated
from a complete run. The artifact is now self-consistent with the text log.

| | Before (cited) | After (regenerated) |
|---|---|---|
| `stats.expected` | 0 | **6** |
| `stats.unexpected` | 1 (`timedOut`, 420s) | **0** |
| `stats.flaky` | 0 | **0** |
| duration | 423.9s | **30.4s** |

## Gate Results (fresh, full re-run)

| Gate | Requirement | Result | Status |
|---|---|---|---|
| AC-6 Playwright (live stack) | 100% passing | **6/6 passed (30.4s)** — 5th consecutive green | PASS |
| INV-5 build budget | vite build < 4.0s | **3.71s** | PASS |
| AC-7 eslint (DashboardSettings) | 0 errors | **0 errors**, 2 pre-existing warnings, exit 0 | PASS |
| AC-7 test:security | no regression | **821/821 pass, 0 fail**, exit 0 | PASS |
| AC-7 test:product | no regression | 639 tests / **638 pass / 1 fail** | PASS (see below) |
| INV-1 frozen baseline | diff = 0 bytes | **0 bytes** | PASS |

AC-6 per-stage against live Vite(:3000) → API(:8080) → MariaDB: stage 1 outer switcher 3.1s ·
stage 2 real MariaDB identity round-trip 11.7s · stage 3 password re-auth + strength 4.7s ·
stage 4 MFA wizard QR/manual key 2.7s · stage 5 session card 2.1s · stage 6 WCAG AA contrast
light+dark 3.0s.

**Live-stack note:** the backend listens on **:8080** (proxied by `vite.config.js` `/api`), not
:5000. Vite dev server on :3000, API on :8080 — both confirmed listening.

## The 1 product failure — re-confirmed NOT DIR-017

`tests/cuba-enterprise-console.test.mjs:403 "honours a wildcard grant"` → `13 !== 14` (exit 1).

Isolation proofs re-confirmed this run:
1. `Select-String 'DashboardSettings'` in the failing test file → **0 references**.
2. The assertion depends solely on `src/components/cuba/portalNavigation.js`, a **DIR-016** surface.
3. That file's working-tree diff vs the DIR-007 freeze is **7350 bytes**, and every byte belongs to
   the DIR-016 RBAC lane, not to DIR-017's Account & Security surface.

**Root cause:** DIR-016 INV-3 (RBAC Integrity) gates the Platform Administration tab behind the
server-derived `platformAdmin` capability (`platformOnly: true`), withholding `platform` even under a
`['*']` wildcard → 13 of 14. The test asserts the **pre-DIR-016** invariant and is stale on the test
side. Patching it here would weaken a security assertion just to turn a number green — **escalated
to the Lead as DIR-016 scope, deliberately not touched under DIR-017.**

## Stability

AC-6 reproduced **5x** with zero flakes: 30.1s / 31.8s / 30.1s / 33.7s / **30.4s**. The original
stage-2 timeout remains root-caused and fixed (`waitForProfileHydrated()` stability condition, not a
fixed sleep).

**Artifacts:** `dir017-ac6-reverify-final.txt`, `dir017-results.json` (regenerated, consistent),
`dir017-sec-reverify-final.txt`, `dir017-prod-reverify-final.txt`.
