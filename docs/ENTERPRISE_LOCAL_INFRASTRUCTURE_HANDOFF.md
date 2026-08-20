# Enterprise Local Infrastructure Handoff

**Status:** LOCAL VERIFIED / STAGING-INFRA PENDING / PRODUCTION UNVERIFIED  
**Repository branch for this handoff:** `arena/01a01f1c-resumepilotai`  
**Date:** 2026-08-20

This document is for the local senior developer who has direct server, Firebase, DNS, and hosting access.

## 0. Truthful architecture summary

### Canonical control plane
- **Firebase Auth** = identity proof
- **Firestore** = enterprise control plane
  - tenants
  - workspaces
  - memberships
  - tenant configuration
  - service accounts metadata
  - support grants
  - audit/event documents
  - quota counters
- **Realtime Database / legacy Firebase data** = existing consumer product state

### Enterprise resource data plane
- **PostgreSQL is still required for full enterprise resource functionality**.
- The enterprise resume/resource APIs are intentionally **fail-closed** when `TENANT_DATABASE_URL` is missing.
- This is the RLS-backed boundary for:
  - enterprise resources/documents
  - enterprise AI usage ledger
  - strict tenant/workspace row isolation

### Redis
- **Optional**.
- Used only for cache/rate-limit acceleration.
- If Redis is absent, the app reports that honestly and falls back to durable stores for correctness-sensitive paths.
- No fake in-memory Redis is used.

### Queue / worker / DLQ
- The checked-in `/api/enterprise/queue/*` engine is **signed but local-process and non-durable**.
- The durable worker implementation in this repo today is the **Firestore-backed notification outbox**.
- Do **not** market the local queue route as a production durable job broker.

### Storage / encryption
- Tenant artifact access uses **tenant/workspace-scoped object keys** plus **HMAC-signed short-lived artifact tokens**.
- Production **must** set `TENANT_ARTIFACT_SIGNING_SECRET`.
- Production **must** set `TENANT_JOB_SIGNING_SECRET`.
- There is **no KMS integration** in this repo today.
- Security guarantee is secret-based HMAC signing on the server only.

### Hostinger consequence
If Hostinger shared hosting cannot provide outbound connectivity to a managed PostgreSQL instance, then:
- keep `ENTERPRISE_TENANCY_ENABLED=false`
- keep `VITE_ENTERPRISE_TENANCY_ENABLED=false`
- deploy consumer features only

Do **not** enable enterprise in production unless Firestore admin credentials and external PostgreSQL connectivity are both verified.

---

## 1. Required environment variables

Copy `.env.example` and set these values.

### Public browser variables
```env
VITE_WEBSITE_URL=https://YOUR_DOMAIN
VITE_FIREBASE_KEY=...
VITE_FIREBASE_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_GOOGLE_MAPS_API_KEY=...
VITE_MEASUREMENT_ID=...
VITE_RAZORPAY_KEY_ID=...
```

### Backend core
```env
NODE_ENV=production
PORT=8080
PROTOCOL=https
WEBSITE_NAME=YOUR_DOMAIN
CORS_ALLOWED_ORIGINS=https://YOUR_DOMAIN
TRUST_PROXY_HOPS=
```

### Enterprise feature flags
```env
ENTERPRISE_TENANCY_ENABLED=false
VITE_ENTERPRISE_TENANCY_ENABLED=false
```
Only switch both to `true` after sections 3, 8, 11, 12, and 13 are fully verified.

