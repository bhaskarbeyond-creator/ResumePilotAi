# DIR-037 — RECONNAISSANCE FINDINGS (PLAN MODE — no code written)

**Status:** `DIR-037 = CANCELLED` in the bridge (2026-10-05T02:29:05.745Z,
`lastTransitionReason = "User requested reset all issued directives"`).
The whole DIR-027..DIR-045 batch was cancelled. Plan submission is blocked by a
legal-transition guard (`CANCELLED -> PLAN_SUBMITTED` is rejected). Blocker
escalated as `QUESTION_ASKED evt_muun9m99_0ae2b00a4296`.

This document preserves the reconnaissance so it is not lost if the directive is
re-issued. **Nothing here has been implemented.**

---

## Headline

Much of the surface DIR-037 asks for **already exists** and must be *extended*,
not rebuilt. Building it greenfield would duplicate shipped, certified behaviour.

---

## What already exists (reuse, do not replace)

| Capability | Location | State |
|---|---|---|
| Correlation ID | `backend/index.js:292-300` | Mints/resumes `X-Request-Id` on **every** request; validates inbound `^[A-Za-z0-9._-]{1,80}$`, else `cryptoRandom.randomUUID()`; sets `res.locals.requestId`; echoes header |
| Latency percentiles | `backend/enterprise/tenantObservability.js` | Real measured `p50/p95/p99` + error classes, ring-buffered, 15-min durable flush |
| Durable rollup table | `enterprise_observability_rollups` (`001_baseline.sql:989-1003`) | Live; p50/p95/p99 columns exist |
| `/health`, `/healthz`, `/readyz`, `/health/databases` | `backend/index.js:4459-4538` | Unauthenticated (`publicApiPaths`, `index.js:388-404`); `/readyz` honestly 503s on DB outage |
| Observability API | `backend/routes/platform.js:860-874` | `GET /api/platform/observability` |
| SuperAdmin gates | `backend/security/auth.js:195-263` | `requireSuperAdmin` + `requireRecentAdminAuthentication` (auth_time freshness + MFA) |
| Error boundary | `src/components/common/RouteErrorBoundary.jsx` | Wraps all routes (`main.jsx:525-606`); reload + return CTAs |
| Secret redaction | `routingTelemetry.js:21-35` | `SECRET_PATTERNS` + `redactSecrets()` |
| PII key filter | `src/utils/ga4.js:68-80` | `forbiddenKey` + email-shape filters |
| RBAC policy map | `backend/security/policy.js:54-68` | `/platform/observability -> security.read` |
| Migration framework | `backend/database/migrationRunner.js` | Ledger + checksums + `.down.sql` convention; next version `025` |
| Favourable CSP | `.htaccess:9` | `connect-src 'self'` already permits same-origin beacons |

## Real gaps found

1. **`recordRequest()` is wired only to enterprise routes**
   (`backend/routes/enterprise.js:87-103`). Therefore
   `/api/platform/observability` reports percentiles for **enterprise routes
   only** — it is not platform-wide. This is the single most important finding.

2. **No W3C `traceparent`.** Correlation IDs exist but are not propagated into
   MariaDB / AI-provider / payment spans.

3. **`/api/platform/health` cannot meet <20ms** (`platform.js:263` →
   `buildHealthPayload` at `:136-223`): it runs `SELECT 1`, Firebase
   `admin.auth().listUsers(1)`, and two outbox `GROUP BY` queries per request.

4. **`web-vitals@4.2.4` and `@opentelemetry/api@1.9.1` are in `node_modules` but
   are TRANSITIVE ONLY** — pulled by `@firebase/performance` and `firebase-tools`.
   **Neither is declared in `package.json` or `backend/package.json`.** A clean
   install / pruned build would fail to resolve them. They must be promoted to
   declared dependencies.

5. **No charting library exists anywhere** in the dependency tree. Every chart
   must be hand-rolled accessible SVG (also keeps deps frozen).

6. **`RouteErrorBoundary` violates the Cuba standard** — it uses raw
   `slate-900`/`indigo-600` utilities rather than `cuba-*` / `--cuba-*` tokens.

## Escalations requiring a decision

- **(a) Build budget already exceeded.** `npm run build` measured at
  **4.36s (vite-reported) / 5.68s (wall)** — over the `<4.0s` bar *before* any
  DIR-037 change. Which number is authoritative?
- **(b) Dependency promotion.** Declaring `web-vitals` / `@opentelemetry/api`
  changes `package.json` + `package-lock.json`. Approve?
- **(c) Redis hit rate is NOT APPLICABLE.** This codebase has **no Redis**;
  MariaDB is the sole authoritative store (confirmed in `.env.example` and
  `platformHealth.js`). Per the zero-fabrication invariant this would be
  reported as explicitly `NOT_APPLICABLE`, never as a fabricated hit rate.

## Baseline state at reconnaissance time

- Freeze baseline `e314f715`: `git diff` over `src/cv-templates`,
  `TemplateRenderer.jsx`, `atsScore.js` = **empty (0 diff)** — FROZEN surfaces intact.
- `git status --porcelain`: 27 entries, **all** under `.bridge/` and
  `.agents/` — **zero product source modified**.
- `tests/e2e/dir-037.spec.js`: does not exist.