# Enterprise Local Infrastructure Handoff

**Status:** LOCAL VERIFIED (repository test matrix) / PRODUCTION DEPLOYMENT PENDING LOCAL OPERATOR  
**Repository branch:** `arena/01a0200e-resumepilotai` (this session's branch; based on the enterprise work from `806113bb`)  
**Date:** 2026-08-20

This document is for the local senior developer with direct Hostinger, Firebase,
and DNS access. It describes what the application now requires, what it no
longer requires, and the exact deployment actions that remain yours.

---

## 0. Truthful architecture summary (what changed and why)

The enterprise plane was refactored so the application runs correctly on
**Hostinger + Firebase alone**. Nothing below is aspirational — every claim is
backed by tests in this repository.

### What is NO LONGER required

| Previously required | Now |
|---|---|
| PostgreSQL (`TENANT_DATABASE_URL`) + RLS for tenant resources | **Not required.** Firestore is the canonical data plane. PostgreSQL remains an opt-in legacy adapter (`ENTERPRISE_DATA_PROVIDER=postgres`). |
| Redis for rate limiting / caching | **Not required.** Redis is an optional accelerator; quotas/limits use durable Firestore atomic counters. Absence is reported honestly and never weakens correctness. |
| Local in-process queue (`EnterpriseQueueWorkerEngine`) | **Deleted.** Durable jobs use the Firestore-backed enterprise outbox (lease claiming, retries, DLQ, replay). |
| (Implied) external KMS | Never existed; now there is an explicit provider abstraction. The implemented provider is server-side envelope encryption (AES-256-GCM, versioned keys). The `kms` slot fails loudly as "not implemented" — no KMS is claimed. |

### What IS required (production)

1. Firebase project with **Auth**, **Firestore**, (optionally) **Storage**.
2. Backend env (server-only, never `VITE_`-prefixed):
   - `ENTERPRISE_TENANCY_ENABLED=true` and `VITE_ENTERPRISE_TENANCY_ENABLED=true` at build time
   - `ENTERPRISE_DATA_PROVIDER=firestore` (or unset — it is the default)
   - `ENTERPRISE_ENCRYPTION_KEYS={"v1":"<openssl rand -base64 32>"}` (required; resource writes fail closed without it)
   - `TENANT_JOB_SIGNING_SECRET` (≥32 bytes) and `TENANT_ARTIFACT_SIGNING_SECRET` (≥32 bytes)
   - `ENTERPRISE_OUTBOX_WORKER_ENABLED=true` on the backend instance that should run the job worker
3. Firestore security rules deployed from `SecurityRules.txt` (denies all
   client access to `tenants/**` and `enterprise_*`).
4. Composite indexes deployed from `firestore.indexes.json` (`resources`,
   `enterprise_outbox`).

### Data model deployed (Admin SDK only; clients are deny-all)

Control plane: `enterprise_tenants`, `enterprise_tenant_slugs`,
`enterprise_tenant_configurations`, `enterprise_workspaces`,
`enterprise_memberships`, `enterprise_workspace_memberships`,
`enterprise_teams`, `enterprise_service_accounts`, `enterprise_api_keys`,
`enterprise_support_grants`, `enterprise_principal_tenants`,
`enterprise_quota_buckets`, `enterprise_migration_ledger`,
`enterprise_outbox` (durable jobs + DLQ).

Data plane (tenant-partitioned): `tenants/{tenantId}/resources`,
`tenants/{tenantId}/audit_events`, `tenants/{tenantId}/ai_usage`,
`tenants/{tenantId}/ai_usage_daily`.

Isolation is enforced by three independent layers (partitioned paths,
query-level workspace predicates, read-level scope re-verification) plus
per-request membership resolution. PostgreSQL RLS is no longer part of the
boundary; the optional adapter keeps its own RLS behavior if you ever enable it.

---

## 1. Exact deployment actions (local operator checklist)

### 1.1 Firebase console

- [ ] Enable **Email/Password** (and any SSO providers) in Firebase Auth.
- [ ] Create **Firestore** (production mode) in the region closest to your
      Hostinger datacenter (e.g. `asia-south1`).
- [ ] (If artifact uploads/downloads are used) enable **Storage** and note the
      bucket for `ENTERPRISE_STORAGE_BUCKET`.
- [ ] Create a **service account** for the backend
      (`IAM & Admin → Service Accounts → Firebase Admin` role) and export the
      JSON key, **or** plan to use Hostinger-level env-var credentials
      (`FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`). Prefer ADC/Workload
      Identity if you move to Cloud Run later.

### 1.2 Firestore rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
# rules file: SecurityRules.txt (mapped in firebase.json)
# indexes file: firestore.indexes.json
```

Verify: in the Firebase console → Firestore → Rules, the last blocks must show
`allow read, write: if false;` for `tenants/{tenantId}/{document=**}` and every
`enterprise_*` collection.

### 1.3 Hostinger backend environment

Set (Node app / `.env` on the hosting panel — server-side only):

```
NODE_ENV=production
ENTERPRISE_TENANCY_ENABLED=true
ENTERPRISE_DATA_PROVIDER=firestore
ENTERPRISE_ENCRYPTION_KEYS={"v1":"<openssl rand -base64 32>"}
TENANT_JOB_SIGNING_SECRET=<openssl rand -base64 32>
TENANT_ARTIFACT_SIGNING_SECRET=<openssl rand -base64 32>
ENTERPRISE_OUTBOX_WORKER_ENABLED=true
ENTERPRISE_STORAGE_PROVIDER=firebase-storage
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_DATABASE_URL=<rtdb-url>          # legacy product data
FIREBASE_CLIENT_EMAIL=<sa-email>          # or use ADC
FIREBASE_PRIVATE_KEY=<sa-private-key>
```

Do **not** set `TENANT_DATABASE_URL`, `REDIS_URL`, or `TENANT_REDIS_URL`
unless you deliberately enable the optional adapters.

**Key custody:** back up `ENTERPRISE_ENCRYPTION_KEYS` in your password manager
/ secret store. Losing the active key makes encrypted resources unreadable
(fail closed). To rotate: add `v2`, set `ENTERPRISE_ENCRYPTION_ACTIVE_KEY=v2`,
keep `v1` until documents are rewritten.

### 1.4 Frontend build

```
VITE_ENTERPRISE_TENANCY_ENABLED=true npm run build
```

### 1.5 Post-deploy verification (15 minutes, all read-only)

```bash
curl -s https://<your-domain>/api/readyz | jq .checks.enterprise
# expect: dataProvider=firestore, dataPlaneConfigured=true,
#         encryption=server-key, queue=firestore-durable-outbox,
#         redis=not-configured
```

Then, signed in as a verified admin in the browser:
- [ ] `/enterprise` loads; the startup banner shows the tenant.
- [ ] Overview: "Durable Job Outbox — Operational", "Optional Redis
      Accelerator — Optional · Off".
- [ ] Create + delete a workspace; create a team; create a test resource;
      create + revoke a service account.
- [ ] Usage tab shows real ledger numbers after an AI generation.
- [ ] Audit tab shows every action above.
- [ ] Security → Durable Jobs shows the queue/DLQ and replay works on a
      dead-lettered job (enqueue one via the API if you want to see a DLQ
      entry).

### 1.6 Backup strategy (operator-owned)

- [ ] Enable **scheduled Firestore exports** to a GCS bucket (this is the
      infrastructure-level backup; the in-app logical snapshots in
      `enterpriseBackup.js` are for tenant-scoped drills/verification, not a
      substitute): https://cloud.google.com/firestore/docs/manage-data-schedule-exports
- [ ] Run one restore drill in a staging project before relying on it.

---

## 2. What was verified in-repository (and how you can re-run it)

| Suite | Command | Covers |
|---|---|---|
| Enterprise (all) | `npm run test:enterprise` | 141 tests incl. Firestore isolation, durable outbox/DLQ, encryption, AI metering, backup/restore, migration, architecture truth, full workflow |
| Legacy regression | `npm run test:product && npm run test:interview && npm run test:security` | 51+4 templates, DOCX, wizard, coach, CBT, payments, account isolation |
| Build / lint / audit | `npm run build && npm run lint && npm run audit:production` | 0 errors; 0 production vulnerabilities |
| Browser workflow | `npm run test:enterprise:browser` | full console workflow (needs `npx playwright install chromium`; skips loudly when the binary is absent) |

PostgreSQL/Redis/KMS-absent operation is the *default* tested configuration:
the entire matrix above runs with no PostgreSQL server, no Redis server, and no
KMS in the environment.

## 3. Known limitations (truthful)

- External penetration testing: **PENDING** (no third-party firm engaged).
- The managed-KMS encryption provider is a configuration slot, not an
  implementation. The active provider is server-side envelope encryption.
- `s3`/`r2` storage providers are explicit not-implemented slots; the working
  provider is Firebase Storage.
- OIDC/SCIM identity policies are stored and surfaced but SSO login flows are
  not implemented; issuer-aware worker reauthorization covers Firebase subjects.
- Playwright browser tests require a local chromium binary; CI sandboxes skip
  them with an explicit notice (they never report fake results).
- Firestore scheduled exports (infrastructure backups) are the local
  operator's responsibility per §1.6.

## 4. Rollback

The previous architecture remains available without code changes:
`ENTERPRISE_DATA_PROVIDER=postgres` + `TENANT_DATABASE_URL` re-activates the
RLS adapter for resources/usage. Redis can be attached at any time purely as
an accelerator. The in-memory queue is gone by design; if the Firestore outbox
ever needs to be drained, `enterprise_outbox` documents can be listed and
replayed tenant by tenant through the audited replay API.