### Firebase Admin
Preferred:
```env
FIREBASE_PROJECT_ID=...
FIREBASE_DATABASE_URL=...
FIREBASE_USE_ADC=true
```
Fallback if ADC is unavailable:
```env
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Enterprise PostgreSQL
```env
TENANT_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```
This is required for:
- `/api/enterprise/resources`
- enterprise resume/document library
- enterprise AI metering route
- RLS isolation in the enterprise resource plane

### Optional Redis
```env
REDIS_URL=redis://HOST:6379
TENANT_REDIS_URL=redis://HOST:6379
```
You may set only one; `TENANT_REDIS_URL` wins if both are set.

### Required enterprise signing secrets
Generate 32+ byte secrets:
```env
TENANT_JOB_SIGNING_SECRET=REPLACE_WITH_32_PLUS_BYTES
TENANT_ARTIFACT_SIGNING_SECRET=REPLACE_WITH_32_PLUS_BYTES
```
Example generation command:
```bash
openssl rand -base64 48
```

### Optional worker flags
```env
NOTIFICATION_OUTBOX_WORKER_ENABLED=true
NOTIFICATION_OUTBOX_EXTERNAL_WORKER=false
NOTIFICATION_OUTBOX_INTERVAL_MS=15000
CMS_SCHEDULER_ENABLED=false
CMS_SCHEDULER_INTERVAL_MS=300000
PDF_RENDERER_ISOLATED=false
```

---

## 2. Required Firebase configuration

### Auth
Verify:
- Firebase Auth project matches all `VITE_FIREBASE_*` values.
- production auth domain is authorized
- email verification is enabled if enterprise users are expected to access the console
- support/admin users have correct custom claims where needed

### Firestore collections used by enterprise
Confirm read/write availability for these collections from the backend service account:
- `enterprise_tenants`
- `enterprise_tenant_slugs`
- `enterprise_workspaces`
- `enterprise_memberships`
- `enterprise_workspace_memberships`
- `enterprise_principal_tenants`
- `enterprise_tenant_configurations`
- `enterprise_service_accounts`
- `enterprise_api_keys`
- `enterprise_support_grants`
- `enterprise_audit_events`
- `enterprise_quota_counters`
- `security_audit_logs`

### Firebase verification command
After deployment, hit:
```bash
curl -fsS https://YOUR_DOMAIN/api/readyz
```
Expected:
- HTTP `200`
- `checks.firebaseAdmin = "READY"`

---

## 3. Required database configuration

### Mandatory decision
For enterprise mode, use **managed PostgreSQL reachable from the backend**.

### Why PostgreSQL remains required
The current codebase intentionally requires Postgres for:
- enterprise resource CRUD
- RLS-enforced tenant/workspace separation
- enterprise AI usage ledger

Without `TENANT_DATABASE_URL`, these routes fail closed with `503 TENANT_DATA_PLANE_UNAVAILABLE` or `503 TENANT_AI_METERING_UNAVAILABLE`.

### Migration command
Run from repo root:
```bash
npm --prefix backend run migrate:enterprise
```

### Verify migration applied
Use psql against the managed database and confirm:
- enterprise tables exist
- RLS policies exist
- `FORCE ROW LEVEL SECURITY` is present on protected tables

Suggested commands:
```bash
psql "$TENANT_DATABASE_URL" -c "\dt"
psql "$TENANT_DATABASE_URL" -c "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
```

### Expected result
- migration completes without SQL errors
- enterprise resource endpoints stop returning `TENANT_DATA_PLANE_UNAVAILABLE`

---

## 4. Required Redis configuration

Redis is optional.

### If Redis is available
Set:
```env
REDIS_URL=redis://HOST:6379
```
or
```env
TENANT_REDIS_URL=redis://HOST:6379
```

### If Redis is not available
Leave both unset.
Expected behavior:
- `/api/enterprise/cache/status` reports unavailable/unhealthy truthfully
- correctness-sensitive enterprise operations continue using durable stores
- no fake Redis behavior is claimed

### Verification command
Authenticated enterprise request:
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" \
     -H "X-Tenant-Id: <TENANT_ID>" \
     https://YOUR_DOMAIN/api/enterprise/cache/status
```
Expected when configured and reachable:
- `cache.ok = true`
- `cache.status = "healthy"`

---

## 5. Required storage configuration

This repo signs tenant artifact tokens but does **not** provision a bucket automatically.

You must provide a server-side storage target that honors tenant/workspace object keys such as:
```text
tenants/<tenantId>/workspaces/<workspaceId>/artifacts/<resourceType>/<resourceId>/<artifact>.v1.pdf
```

Minimum requirements:
- no direct public listing of tenant object paths
- server-side upload validation
- download only through verified backend authorization/token flow
- content-type restrictions enforced at upload time

### Verification commands
Authenticated token issue:
```bash
curl -X POST \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: <TENANT_ID>" \
  -H "X-Workspace-Id: <WORKSPACE_ID>" \
  -d '{"objectKey":"tenants/<TENANT_ID>/workspaces/<WORKSPACE_ID>/artifacts/resume/<RESOURCE_ID>/file.v1.pdf","purpose":"DOWNLOAD","expiresInMs":60000}' \
  https://YOUR_DOMAIN/api/enterprise/storage/token
```
Expected:
- HTTP `200`
- JSON contains `token`

---

## 6. Required encryption / signing configuration

There is **no KMS implementation** here.
Use strong server-only env secrets.

### Required
```env
TENANT_JOB_SIGNING_SECRET=32+ bytes
TENANT_ARTIFACT_SIGNING_SECRET=32+ bytes
```

### Production behavior now
- if `TENANT_JOB_SIGNING_SECRET` is missing in production, queue engine status becomes `misconfigured`
- if `TENANT_ARTIFACT_SIGNING_SECRET` is missing in production, artifact token operations fail closed

### Evidence to capture
- redacted screenshot of secret presence in the production env manager
- response from `/api/enterprise/queue/status`
- successful artifact token issue/verify flow

