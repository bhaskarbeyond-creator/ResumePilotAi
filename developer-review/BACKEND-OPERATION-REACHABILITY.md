# Backend Operation Reachability Register

**Authoritative revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (branch `arena/393531fe-resumepilotai`; `origin/main` = same; `origin/dev` = `ea7b7416…`, tree-identical)
**Generator:** `developer-review/tools/backend-reachability.cjs`
**Machine-readable register:** `Evidence/artifacts/backend-reachability.json` (385 records),
`Evidence/artifacts/backend-operations.tsv` (tabular), `Evidence/logs/backend-reachability.log`
**Independent cross-check:** `tools/reachability-crosscheck.cjs` — 385/385 agreements, 0 disagreements
**Client-side contract check:** `tools/client-call-existence.cjs` — 229 call sites, 23 served by no operation (DISC-025)
**V5 status:** superseded counts are retained in §5; the register itself is authoritative as of `cccd35a5`.
**Supersedes:** the binary "consumed / not consumed" split in `tools/backend-ui-coverage.cjs` (kept, unmodified, for provenance)

---

## 1. Why this register exists

The 2026-10-29 pass reported **384 unique backend operations, 192 "unreachable from the modern UI", 58
"completely orphaned"**. Re-running that tool reproduces those two numbers exactly
(`Evidence/logs/backend-ui-coverage.log`), so the arithmetic was right — but the *classification* was
wrong in both directions, and the V4 mandate requires a seven-class register with a stated rule per
class.

Two defects in the earlier rule set:

1. **Dead-hook references counted as reachability.** `frontend/src/hooks/use-api-hooks.ts` defines 22
   hooks; several have zero consumers. `backend-ui-coverage.cjs` counted any mention in that file as
   "consumed by the modern frontend", which promoted ~67 operations to *reachable* that no UI can
   actually invoke — including `GET /admin/audit-logs`, the exact endpoint
   `DISCREPANCY-LOG.md` DISC-014 / `FP-A05` says is fabricated over.
2. **String mentions counted as calls, and loose prefix matching inflated both directions.**
   `AdminHealthTab.tsx` lists API paths as *display metadata* (`affectedApis: ['/api/admin/audit-logs']`).
   Those are not callers. Conversely, `/auth` as a literal promoted `/auth/login`, `/auth/logout`, … to
   "called".

The replacement requires an actual **call site** (`get(`/`post(`/`fetch(`/`apiClient.get(` …), excludes
files that merely *register* the route, excludes test trees from calling, and adds the classes the
mandate defines.

## 2. Counting units (kept separate, never summed into one denominator)

| Unit | Value | Method |
|---|---:|---|
| Route **registrations** (`router.<verb>(…)` / `app.<all>(…)` call sites) | **499** | regex over `backend/routes/*.js` + `backend/index.js`, mount-prefix expanded |
| Unique **METHOD + path** pairs after mount resolution and de-duplication | **385** | this is the operation register denominator |
| Duplicate/overlapping registrations collapsed | **114** | 499 − 385 (same method+path declared twice, e.g. index.js + a router) |
| Handlers | **384** | 1 inline handler per unique operation; no shared handler serves two paths |
| Database operations | **not counted** | not enumerable from route declarations; see `DATABASE-INVENTORY.md` and §8 |

Mount prefixes were resolved for all 385 operations (0 unresolved). `backend/index.js` is CommonJS with
destructured `require`, so imports are resolved from `const { x } = require('./routes/y')` and
`const x = require('./routes/y')` as well as ESM `import`.

## 3. Classification rules (first match wins, deterministic)

