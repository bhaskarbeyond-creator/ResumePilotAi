# DIR-106 — Phase 4/5 Implementation & Verification Record

**Status: IMPLEMENTED — demonstrated by code, database, UI and tests.**
Date: 2026-10-12 · No frozen file touched (`INV-1` verified 0-byte).

## Defect closure

| ID | Defect | Status | Evidence |
|---|---|---|---|
| **P0-1** | Org members charged against their personal allowance (`req.tenantContext` always undefined at the quota gate) | **FIXED** | `backend/security/aiGovernance.js` (new single resolver) + `index.js:547,553,555` install it **before** the gate; `abuse.js` now consumes `req.aiGovernance`. Live: `scope=ORGANIZATION` |
| **P0-5** | No organization-wide cap | **FIXED** | migration `026_ai_quota_counters.sql`; shared counter locked **first** inside the same transaction (`abuse.js`) |
| **P0-4** | `GET /api/admin/ai-settings` write-permitted but read-forbidden | **FIXED** | `requireSuperAdmin` on the route (`index.js:2681`) + policy map entry `'/admin/ai-settings' -> 'system.config.read'` (`policy.js:73`) |
| **P0-2** | Multi-org resolution arbitrary; `resolveActiveTenantMembership` stub | **FIXED** | `loadApplicableTenantMembership()` refuses ambiguity (`AMBIGUOUS_ACTIVE_TENANT`); explicit `x-tenant-id` selects deterministically. Live-verified |
| **P0-3** | Invalid membership/tenant still granted access | **FIXED** | `isTenantEntitlementValid()` (`entitlements.js:49`) gates `isEnterprise`; resolver filters `personalTenant`, non-ACTIVE status and `decommissionedAt` |
| **P1-1** | `Math.max(1000, tenantLimit)` overrode tenant config | **FIXED** | `entitlements.js:118` — tenant value honoured; only unusable values fall back |
| **P1-2** | Personal `aiQuotaOverride` outranked the org allowance | **FIXED** | `entitlements.js:143` — `&& !isEnterprise` |
| **P1-6 (new)** | `x-tenant-id` rejected with **400** on `/api/ai-usage` | **FIXED** | `/ai-usage` added to `isTenantAwareRoute` (`index.js:536`) — found only by the live probe |

## Files changed

| File | Change |
|---|---|
| `backend/security/aiGovernance.js` | **NEW** — the single authoritative resolver (middleware + membership selection) |
| `backend/security/abuse.js` | Quota gate consumes `req.aiGovernance`; shared + per-user counters in one transaction; `X-AI-Quota-Source` / `X-AI-Org-Daily-*`; `AI_ORG_QUOTA_EXCEEDED` |
| `backend/security/entitlements.js` | `isTenantEntitlementValid()`; floor removed; override scoped away from enterprise |
| `backend/security/policy.js` | `/admin/ai-settings` → `system.config.read` |
| `backend/index.js` | Governance middleware wired before the gate; `requireSuperAdmin` on the AI-settings read; `/ai-usage` tenant-aware |
| `backend/routes/ai.js` | `/api/ai-usage` reports `quotaScope`, `tenantId`, `orgDailyLimit` |
| `backend/database/migrations/026_ai_quota_counters.{sql,down.sql}` | **NEW** — shared counter + tenant attribution |
| `src/hooks/useAiTokenUsage.js` | Carries `quotaScope` / `orgDailyLimit` |
| `src/components/cuba/AiTokenMeter.jsx` | Names the budget ("Org" badge, `data-ai-scope`, announcement) |
| `backend/test/ai-governance-entitlement.test.js` | **NEW** — 19 rule tests |
| `backend/test/ai-abuse.test.js` | Fake pool models the new pre-transaction read + column order |

## Verification — actual results

| Check | Command | Result |
|---|---|---|
| Governance rules | `node --test test/ai-governance-entitlement.test.js` | **19 / 0** |
| Quota + entitlement regression | 9 backend suites | **47 / 0** |
| Frontend suites | meter + design-system + user-menu + shell + ux-gates | **68 / 0** |
| Build | `npm run build` | **3.23 s / 2.90 s** (cold run 4.66 s) |
| **Live org entitlement** | `verify-org-entitlement-live.mjs` | **RESULT: PASS** |
| **Authenticated UI** | `verify-authenticated.mjs` | **RESULT: PASS** |
| `INV-1` frozen | `git diff -- src/cv-templates backend/services/aiRuntime.js` | **0-byte** |

### Live proof (real MariaDB rows, real Firebase ID tokens)

```
PASS  Rule A (live): a real org member resolves to the ORGANIZATION budget
      HTTP 200  scope=ORGANIZATION  tenant=df0adba6-...
PASS  Rule A (live): the ORGANIZATION daily limit is reported, not the personal one
      orgDailyLimit=100  tenantPolicy=100
PASS  P0-2 (live): a user in TWO tenants is never resolved arbitrarily
      scope=INDIVIDUAL
PASS  P0-2 (live): x-tenant-id selects the correct tenant POLICY
      tenant=9406f186-...  limit=51500   (vs df0adba6-.../100)
RESULT: PASS
```

The final assertion is the strongest: the two tenants carry **different** limits
(51 500 vs 100), so the header provably selects the tenant **policy** rather than
returning a constant.

### UI

```
PASS  desktop-1440: renders "Usage: <used>/<limit>" with no unit text
      text="Usage: 0/10000 . 10000 of 10000 AI requests left today
            on your personal allowance on the Basic plan. Resets daily."
```

The chip now names the budget, so an organization member can see they are spending
the organization's allowance rather than a personal one.

## Not done — honest status

- **P1-3 / P1-4** (release reservation on provider failure; idempotent retries) — the
  reservation ledger (`ai_quota_reservations`) is **designed but not built**. Usage is
  still charged before provider invocation with no compensating decrement.
- **P1-5** (explicit credential-selection policy) — unchanged; `tenantAi.js:52` still
  falls back to the platform key implicitly. Note the tenant registry **rejects**
  `customProviderKeys` (`mysqlTenantRegistry.js:140`), so tenant BYOK is disabled by design.
- **P1-6** (provider-key encryption at rest) — still **unverified**, not claimed.
- **P2-1** (Admin branch preceding Enterprise) — unchanged.
- The **enterprise suite** (`backend/enterprise-test/*`) did not finish within this
  session; its status is **NOT VERIFIED** here.
- The `x-tenant-id` guard fix (P1-6) means the header is now accepted on `/ai-usage`;
  the same guard still rejects it on every other legacy route, by design.


## Database

```
026_ai_quota_counters applied (77ms) — schema_migrations current
ai_quota_counters: scope, scope_key, uid, day_key, count, limit_used, last_used_at, created_at
ai_usage: + tenant_id, scope   (additive; existing rows unchanged)
```