---

## 7. Required queue configuration

### Truthful current state
- enterprise queue route = signed, local, **non-durable**
- notification outbox = Firestore-backed durable worker path for notifications

### Recommendation
For production today:
- enable `NOTIFICATION_OUTBOX_WORKER_ENABLED=true` only after Firestore admin verification
- keep PM2 at **1 instance** unless you separately validate multi-instance behavior for your deployment model
- do not depend on `/api/enterprise/queue/enqueue` for critical durable business jobs

### Verification command
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" \
     -H "X-Tenant-Id: <TENANT_ID>" \
     https://YOUR_DOMAIN/api/enterprise/queue/status
```
Expected:
- `queue.healthy = true` when `TENANT_JOB_SIGNING_SECRET` is set
- `queue.durable = false`

---

## 8. PM2 configuration

Use a **single backend instance** for the current enterprise implementation.

### Suggested PM2 app
```js
module.exports = {
  apps: [
    {
      name: 'resumepilot-backend',
      cwd: '/ABSOLUTE/PATH/ResumePilotAi/backend',
      script: 'index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        NOTIFICATION_OUTBOX_WORKER_ENABLED: 'true',
        NOTIFICATION_OUTBOX_EXTERNAL_WORKER: 'false'
      }
    }
  ]
};
```

### Start commands
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
pm2 logs resumepilot-backend --lines 200
```

---

## 9. Build commands

From repo root:
```bash
npm ci
npm --prefix backend ci --omit=dev
npm run build
```

If you need to run backend tests on a machine where `redis-memory-server` postinstall is blocked:
```bash
npm --prefix backend ci --ignore-scripts
```

### Required local verification before production enablement
```bash
npm run lint
npm run test:security
npm run test:interview
npm run test:product
npm run test:enterprise
npm run audit:production
npm run build
```

---

## 10. Deployment commands

Example sequence:
```bash
git fetch --all --tags --prune
git checkout arena/01a01f1c-resumepilotai
git pull --ff-only origin arena/01a01f1c-resumepilotai
npm ci
npm --prefix backend ci --omit=dev
npm run build
npm --prefix backend run migrate:enterprise
pm2 restart resumepilot-backend --update-env
```

If frontend is served separately, deploy the `dist/` output after `npm run build`.

---

## 11. Health checks

### Public health
```bash
curl -fsS https://YOUR_DOMAIN/healthz
curl -fsS https://YOUR_DOMAIN/api/healthz
curl -fsS https://YOUR_DOMAIN/api/health
```
Expected:
```json
{"status":"ok","firebaseAdminConfigured":true,...}
```

### Readiness
```bash
curl -i https://YOUR_DOMAIN/readyz
curl -i https://YOUR_DOMAIN/api/readyz
```
Expected:
- HTTP `200`
- `status = "ready"`
- `checks.firebaseAdmin = "READY"`

---

## 12. Enterprise checks

### Feature flag check
Authenticated:
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" https://YOUR_DOMAIN/api/enterprise/status
```
Expected after enablement:
```json
{"enabled":true,"apiVersion":"tenant-foundation-v1"}
```

### Tenant context
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" https://YOUR_DOMAIN/api/enterprise/context
```
Expected:
- HTTP `200`
- `context.tenantId` present
- `context.workspaceId` present
- `X-Tenant-Context` response header present

### Roles matrix
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" \
     -H "X-Tenant-Id: <TENANT_ID>" \
     https://YOUR_DOMAIN/api/enterprise/roles-matrix