| Rule | Class | Condition |
|---|---|---|
| R1 | `UI-REACHABLE` | A **call site** exists in `frontend/src` other than the dead-hook file. A file that only *registers* the route is never a caller. |
| R2 | `INDIRECTLY-REACHABLE` | Called only from `hooks/use-api-hooks.ts`, and the hook(s) that call it have ≥1 consumer in `frontend/src`. |
| R2′ | `UNREACHABLE` | Called only from that file, and every hook that calls it has **0 consumers**. |
| R7 | `UNVERIFIED` | No direct call site, but a *child* path is called from modern code — static analysis cannot decide parent reachability. Note: several such child paths are themselves not registered (DISC-025), so this rule records *ambiguity*, never reachability. |
| R7b | `UNVERIFIED` | No direct call site, but a call exists whose path shape is compatible (same segment count, dynamic segments on either side) — it may construct this path at runtime. Replaced the V4 `dynamicParent` rule, which wrongly promoted every child of a called parent to `UI-REACHABLE`. |
| R3 | `EXTERNAL-CALLER` | Provider webhook/callback, OAuth redirect, payment verifier, M2M API, agent/LLM `v1` API, OG-image generator, health probe, public JSON feed. |
| R5 | `INTENTIONALLY-UNEXPOSED` | Machine/service-account scoped route (`m2m`, `service-account`, `support-grant`). |
| R4 | `SERVER-ONLY` | Called by backend code (HTTP self-call) or its router module is required and invoked in-process by another backend module. `backend/services/platformHealth.js` is excluded — it enumerates routers for existence probes and does not invoke handlers. |
| R6 | `UNREACHABLE` | No caller of any kind: no UI call site, no external caller, no server reuse, no machine scope. Tests are **not** callers. |

## 4. Result

| Reachability class | Operations | % of 385 |
|---|---:|---:|
| `UI-REACHABLE` | **152** | 39.5 % |
| `INDIRECTLY-REACHABLE` | **7** | 1.8 % |
| `EXTERNAL-CALLER` | **27** | 7.0 % |
| `SERVER-ONLY` | **11** | 2.9 % |
| `INTENTIONALLY-UNEXPOSED` | **2** | 0.5 % |
| `UNREACHABLE` | **176** | 45.7 % |
| `UNVERIFIED` | **10** | 2.6 % |
| **Total** | **385** | 100 % |

Derived measures, each with its own denominator:

| Measure | Numerator / denominator | Value |
|---|---|---:|
| Operations with a live modern call path (UI + indirect) | 159 / 385 | **41.3 %** |
| Operations with **no** modern UI call site | 226 / 385 | **58.7 %** |
| Operations unreachable from *any* client, after accounting for webhooks, server reuse and machine scope | 176 / 385 | **45.7 %** |
| Operations never referenced by **either** frontend (modern or legacy) | 153 / 385 | **39.7 %** |
| Operations the legacy UI called that no modern client calls | 23 / 385 | **6.0 %** |
| Client call sites whose path no operation serves | 30 of 229 call sites / 23 distinct paths | **13.1 %** (DISC-025) |

## 5. Reconciliation with the previously reported figures

Three successive figures exist for this register. None is deleted.

| Version | Unique ops | UI / indirect / external / server / machine / unreachable / unverified | What changed and why |
|---|---:|---|---|
| 2026-10-29 pass | 384 | binary: 192 "unreachable from modern UI", 58 "orphaned" | counted dead-hook mentions and string metadata as callers |
| V4 (`0adad00`) | 384 | 126 / 6 / 27 / 11 / 9 / 201 / 4 | seven classes introduced; but `enterpriseRequest` was invisible and `dynamicParent` over-promoted |
| **V5 (`cccd35a5`)** | **385** | **152 / 7 / 27 / 11 / 2 / 176 / 10** | three classifier defects fixed and `app.all` parsed (DISC-024) |

V4 to V5 movement, reconciled class by class (66 operations changed class):

| Movement | Ops | Cause |
|---|---:|---|
| `UNREACHABLE` to `UI-REACHABLE` | 38 | `enterpriseRequest(` was not a recognised call helper (46 call sites in `lib/enterprise-api.ts`) |
| `INTENTIONALLY-UNEXPOSED` to `UI-REACHABLE` | 7 | same defect: the `/enterprise/service-accounts` and `/enterprise/support-grants` families are in fact driven from the enterprise console |
| `UI-REACHABLE` to `UNREACHABLE` | 12 | `dynamicParent` removed; a call to `/admin/users/:id` is not a call to `/admin/users/:id/ai-entitlement` |
| `UI-REACHABLE` to `UNVERIFIED` | 5 | replaced by the shape-compatible rule (R7b), which records ambiguity instead of asserting reachability |
| `UNREACHABLE` to `UNVERIFIED` | 1 | the public resume path is shape-compatible with the publication path |
| `UNREACHABLE` to `INDIRECTLY-REACHABLE` | 1 | multi-line hook attribution fixed (`/employer/jobs/{X}/applications/{X}/resume`) |
| new operation | 1 | `app.all('/api/admin/ai/fetch-models')` parsed for the first time |

