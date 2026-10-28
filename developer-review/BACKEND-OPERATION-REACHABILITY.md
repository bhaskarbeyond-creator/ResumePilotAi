# Backend Operation Reachability Register

**Authoritative revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (branch `arena/393531fe-resumepilotai`; `origin/main` = same; `origin/dev` = `ea7b7416…`, tree-identical)
**Generator:** `developer-review/tools/backend-reachability.cjs`
**Machine-readable register:** `Evidence/artifacts/backend-reachability.json` (384 records),
`Evidence/artifacts/backend-operations.tsv` (tabular), `Evidence/logs/backend-reachability.log`
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
| Route **registrations** (`router.<verb>(…)` / `app.<verb>(…)` call sites) | **498** | regex over `backend/routes/*.js` + `backend/index.js`, mount-prefix expanded |
| Unique **METHOD + path** pairs after mount resolution and de-duplication | **384** | this is the operation register denominator |
| Duplicate/overlapping registrations collapsed | **114** | 498 − 384 (same method+path declared twice, e.g. index.js + a router) |
| Handlers | **384** | 1 inline handler per unique operation; no shared handler serves two paths |
| Database operations | **not counted** | not enumerable from route declarations; see `DATABASE-INVENTORY.md` and §8 |

Mount prefixes were resolved for all 384 operations (0 unresolved). `backend/index.js` is CommonJS with
destructured `require`, so imports are resolved from `const { x } = require('./routes/y')` and
`const x = require('./routes/y')` as well as ESM `import`.

## 3. Classification rules (first match wins, deterministic)

| Rule | Class | Condition |
|---|---|---|
| R1 | `UI-REACHABLE` | A **call site** exists in `frontend/src` other than the dead-hook file. A file that only *registers* the route is never a caller. |
| R2 | `INDIRECTLY-REACHABLE` | Called only from `hooks/use-api-hooks.ts`, and the hook(s) that call it have ≥1 consumer in `frontend/src`. |
| R2′ | `UNREACHABLE` | Called only from that file, and every hook that calls it has **0 consumers**. |
| R7 | `UNVERIFIED` | No direct call site, but a *child* path is called from modern code — static analysis cannot decide parent reachability. |
| R3 | `EXTERNAL-CALLER` | Provider webhook/callback, OAuth redirect, payment verifier, M2M API, agent/LLM `v1` API, OG-image generator, health probe, public JSON feed. |
| R5 | `INTENTIONALLY-UNEXPOSED` | Machine/service-account scoped route (`m2m`, `service-account`, `support-grant`). |
| R4 | `SERVER-ONLY` | Called by backend code (HTTP self-call) or its router module is required and invoked in-process by another backend module. `backend/services/platformHealth.js` is excluded — it enumerates routers for existence probes and does not invoke handlers. |
| R6 | `UNREACHABLE` | No caller of any kind: no UI call site, no external caller, no server reuse, no machine scope. Tests are **not** callers. |

## 4. Result

| Reachability class | Operations | % of 384 |
|---|---:|---:|
| `UI-REACHABLE` | **126** | 32.8 % |
| `INDIRECTLY-REACHABLE` | **6** | 1.6 % |
| `EXTERNAL-CALLER` | **27** | 7.0 % |
| `SERVER-ONLY` | **11** | 2.9 % |
| `INTENTIONALLY-UNEXPOSED` | **9** | 2.3 % |
| `UNREACHABLE` | **201** | 52.3 % |
| `UNVERIFIED` | **4** | 1.0 % |
| **Total** | **384** | 100 % |

Derived measures, each with its own denominator:

| Measure | Numerator / denominator | Value |
|---|---|---:|
| Operations with a live modern call path (UI + indirect) | 132 / 384 | **34.4 %** |
| Operations with **no** modern UI call site | 250 / 384 | **65.1 %** |
| Operations unreachable from *any* client, after accounting for webhooks, server reuse and machine scope | 201 / 384 | **52.3 %** |
| Operations never referenced by **either** frontend (modern or legacy) | 183 / 384 | **47.7 %** |
| Operations the legacy UI called that no modern client calls | 67 / 384 | **17.4 %** |

## 5. Reconciliation with the previously reported figures

| Reported (2026-10-29) | V4 revalidated | Explanation |
|---|---|---|
| 384 unique operations | **384 confirmed** | Same denominator; mount resolution now complete (0 unresolved). |
| 192 "unreachable from modern UI" | **250 with no modern UI call site; 201 unreachable from any client** | The 192 counted dead-hook references as reachable (−67) and counted external callers/server reuse as unreachable (+27 external, +11 server, +9 machine-scoped, +4 unverified). The two errors partially offset, which is why 192 looked plausible. |
| 58 "completely orphaned" | **183 never referenced by either frontend** | The old rule treated *any* string mention (including in tests and in the health-tab display table) plus loose prefix matches as a caller. |
| — | **27 `EXTERNAL-CALLER`** | Not previously represented at all: these are legitimate provider webhooks and health probes, not missing UI. |
| — | **9 `INTENTIONALLY-UNEXPOSED`** | Machine-scoped routes that should never have a browser caller. |

**Net effect on the audit's conclusion:** the backend is *more* undrivable than previously reported
(52.3 % vs 50 %), and the "orphan" figure was overstated in the opposite direction for a different
reason (string mentions). Both corrections are disclosed rather than smoothed; the earlier numbers stay
in the record (`DISCREPANCY-LOG.md` DISC-016 carries a supersession note).

## 6. Unreachable operations by area (201)

| Prefix | Unreachable operations |
|---|---:|
| `/admin` | 66 |
| `/enterprise` | 54 |
| `/platform` | 34 |
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

Split by provenance: **57** operations were called by the legacy UI and are not called by any modern
client (regressions); **144** have never been called by any client in either tree (latent or
server-to-server features awaiting a UI).

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

## 7. The four `UNVERIFIED` operations

| Operation | Why undecidable |
|---|---|
| `GET /admin/employer-applications` | only a child (`/verify`) is called; the list may or may not be fetched via a path built at runtime |
| `GET /admin/jobs` | same pattern (`/moderate` child called) |
| `GET /admin/settings` | child `/admin/settings/modules` is called; parent not resolvable |
| `GET /public/geo/regions` | child `/public/geo/regions/{…}` called |

They are **not** counted as reachable and **not** counted as unreachable. Closure: instrument a running
build (network capture) or read the parent calls in `AdminSettingsTab`/`AdminModerationTab` at runtime.

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