```
Expected:
- HTTP `200`
- role definitions returned from backend constants

### Service accounts
Create/list/revoke through `/api/enterprise/service-accounts` and confirm:
- plaintext key appears exactly once at creation
- list returns `scopes`
- revoke removes active visibility

### Support grants
Create/list/revoke through `/api/enterprise/support-grants` and confirm:
- active tenant/workspace is inherited from server-validated context
- wrong tenant/workspace cannot revoke another tenant’s grant

---

## 13. Tenant A/B tests

Use two real Firebase users with two separate tenant memberships.

### Must pass
1. Tenant A user cannot resolve Tenant B context with `X-Tenant-Id: <tenantB>`.
2. Tenant A cannot list Tenant B service accounts.
3. Tenant A cannot list Tenant B audit events.
4. Tenant A cannot verify Tenant B artifact token.
5. Tenant A cannot use Tenant B support grant.
6. Tenant A cannot use Tenant B service-account key.

### Example expected failures
- `404 TENANT_MEMBERSHIP_NOT_FOUND`
- `404 TENANT_RESOURCE_NOT_FOUND`
- `403 SUPPORT_GRANT_DENIED`
- `404 SERVICE_TENANT_NOT_FOUND`

---

## 14. Failure tests

Run these before enabling enterprise publicly:

### PostgreSQL removed or wrong URL
Expected:
- `/api/enterprise/resources` returns `503 TENANT_DATA_PLANE_UNAVAILABLE`
- `/api/enterprise/ai/generate-content` returns `503 TENANT_AI_METERING_UNAVAILABLE`

### Redis removed
Expected:
- `/api/enterprise/cache/status` reports unavailable/unhealthy truthfully
- app does not claim Redis is healthy

### Missing job signing secret in production
Expected:
- `/api/enterprise/queue/status` => `healthy=false`, `status="misconfigured"`

### Missing artifact signing secret in production
Expected:
- `/api/enterprise/storage/token` fails closed

### Suspended tenant
Expected:
- context resolution fails with `TENANT_INACTIVE`

---

## 15. Rollback procedure

### Fast rollback
1. Set:
```env
ENTERPRISE_TENANCY_ENABLED=false
VITE_ENTERPRISE_TENANCY_ENABLED=false
```
2. redeploy frontend build
3. restart backend with PM2
4. confirm `/api/enterprise/status` reports `enabled=false`

### Code rollback
```bash
git log --oneline --decorate -20
git checkout <last-known-good-sha>
npm ci
npm --prefix backend ci --omit=dev
npm run build
pm2 restart resumepilot-backend --update-env
```

### Database rollback
- restore latest verified `pg_dump` backup to the managed Postgres instance
- do **not** restore a partial subset of tenant tables without corresponding Firestore control-plane review

---

## 16. Backup procedure

### PostgreSQL
```bash
pg_dump "$TENANT_DATABASE_URL" --format=custom --file=enterprise-$(date +%F-%H%M%S).dump
```

### Firestore
Use your existing Firebase/GCP export process for the enterprise collections listed in section 2.
If you have gcloud access:
```bash
gcloud firestore export gs://YOUR_BACKUP_BUCKET/firestore-$(date +%F-%H%M%S)
```

### Evidence to capture
- pg_dump file checksum
- Firestore export job ID or console screenshot
- timestamp and operator identity

---

## 17. Monitoring commands

```bash
pm2 status
pm2 logs resumepilot-backend --lines 200
curl -fsS https://YOUR_DOMAIN/api/healthz
curl -fsS https://YOUR_DOMAIN/api/readyz
```

Authenticated enterprise probes:
```bash
curl -H "Authorization: Bearer <ID_TOKEN>" -H "X-Tenant-Id: <TENANT_ID>" https://YOUR_DOMAIN/api/enterprise/cache/status
curl -H "Authorization: Bearer <ID_TOKEN>" -H "X-Tenant-Id: <TENANT_ID>" https://YOUR_DOMAIN/api/enterprise/queue/status
curl -H "Authorization: Bearer <ID_TOKEN>" -H "X-Tenant-Id: <TENANT_ID>" https://YOUR_DOMAIN/api/enterprise/observability/metrics
```

---

## 18. Expected outputs

### `/api/readyz`
- `status: ready`
- `checks.firebaseAdmin: READY`

### `/api/enterprise/status`
- `enabled: true` only after final enablement

### `/api/enterprise/context`
- valid tenant/workspace IDs
- backend-resolved permissions

### `/api/enterprise/cache/status`
- `ok: true` only when Redis actually answers

### `/api/enterprise/queue/status`
- `healthy: true` only when `TENANT_JOB_SIGNING_SECRET` is configured
- `durable: false`

---

## 19. Evidence to capture

Capture all of the following before declaring enterprise production-ready:

1. `npm run build` output
2. `npm run test:enterprise` output
3. `npm run test:security` output
4. `npm run test:interview` output
5. `npm run test:product` output
6. `npm run audit:production` output
7. `/api/healthz` response
8. `/api/readyz` response
9. `/api/enterprise/status` response
10. `/api/enterprise/context` response for Tenant A and Tenant B
11. successful workspace create/list flow
12. successful service-account create/list/revoke flow
13. successful support-grant create/list/revoke flow
14. tenant A → tenant B denial screenshots/logs
15. Postgres migration evidence
16. Firestore admin credential evidence
17. PM2 process status
18. rollback dry-run notes

---

## 20. Final go/no-go rule

**GO** only when all are true:
- Firestore admin is verified
- enterprise Postgres is reachable
- migrations applied
- health and readiness are clean
- feature flags are enabled on both server and client
- tenant A/B isolation checks pass
- enterprise resource CRUD works
- service-account lifecycle works
- support-grant lifecycle works
- signing secrets are configured

**NO-GO** if any of these remain false.
