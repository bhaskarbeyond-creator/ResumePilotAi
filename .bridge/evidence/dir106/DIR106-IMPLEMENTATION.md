# DIR-106 — Menu Bar AI Allowance Meter + Multi-Tenant /api/ai-usage

**Status: IMPLEMENTED AND VERIFIED LIVE.** Date 2026-10-13.
Frozen baseline `src/cv-templates/` + `backend/services/aiRuntime.js` = **0-byte diff**.

## Root causes closed

| # | Defect | Fix |
|---|---|---|
| RC-1 | `AiEngineStatus.jsx` hardcoded `inline-flex`, which out-ranked the shell's `className="hidden"`, so the "AI Engine Ready" beacon stayed visible instead of the allowance chip | Removed the display utility; display is now caller-owned (same contract as `AiTokenMeter`) |
| RC-2 | A multi-tenant caller (3 org memberships) made `loadApplicableTenantMembership` return `AMBIGUOUS_ACTIVE_TENANT`; `/api/ai-usage` propagated **HTTP 400 TENANT_CONTEXT_REQUIRED** → hook `UNAVAILABLE` → meter rendered `null` | Added an **opt-in** `allowAmbiguousSelection` that deterministically selects the PRIMARY membership (`updated_at DESC`, `tenantId ASC`); the telemetry route opts in, execution paths do not |
| RC-3 | The route paired the PERSONAL `remainingToday` with the ORGANIZATION `effectiveLimit` — an inconsistent triple that could advertise headroom the gate refuses | `remainingToday`/`isExhausted` are now derived from the SAME `effectiveLimit` the gate enforces |
| RC-4 | `resolveAiGovernance` and `getUserAiEntitlement` ran sequentially, costing one extra MariaDB round trip | Both now run CONCURRENTLY via `Promise.all` |

## Contract / invariant posture

- `aiGovernance.js` exports unchanged; `resolveAiGovernance(req, options = {})` and `loadApplicableTenantMembership(uid, id, options = {})` gained only OPTIONAL arguments — every existing caller is behaviour-identical.
- `/api/ai-usage` payload keeps every existing key and only ADDS `ambiguousTenant`.
- Strict default preserved: the quota gate (`abuse.js`) and `aiGovernanceMiddleware` pass no options and still fail closed.
- DOM pins kept: `data-testid="ai-token-meter"` / `data-ai-*`, `data-testid="ai-engine-status"`; shell wiring `<AiTokenMeter enabled={Boolean(user)} className="hidden sm:inline-flex" />` immediately before `M3NotificationCenter`.
- INV-1 (frozen 0-byte), INV-3 (no client-side quota maths), no fabricated telemetry, fail-closed execution: all upheld.

## Files changed

| File | Change |
|---|---|
| `src/components/cuba/AiEngineStatus.jsx` | Removed hardcoded `inline-flex`; display is caller-owned |
| `backend/security/aiGovernance.js` | `allowAmbiguousSelection` option; deterministic primary selection; `ambiguousTenant`; `membershipUpdatedAt` column |
| `backend/routes/ai.js` | Opt-in graceful telemetry; `Promise.all`; consistent used/limit/remaining; `ambiguousTenant` |
| `backend/test/ai-governance-entitlement.test.js` | Fake pool carries `updatedAt`; 3 new tests (graceful resolve, strict default, execution still fails closed) |
| `tests/ai-token-meter.test.mjs` | 1 new source assertion (handler opts into `allowAmbiguousSelection`) |

## Verification — actual results

| Check | Command | Result |
|---|---|---|
| Governance rules | `node --test backend/test/ai-governance-entitlement.test.js` | **25 / 0** |
| Meter contract | `node --test tests/ai-token-meter.test.mjs` | **18 / 0** |
| Abuse / quota | `node --test backend/test/ai-abuse.test.js` | **4 / 0** |
| Design system | `node --test tests/cuba-design-system.test.mjs` | **29 / 0** |
| Shell + controls | `node --test tests/dir048-shell-and-controls.test.mjs` | **7 / 0** |
| Header brand block | `node --test tests/dir079-header-brand-block.test.mjs` | **6 / 0** |
| UX gates | `node --test tests/ux-gates.test.mjs` | **6 / 0** |
| Build | `npm run build` | **vite built in 3.24s** (< 4.0s) |
| Frozen | `git diff -- src/cv-templates backend/services/aiRuntime.js` | **0 bytes** |

### Live governance probe — real MariaDB (`probe-governance-live.cjs`)

```
user            : bhaskar.beyond@gmail.com (role=SUPER_ADMIN, uid from MariaDB)
org memberships : 3 (personal tenants excluded)
STRICT   -> source=NONE reason=AMBIGUOUS_ACTIVE_TENANT error=TENANT_CONTEXT_REQUIRED/400
GRACEFUL -> source=ORGANIZATION tenant=9406f186-... userLimit=10000 sharedLimit=51500 ambiguous=true error=none
RESULT: PASS
```

### Live authenticated crawl — real Firebase session (`verify-authenticated.mjs`)

```
PASS  GET /api/ai-usage answers HTTP 200 for a multi-tenant user — HTTP 200
PASS  the allowance payload carries live figures — used=0 limit=10000 scope=ORGANIZATION ambiguous=true
PASS  the used/limit/remaining triple is internally consistent — remaining=10000
PASS  mobile-320 : beacon suppressed (visible=false) | chip not visible | 0 console errors
PASS  tablet-768 : beacon suppressed (visible=false) | chip visible | "✦ Org Usage: 0/10000" | 0 console errors
PASS  desktop-1440: beacon suppressed (visible=false) | chip visible | "✦ Org Usage: 0/10000" | 0 console errors
RESULT: PASS
```

## Operational note

The running backend process had to be restarted through the sanctioned lifecycle
(`bridge xampp stop backend` → `bridge xampp start backend`) for the new backend
code to take effect; the pre-restart crawl correctly showed the OLD behaviour
(HTTP 400, chip hidden) and the post-restart crawl shows the fix. No background
server was spawned by hand.
