# Enterprise Local Infrastructure Handoff — Zero-External-Infrastructure Edition

**Status:** LOCAL VERIFIED (repository test matrix — 125/125, no skips) / PRODUCTION DEPLOYMENT PENDING LOCAL OPERATOR  
**Branch:** `arena/01a0200e-resumepilotai`  
**Architecture:** Firebase-only. **No PostgreSQL, no Redis, no RabbitMQ/Kafka/SQS, no external KMS.** These are not "optional but off" — the code, dependencies, and configuration for them were deleted from the repository.

This document is for the local senior developer with direct Hostinger, Firebase,
and DNS access. Everything below is exact and complete.

---

## 0. What the application requires (the complete list)

1. **Hostinger Node.js hosting** — one Node process (PM2-managed).
2. **Firebase project** — Auth, Firestore, (optional) Storage.
3. **Six server-side secrets** (below). Nothing else.

## 1. Exact deployment package

### 1.1 Code

```bash
git fetch --all --tags --prune
git checkout arena/01a0200e-resumepilotai
git reset --hard <FINAL_COMMIT_SHA>        # SHA from the delivery report
cd backend && npm ci --omit=dev            # no pg / ioredis / pglite in the tree
cd .. && npm ci --omit=dev
npm run build                              # frontend (set VITE flag first, §1.4)
```

### 1.2 Firebase console

- [ ] Auth: enable Email/Password (+ any desired providers).
- [ ] Firestore: create in production mode, region closest to Hostinger
      (e.g. `asia-south1`).
- [ ] Storage (only if artifact uploads/downloads are used): enable, note bucket.
- [ ] Service account: `IAM & Admin → Service Accounts → Create` with role
      **Firebase Admin**; export JSON key OR use its `client_email` +
      `private_key` in env vars.

### 1.3 Firestore rules + indexes (required before first request)

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
# firebase.json maps: rules → SecurityRules.txt, indexes → firestore.indexes.json
```

Verify in console → Firestore → Rules that the final block denies all client
access to `tenants/{tenantId}/{document=**}` and every `enterprise_*`
collection. The new composite indexes (`resources`, `enterprise_outbox`)
must show "Enabled".

### 1.4 Environment + PM2

Copy `ecosystem.config.js` (repository root), fill the `env` block:

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` / `FIREBASE_DATABASE_URL` | your project |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | service-account credentials |
| `ENTERPRISE_TENANCY_ENABLED` | `true` |
| `ENTERPRISE_ENCRYPTION_KEYS` | `{"v1":"<openssl rand -base64 32>"}` — **back this up**; losing it makes encrypted resources unreadable |
| `TENANT_JOB_SIGNING_SECRET` | `openssl rand -base64 32` |
| `TENANT_ARTIFACT_SIGNING_SECRET` | `openssl rand -base64 32` |
| `ENTERPRISE_OUTBOX_WORKER_ENABLED` | `true` (this instance runs the durable worker) |
| `NOTIFICATION_OUTBOX_WORKER_ENABLED` | `true` (email delivery worker) |

```bash
pm2 start ecosystem.config.js --env production
pm2 save
```

Frontend build flag: `VITE_ENTERPRISE_TENANCY_ENABLED=true npm run build`.

**Key rotation (documented, in-place):** add `v2` to
`ENTERPRISE_ENCRYPTION_KEYS`, set `ENTERPRISE_ENCRYPTION_ACTIVE_KEY=v2`, keep
`v1` until old documents are rewritten. Never log or commit these values.

### 1.5 Health / readiness / smoke (exact commands)

```bash
# Liveness + Firebase Admin readiness (expect 200, status ready)
curl -fsS https://<your-domain>/api/readyz | jq .

# Startup architecture statement (PM2 logs — expect dataProvider firestore,
# queue Firestore Durable Outbox, encryption ServerKey)
pm2 logs resumepilot-backend --lines 50 --nostream | grep 'Enterprise Architecture'
```