**Net effect:** the backend is *less* undrivable than V4 reported (176 = 45.7 % vs 201 = 52.3 %), because
the enterprise control plane is actually wired. The `UNREACHABLE` figure is still large, and 176 is a
floor rather than a ceiling: 23 of the client paths that would explain some of these operations do not
exist at all (DISC-025), so "no call site" here sometimes means "the call site is broken", which is
worse than orphaned, not better.

## 6. Unreachable operations by area (176)

| Prefix | Unreachable operations |
|---|---:|
| `/admin` | 79 |
| `/platform` | 34 |
| `/enterprise` | 15 |
| `/auth` | 10 |
| `/blog-data` | 6 |
| `/phrases` | 4 |
| `/coupons` | 2 |
| `/invoice` | 2 |
| `/invoices` | 2 |
| `/payment-orders` | 2 |
| `/stats` | 2 |
| `/check` | 1 |
| `/contact` | 1 |
| `/employer-applications` | 1 |
| `/export` | 1 |
| `/favourites` | 1 |
| `/health` | 1 |
| `/jobs` | 1 |
| `/linkedin-scraper` | 1 |
| `/notifications-data` | 1 |
| `/notify` | 1 |
| `/payment` | 1 |
| `/public-export` | 1 |
| `/public-export-docx` | 1 |
| `/reviews` | 1 |
| `/rtl-font-config` | 1 |
| `/send-sms` | 1 |
| `/service-availability` | 1 |
| `/subscription` | 1 |

Split by provenance: **23** operations were called by the legacy UI and are not called by any modern
client (candidate regressions); **153** have never been called by any client in either tree (latent or
server-to-server features awaiting a UI). Every one of the 176 carries a machine-readable `rule` +
`reason` in `Evidence/artifacts/backend-reachability.json` and `Evidence/artifacts/backend-operations.tsv`,
and §9 prints all of them.

### 6.1 Highest-consequence unreachable operations

| Operation | Why it matters | Related finding |
|---|---|---|
| `GET /admin/audit-logs`, `GET /admin/audit-logs/stats` | permission-guarded, tested audit trail; the only UI consumer is a dead hook | DISC-014, FP-A22 |
| `GET/POST/PUT/DELETE /admin/coupons*` | discount administration; checkout can *redeem* a coupon but nobody can create one | DISC-016, RA-20 |
| `POST /admin/payments/refund` | refund execution | DISC-016, RA-20 |
| `GET /invoices`, `GET /invoices/{id}`, `POST /invoice`, `POST /invoice/generate` | invoicing exists end-to-end with no triggering UI | DISC-016, RA-20 |
| `GET /payment-orders`, `GET /payment-orders/{id}` | order ledger invisible | DISC-016, RA-20 |
| `GET /platform/payment-webhooks`, `POST /platform/payment-webhooks/{id}/replay` | reconciliation invisible and unreplayable | DISC-016, RA-20 |
| `GET /platform/security-events` | the feed the fabricated security panel pretends to render | DISC-014 |
| `GET/POST /platform/operators`, `POST /platform/operators/{id}/revoke-sessions` | operator governance; fabricated in UI | DISC-014 |
| `GET/POST/PATCH/DELETE /platform/announcements` | announcement publishing; fabricated in UI | DISC-014 |
| `POST /admin/employer-applications/{id}/verify`, `GET /admin/employer-applications` | company verification (write exists, read is mocked) | DISC-014 |
| `GET/PATCH /platform/tenants/{id}`, `POST /platform/tenants/{id}/decommission`, `POST /platform/tenants/garbage-collect` | platform tenant lifecycle | DISC-016, RA-20 |
| `GET /public/jobs/{id}/og.png`, `GET /public/blog/{id}/og.png`, `GET /public/featured-companies`, `GET /trusted-by.json`, `GET /custom-pages.json` | SEO/social surface already implemented server-side | DISC-017 |
| `GET /admin/settings/modules`, `GET /admin/settings` (UNVERIFIED) | the settings surface most likely to hide feature-flag wiring | R7 |

Full enumeration: `Evidence/artifacts/backend-operations.tsv` (columns: `op_id, method, path,
reachability, rule, reason, modern_refs, legacy_refs, test_refs, defined_in`).

