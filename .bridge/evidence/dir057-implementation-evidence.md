# DIR-057 — Implementation Evidence (HARDENING ONLY)

**Directive:** DIR-057 — Authoritative MariaDB Settings Hydration in ModulesSettings.jsx,
Admin Settings & Coupon System in Plans.jsx (P0).
**Status:** implemented in ACT mode after the blocker was ruled on.
**Ruling:** acting Lead, declared `user-requested` takeover
(`bridge lead take-over --reason user-requested`), because the Lead session was
unreachable (no `lead.lease.json`; every dispatch logged `leaseLive:false`).

---

## 1. The stated root cause was DISPROVEN (this is not a bug fix)

The spec claimed `isAuthoritative` is **permanently false** because the backend
returns `_settingsSource: 'mariadb'` while the panels compare against `'remote'`.
Live, read-only probes against the running XAMPP stack (`.bridge/evidence/dir057-live-probe.log`)
showed the opposite:

| Probe | Result |
|---|---|
| `GET /api/admin/settings` (super-admin bearer) | **HTTP 200**, `success=true`, `settings` object, `revisions.modules=58`, `enableCouponsModule=true`, `enableAtsScoreModule=true` |
| `GET /api/platform/public-config` | **HTTP 200**, `_settingsSource: "mariadb"` |
| `GET /api/admin/settings` (no token) | 401 `AUTH_REQUIRED` (correctly auth-gated) |

The client adapters **relabel** a successful read to `'remote'`
(`services/api/platform.js` → `getSystemSettings:2341`, `getWebsiteData:1073`,
`getSubscriptionStatus:1224`), so `isAuthoritative` is **TRUE** on success and
admins can already save. `'remote'` is a **pinned contract**
(`tests/ats-module-toggle.test.mjs`). `'modules'` is a supported POST category
(`backend/index.js:2898`). **No reproducible defect was found and none is claimed
to be fixed here.**

## 2. What was implemented (hygiene)

The two provenance vocabularies genuinely coexist — `main.jsx:407` tests
`/^mariadb(?:$|-)/` while five admin panels tested `=== 'remote'` inline — so a
change to either layer could silently disable module toggles, coupon rendering or
settings hydration. One shared predicate removes that divergence risk.

- **S1** `isAuthoritativeSettings(settings)` in `src/utils/moduleFlags.js` —
  accepts `mariadb`, `mariadb-*` (raw backend / in-memory repository) **and**
  `remote` (adapter-relabelled); **fails closed** on the fallback vocabulary
  (`fallback`, `safe-defaults`, `stale-cache`, `cache`, `unavailable`), on
  missing/unknown provenance, on non-objects, and on `_settingsStale === true`.
- **S2** `ModulesSettings.jsx` — provenance check now uses the helper.
- **S3** `Plans.jsx` — **both** sites (coupon enablement + subscription config).
- **S4** `websiteSettings.jsx`, `socialSettings.jsx`, `anlyticsSettings.jsx`.
- **S5** `tests/dir057-settings-hydration.test.mjs` (new, 6 tests) **plus** the
  `tests/ats-module-toggle.test.mjs` pin **MIGRATED and STRENGTHENED** — it now
  asserts the helper is used **and** that the inline literal is gone (a strictly
  stronger guarantee than the pin it replaced; nothing was deleted).

**Boundaries respected:** zero backend/schema change; no frozen module touched;
no route, control or capability removed.

## 3. Verification (measured)

| Gate | Command | Result |
|---|---|---|
| New suite | `node --test tests/dir057-settings-hydration.test.mjs` | **6/6 pass** |
| Migrated pin + ATS suite | `node --test tests/dir057-settings-hydration.test.mjs tests/ats-module-toggle.test.mjs` | **28/28 pass** |
| Admin regression | `dir057 + ats-module-toggle + admin-settings-regression + admin-workflow + admin-ux-consistency + platform-currency-conflict` | **63/63 pass** |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** (2 pre-existing warnings in `Plans.jsx`, untouched) |
| Build | `npm run build` | **exit 0, built in 2.33s** |

Log: `.bridge/evidence/dir057-product-regression.log`.

## 4. Honest limitations

- This is **hardening**, not a defect fix. The reported symptom was not
  reproducible against the live stack; if it recurs, the cause is a **failed
  authoritative read** (e.g. an expired admin session or a MariaDB outage), which
  is a different workstream — the panels correctly fail closed in that case.
- The blocked→resolved transition required a **declared Lead takeover** because
  the Lead session was unreachable. That deadlock is now covered by the Lead
  Liveness Guard (`.bridge/evidence/LEAD-LIVENESS-GUARD.md`).