Signed-in browser smoke (15 minutes, all read/write):
- [ ] `/enterprise` loads; tenant auto-provisions; banner shows the org.
- [ ] Overview: **Firestore Data Plane — Operational** and **Durable Job
      Outbox — Operational** panels (there is no cache panel; none exists).
- [ ] Workspaces: create "APAC Operations" → appears; switch into it.
- [ ] Users: invite a member → role change → remove (re-login as them to
      verify denial).
- [ ] Teams: create; Resumes: create + duplicate + delete a document.
- [ ] AI: save the provider allowlist; Usage: numbers appear after a
      generation; Audit: every action above is present.
- [ ] Security: create a service account (copy the one-time key), test
      `GET /api/enterprise/m2m/context` with `X-API-Key` → then revoke →
      expect 401. Durable Jobs panel: filter by status, replay a DLQ job.
- [ ] Settings: configuration saves with revision conflict protection.

### 1.6 Backup / restore (operator-owned)

- [ ] Enable **scheduled Firestore exports** to a GCS bucket:
      https://cloud.google.com/firestore/docs/manage-data-schedule-exports
- [ ] Run one restore drill in a staging project before relying on it.
- [ ] In-app tenant-scoped snapshots (`backend/enterprise/enterpriseBackup.js`)
      are available for tenant portability drills; they do not replace the
      scheduled project export.

### 1.7 Rollback procedure

1. `pm2 stop resumepilot-backend`
2. `git checkout <previous-known-good-tag> && git reset --hard && cd backend && npm ci --omit=dev && cd .. && npm ci --omit=dev && npm run build`
3. `pm2 start ecosystem.config.js --env production`
4. If Firestore rules/indexes were changed by the release:
   `firebase deploy --only firestore:rules,firestore:indexes` from the old tag.
5. Data: all enterprise state lives in Firestore; restoring the previous
   scheduled export (GCS) is the data-level rollback. There is no database
   server to roll back — that is the point of the architecture.

---

## 2. Verified in-repository (re-runnable)

| Suite | Command | Result at handoff |
|---|---|---|
| Enterprise (all) | `npm run test:enterprise` | **125/125, 0 skipped** — no external service exists to skip |
| Security | `npm run test:security` | 0 failures |
| Interview coach | `npm run test:interview` | 28/28 |
| Product (templates, DOCX, portfolio, payments, i18n…) | `npm run test:product` | 0 failures |
| Legacy backend | `npm --prefix backend test` | all pass |
| Build / lint / prod audit | `npm run build && npm run lint && npm run audit:production` | pass / 0 errors / 0 vulnerabilities |
| Browser workflow | `npm run test:enterprise:browser` | runs locally with `npx playwright install chromium`; skips loudly in sandboxes without the binary |

Coverage highlights: tenant/workspace isolation (IDOR/BOLA/spoof), RBAC +
escalation, suspended tenant / revoked membership / revoked service account /
expired support grant denial, AI quota + cross-tenant isolation, durable
outbox (idempotency, crash/lease recovery, tamper, expiry, DLQ, replay),
encryption (rotation, fail-closed), backup/restore + migration drills,
load/concurrency, store-outage fail-closed chaos, and the zero-infrastructure
architecture assertions (no pg/ioredis modules, deps, env wiring, or routes).

## 3. Known limitations (truthful)

- **External penetration testing: PENDING** — no independent security firm engaged.
- **Production verification: PENDING** — this handoff is the checklist that closes it.
- Managed KMS is an explicit not-implemented extension slot; the deployed
  provider is server-side AES-256-GCM envelope encryption with versioned keys.
- `s3`/`r2` storage providers are not-implemented slots; Firebase Storage works.
- OIDC/SCIM policies are stored/displayed; SSO login flows are not implemented.
- Browser tests need a local Chromium binary; they never fabricate results.