## 7. The ten `UNVERIFIED` operations

| Operation | Rule | Why undecidable |
|---|---|---|
| `GET /admin/employer-applications` | R7 | no direct call site, but a child path (/admin/employer-applications/{X}/verify) is called from modern code; parent reachability not determinable statically |
| `PATCH /admin/employer-applications/{X}` | R7 | no direct call site, but a child path (/admin/employer-applications/{X}/verify) is called from modern code; parent reachability not determinable statically |
| `GET /admin/jobs` | R7 | no direct call site, but a child path (/admin/jobs/{X}/moderate) is called from modern code; parent reachability not determinable statically |
| `DELETE /admin/jobs/{X}` | R7 | no direct call site, but a child path (/admin/jobs/{X}/moderate) is called from modern code; parent reachability not determinable statically |
| `PATCH /admin/jobs/{X}` | R7 | no direct call site, but a child path (/admin/jobs/{X}/moderate) is called from modern code; parent reachability not determinable statically |
| `GET /admin/settings` | R7 | no direct call site, but a child path (/admin/settings/modules) is called from modern code; parent reachability not determinable statically |
| `POST /admin/users/bulk` | R7 | a shape-compatible call (/admin/users/{X} in frontend/src/components/admin/AdminUsersTab.tsx) may construct this path at runtime |
| `GET /enterprise/usage/ai` | R7 | no direct call site, but a child path (/enterprise/usage/ai/events) is called from modern code; parent reachability not determinable statically |
| `GET /public/geo/regions` | R7 | no direct call site, but a child path (/public/geo/regions/{X}/{X}) is called from modern code; parent reachability not determinable statically |
| `GET /resumes/public/{X}` | R7 | a shape-compatible call (/resumes/{X}/publication in frontend/src/lib/share-publication.ts) may construct this path at runtime |

They are **not** counted as reachable and **not** counted as unreachable. Two of them
(`/admin/jobs/{X}` and `/admin/employer-applications/{X}`) are undecidable only because a *non-existent*
child path is called (DISC-025): if that call were removed the parent would be plain `UNREACHABLE`.
Closure: instrument a running build (network capture) and read the parent calls in
`AdminSettingsTab`, `AdminModerationTab` and `AdminUsersTab` at runtime.

## 8. Limitations

- **Static only.** Paths built entirely from variables (`${base}/${id}` where `base` is data) are
  invisible; the `UNVERIFIED` class exists precisely to absorb that ambiguity, and prefix matching is
  restricted to a dynamic `{X}` segment to avoid false positives.
- **Database operations are not in this denominator.** 57 migration files and the query builders are
  counted in `DATABASE-INVENTORY.md`; mixing them into the route denominator would make the percentage
  meaningless.
- **`SERVER-ONLY` is under-detected**, not over-detected: module reuse is found via
  `require('../routes/…')`, but a handler invoked through a service factory would not be seen.
- Reachability is a property of the *repository at `0adad00d`*, not of the deployed system.
  **Correction (V4):** an earlier draft of this section asserted that "the deployed system runs a
  different frontend entirely". That is withdrawn. Evidence: every root npm script delegates to
  `--prefix frontend` (`package.json` scripts `dev`/`build`/`lint`/`preview`); `frontend`'s `build`
  runs `tsc -b && vite build && node ../scripts/sync-dist.mjs`; `sync-dist.mjs` copies `frontend/dist`
  into the Apache DocumentRoot `dist/` (its header documents the boundary checks). `dist/` is **not
  committed** (`git ls-tree -r HEAD | grep -c '^dist/'` → 0) and is absent from the working tree, so
  the served bundle cannot be inspected here and **build freshness is unverifiable** — that is the
  real limitation, not a different frontend. Root `src/` is not referenced by any build or deploy
  script; it survives as source-of-record and as the subject of the parity comparison.

## 9. Per-operation rationale for all 176 `UNREACHABLE` operations

Mandate 5 (e) requires a rationale per unreachable operation and a distinction between "no call site"
and "orphaned". The `reason` column below is the classifier's own machine-readable output; the `legacy`
column records whether the *legacy* tree called the operation, which separates a **regression**
(legacy used it, modern does not) from a **latent / never-exposed** operation.

| Operation | Rule | Legacy called it | Reason |
|---|---|---|---|
| `GET /admin/ads` | R6 | no | called only by tests, never by a client |
| `POST /admin/ads` | R6 | no | called only by tests, never by a client |
| `DELETE /admin/ads/{X}` | R6 | no | called only by tests, never by a client |
| `GET /admin/ai-fleet-health` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/ai/entitlements` | R6 | no | called only by tests, never by a client |
| `ALL /admin/ai/fetch-models` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /admin/ai/quota-limits` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /admin/ai/reset-state` | R6 | no | called only by tests, never by a client |
| `GET /admin/ai/routing-telemetry` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/audit-logs` | R2 | no | only dead hook(s) useAdminAuditLogs call it — 0 consumers |
| `GET /admin/audit-logs/stats` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /admin/audit-logs/{X}` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /admin/blog/categories` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/blog/categories` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /admin/blog/categories/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/blog/categories/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/blog/posts` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /admin/blog/posts/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/blog/posts/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/blog/publish-due` | R6 | no | called only by tests, never by a client |
| `GET /admin/companies` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/companies/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/coupons` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/coupons` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /admin/coupons/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/coupons/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PUT /admin/coupons/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/database-settings` | R6 | no | called only by tests, never by a client |
| `POST /admin/database-settings` | R6 | no | called only by tests, never by a client |
| `GET /admin/database-settings/conflicts` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/database-settings/dead-letter` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/database-settings/initialize-schema` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/database-settings/prune-outbox` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/database-settings/retry-dead-letter` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/database-settings/sync-status` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/database-settings/test-connection` | R6 | no | called only by tests, never by a client |
| `POST /admin/delete-user` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/health-summary` | R6 | no | mentioned only as display metadata in modern code; never called |
| `GET /admin/operations/feature-flags` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/operations/feature-flags/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PUT /admin/operations/feature-flags/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/pages` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /admin/pages/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PUT /admin/pages/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/payment-orders` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/payments/refund` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/platform/currency` | R6 | no | called only by tests, never by a client |
| `PUT /admin/platform/currency` | R6 | no | called only by tests, never by a client |
| `GET /admin/platform/status` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/platform/tenants/{X}/ai-keys/test` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/platform/tenants/{X}/ai-policy` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/platform/tenants/{X}/commercials` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/platform/tenants/{X}/members` | R6 | no | called only by tests, never by a client |
| `DELETE /admin/platform/tenants/{X}/members/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/platform/tenants/{X}/members/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/reviews` | R6 | no | called only by tests, never by a client |
| `POST /admin/reviews` | R6 | no | called only by tests, never by a client |
| `DELETE /admin/reviews/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/subscriptions` | R6 | no | called only by tests, never by a client |
| `POST /admin/subscriptions/{X}/reconcile` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/trusted-by` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/trusted-by` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /admin/trusted-by/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /admin/trusted-by/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/twilio-settings` | R6 | no | called only by tests, never by a client |
| `POST /admin/twilio-settings` | R6 | no | called only by tests, never by a client |
| `DELETE /admin/users/{X}/ai-entitlement` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/users/{X}/ai-entitlement` | R6 | no | no call site anywhere outside its defining route file |
| `PUT /admin/users/{X}/ai-entitlement` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/users/{X}/ai-quota-reset` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/users/{X}/audit` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/users/{X}/details` | R6 | no | no call site anywhere outside its defining route file |
| `GET /admin/users/{X}/export` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/users/{X}/password-reset` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/users/{X}/tenants` | R6 | no | called only by tests, never by a client |
| `DELETE /admin/users/{X}/tenants/{X}` | R6 | no | called only by tests, never by a client |
| `POST /admin/users/{X}/unenroll-mfa` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/users/{X}/verify-email` | R6 | no | no call site anywhere outside its defining route file |
| `POST /admin/website-meta` | R6 | no | no call site anywhere outside its defining route file |
| `POST /auth/custom-password-reset` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /auth/github` | R6 | no | no call site anywhere outside its defining route file |
| `GET /auth/github/test-credentials` | R6 | no | no call site anywhere outside its defining route file |
| `GET /auth/linkedin` | R6 | no | no call site anywhere outside its defining route file |
| `GET /auth/linkedin/test-credentials` | R6 | no | called only by tests, never by a client |
| `POST /auth/oauth/exchange` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /auth/purge-orphaned-auth` | R6 | no | no call site anywhere outside its defining route file |
| `POST /auth/send-verification-email` | R6 | yes | legacy UI called it in 3 file(s); no modern client does |
| `POST /auth/set-user-password` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /auth/verify-email-token` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /blog-data` | R6 | no | called only by tests, never by a client |
| `GET /blog-data/categories` | R6 | no | no call site anywhere outside its defining route file |
| `GET /blog-data/slug/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `DELETE /blog-data/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /blog-data/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /blog-data/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /check` | R6 | no | called only by tests, never by a client |
| `POST /contact` | R6 | no | called only by tests, never by a client |
| `GET /coupons/active` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /coupons/validate` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /employer-applications` | R6 | no | mentioned only as display metadata in modern code; never called |
| `POST /enterprise/ai/generate-content` | R6 | no | called only by tests, never by a client |
| `POST /enterprise/ai/generate-interview` | R6 | no | called only by tests, never by a client |
| `POST /enterprise/lifecycle/suspend` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /enterprise/queue/jobs` | R6 | no | called only by tests, never by a client |
| `POST /enterprise/queue/jobs` | R6 | no | called only by tests, never by a client |
| `POST /enterprise/storage/token` | R6 | no | no call site anywhere outside its defining route file |
| `POST /enterprise/storage/verify` | R6 | no | no call site anywhere outside its defining route file |
| `GET /enterprise/support/context` | R6 | no | called only by tests, never by a client |
| `GET /enterprise/teams/{X}/members` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /enterprise/teams/{X}/members` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `DELETE /enterprise/teams/{X}/members/{X}` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /enterprise/tenants/{X}/reactivate` | R6 | no | called only by tests, never by a client |
| `GET /enterprise/workspaces/{X}/members` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /enterprise/workspaces/{X}/members` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `DELETE /enterprise/workspaces/{X}/members/{X}` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `POST /export` | R6 | no | called only by tests, never by a client |
| `GET /favourites/{X}/check` | R6 | no | called only by tests, never by a client |
| `GET /health/databases` | R6 | no | no call site anywhere outside its defining route file |
| `POST /invoice` | R6 | no | mentioned only as display metadata in modern code; never called |
| `POST /invoice/generate` | R6 | no | no call site anywhere outside its defining route file |
| `GET /invoices` | R6 | no | mentioned only as display metadata in modern code; never called |
| `GET /invoices/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /jobs/naukri` | R6 | no | called only by tests, never by a client |
| `GET /linkedin-scraper` | R6 | no | no call site anywhere outside its defining route file |
| `GET /notifications-data/contact/list` | R6 | no | called only by tests, never by a client |
| `POST /notify/user-signup` | R6 | no | called only by tests, never by a client |
| `GET /payment-orders` | R6 | no | no call site anywhere outside its defining route file |
| `GET /payment-orders/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /payment/razorpay-order` | R6 | no | called only by tests, never by a client |
| `GET /phrases` | R6 | no | called only by tests, never by a client |
| `POST /phrases` | R6 | no | called only by tests, never by a client |
| `DELETE /phrases/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /phrases/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/announcements` | R6 | no | called only by tests, never by a client |
| `POST /platform/announcements` | R6 | no | called only by tests, never by a client |
| `DELETE /platform/announcements/{X}` | R6 | no | called only by tests, never by a client |
| `PATCH /platform/announcements/{X}` | R6 | no | called only by tests, never by a client |
| `GET /platform/attention` | R6 | no | called only by tests, never by a client |
| `GET /platform/backup-status` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/command-center` | R6 | no | called only by tests, never by a client |
| `GET /platform/configuration` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /platform/encryption` | R6 | no | called only by tests, never by a client |
| `GET /platform/enterprise-queue` | R6 | no | called only by tests, never by a client |
| `GET /platform/feature-flags` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `PUT /platform/feature-flags/{X}` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /platform/health` | R6 | no | called only by tests, never by a client |
| `GET /platform/health-indicator` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/maintenance` | R6 | no | called only by tests, never by a client |
| `POST /platform/maintenance` | R6 | no | called only by tests, never by a client |
| `GET /platform/observability` | R6 | no | called only by tests, never by a client |
| `GET /platform/operational-status/api-matrix` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/operators` | R6 | no | called only by tests, never by a client |
| `POST /platform/operators` | R6 | no | called only by tests, never by a client |
| `POST /platform/operators/{X}/revoke-sessions` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/overview` | R6 | no | called only by tests, never by a client |
| `GET /platform/payment-settings` | R6 | no | called only by tests, never by a client |
| `GET /platform/payment-webhooks` | R6 | no | called only by tests, never by a client |
| `POST /platform/payment-webhooks/{X}/replay` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/payments-health` | R6 | no | no call site anywhere outside its defining route file |
| `POST /platform/queues/purge` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /platform/search` | R6 | no | called only by tests, never by a client |
| `GET /platform/security-events` | R6 | no | called only by tests, never by a client |
| `POST /platform/tenants/garbage-collect` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/tenants/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `PATCH /platform/tenants/{X}` | R6 | no | no call site anywhere outside its defining route file |
| `POST /platform/tenants/{X}/decommission` | R6 | no | no call site anywhere outside its defining route file |
| `GET /platform/version` | R6 | no | called only by tests, never by a client |
| `POST /public-export` | R6 | no | called only by tests, never by a client |
| `POST /public-export-docx` | R6 | no | no call site anywhere outside its defining route file |
| `GET /reviews` | R6 | no | mentioned only as display metadata in modern code; never called |
| `GET /rtl-font-config` | R6 | no | called only by tests, never by a client |
| `POST /send-sms` | R6 | no | mentioned only as display metadata in modern code; never called |
| `GET /service-availability` | R6 | yes | legacy UI called it in 1 file(s); no modern client does |
| `GET /stats` | R6 | no | called only by tests, never by a client |
| `POST /stats/increment` | R6 | no | called only by tests, never by a client |
| `POST /subscription/preferences` | R6 | no | no call site anywhere outside its defining route file |

## 10. Client calls with no served operation (DISC-025)

This register asks "is this operation called?". The converse question — "is this call served?" — was not
asked until Mandate 5, and it changes the picture: 30 of 229 call sites (13.1 %) target a path that no
registered operation serves. Full table: `DISCREPANCY-LOG.md` DISC-025 and
`Evidence/artifacts/client-call-existence.json`.

Consequence for reading §9: an `UNREACHABLE` verdict means *no working call site was found*. For
/admin/queues*, /admin/jobs/{X}/moderate*, /blog-data*, /coupons* and /admin/audit-logs* the modern UI does
attempt a call, but to a different (non-existent) path — that is a broken integration, not an absent
feature.

## 11. V6 confirmation and the reverse direction (base `a5835ff6`)

V6 re-ran this register rather than trusting it: `tools/backend-reachability.cjs` +
`tools/reachability-crosscheck.cjs` still agree on **385/385** operations, class mix
**152 UI / 7 indirect / 27 external-caller / 11 server-only / 2 intentionally-unexposed / 176 unreachable /
10 unverified**. No class changed in V6.

What V6 added is the *converse* measurement, now automated as check 9 of `tools/parity-depth-checks.cjs`:
**27 client call sites over 17 distinct paths invoke operations that do not exist.** That is a different
failure mode from "operation with no caller" and it is invisible to this register by construction:

| Direction | Question | Instrument | V6 result |
|---|---|---|---|
| Backend → UI | does anything call this operation? | this register (7 classes) | 176 UNREACHABLE / 385 (45.7 %) |
| UI → backend | is this call served by an operation? | `parity-depth-checks.cjs` check 9 | 27 defective sites / 229 (11.8 %) |

Both are needed. An operation can be unreachable while every client call resolves (dead feature), and a
client call can be broken while the operation it "wants" exists under another prefix (mismatch). The
second is what DISC-027 records: `/blog/posts*` vs `/admin/blog/posts*`, `/platform/status` vs
`/admin/platform/status`, `/billing/validate-coupon` vs `/coupons/validate`, plus 13 paths with no
counterpart at all (support tickets, DLQ purge/retry, operations backup/cache-clear, user status,
`/notify/email`).

**Limitation carried forward:** the 10 `UNVERIFIED` operations are ambiguous because a *child* path is
called from modern code. Two of those child paths are themselves dead (`/admin/jobs/{X}/moderate`), so
"ambiguous parent" must not be read as "reachable parent" (§7).
