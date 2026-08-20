# Enterprise Architecture — Firestore-First Multi-Tenancy

> Status: **implemented and verified in this repository** (see the test matrix in
> `docs/ENTERPRISE_10_10_CERTIFICATION_REPORT.md`). This document describes the
> architecture as it exists in code — no external service is claimed that is not
> deployed.

## 1. Design goal

The enterprise plane runs on the actual production target — **Hostinger
Node.js hosting + Firebase (Auth, Firestore, Storage)** — with **zero external
infrastructure**: no PostgreSQL, no Redis, no RabbitMQ/Kafka/SQS, no external
KMS, and no non-durable local queue. These are not optional dependencies that
can be switched on — the PostgreSQL adapter, Redis client, and their
dependencies were deleted from the codebase and the dependency tree. The
architecture was hardened so their removal weakens nothing: isolation,
authorization, durability, auditability, and quotas are all carried by
Firestore.

## 2. Architecture (as implemented)

```
Browser (React console)
   ↓ Firebase Auth (client SDK; verified email)
   ↓ Bearer token + tenant/workspace REQUEST headers (never trusted directly)
Express API (/api/enterprise/*)
   ↓ security/auth → Firebase Admin token verification
   ↓ TenantService.resolveContext → FirestoreTenantRegistry
   ↓     verified membership → frozen TenantContext (tenant, workspace, roles,
   ↓     permissions, data-plane routing metadata)
   ↓ requireTenantPermission (RBAC)
   ↓ TenantService (business logic — zero provider branching)
   ↓ EnterpriseRepository abstraction
        └─ FirestoreEnterpriseRepository   ← the only data plane
   ↓ Firestore (tenant-partitioned)
Enterprise durable outbox (Firestore) → worker → retry / DLQ → AI / notifications
```

### Startup truth (logged once, no secrets)

```
Enterprise Architecture {"enterpriseTenancy":"ENABLED","dataProvider":"Enterprise Data Provider: firestore",
  "cache":"Cache: none (Firestore is the durable store; no external cache exists in this architecture)",
  "queue":"Queue: Firestore Durable Outbox","encryption":"Encryption Provider: ServerKey",
  "quotaStore":"firestore-atomic"}
```

`GET /readyz` exposes the same facts per check.

## 3. Firestore enterprise data model

Control plane (top-level collections, all tenant-tagged, Admin-SDK only):

| Collection | Purpose |
|---|---|
| `enterprise_tenants/{tenantId}` | tenant record + routing metadata + lifecycle |
| `enterprise_tenant_slugs/{slug}` | unique slug lease |
| `enterprise_tenant_configurations/{tenantId}` | revisioned AI/quota/retention/security/identity policy |
| `enterprise_workspaces/{workspaceId}` | workspaces (`tenantId` field) |
| `enterprise_memberships/{tenantId}_{principalHash}` | tenant membership + roles |
| `enterprise_workspace_memberships/{workspaceId}_{principalHash}` | workspace access |
| `enterprise_teams/{teamId}` | teams per tenant/workspace |
| `enterprise_service_accounts/{id}` | M2M accounts (hashed keys only) |
| `enterprise_api_keys/{secretHash}` | key hash → account mapping |
| `enterprise_support_grants/{id}` | time-boxed support access grants |
| `enterprise_principal_tenants/{hash}` | identity → personal-tenant map |
| `enterprise_quota_buckets/{keyHash}` | atomic rate/quota counters (transient) |
| `enterprise_outbox/{jobId}` | durable job queue + DLQ (see §6) |
| `enterprise_migration_ledger/{id}` | migration records (checksummed) |

Data plane (tenant-partitioned — a document path cannot cross tenants):

```
tenants/{tenantId}/resources/{resourceId}        encrypted payload envelopes
tenants/{tenantId}/audit_events/{eventId}        tenant audit trail
tenants/{tenantId}/ai_usage/{usageId}            append-only usage ledger (idempotent ids)
tenants/{tenantId}/ai_usage_daily/{yyyy-mm-dd}   atomic rollups (requests/tokens/cost,
                                                 per-workspace / per-provider / per-model)
```

Client access to every enterprise collection is denied by
`SecurityRules.txt` (`allow read, write: if false` for the whole tree); the
backend uses the Admin SDK, which bypasses rules by design.

## 4. Replacing PostgreSQL RLS

RLS previously enforced the tenant boundary inside the database. The Firestore
data plane restores the same guarantees with three independent layers:

1. **Structural** — every data-plane path is rooted at `tenants/{context.tenantId}`;
   a query physically cannot reach another tenant's partition.
2. **Query-level** — workspace predicates are applied in the query before data
   leaves the store (`workspaceId == context.workspaceId` for workspace-scoped
   principals; tenant-wide scope only for `TENANT_OWNER`/`TENANT_ADMIN`).
3. **Read-level** — `assertResourceInScope(context, resource)` re-verifies tenant
   and workspace on every read/update/delete.

Headers (`X-Tenant-Id`, `X-Workspace-Id`) and body fields are only *requests*;
the registry verifies membership before any context exists. Verified by the
adversarial suites: `enterprise-firestore-isolation.test.js`,
`tenant-adversarial.test.js`, `enterprise-firestore-dataplane.test.js`.

Concurrency: revision-checked updates inside Firestore transactions
(`TENANT_RESOURCE_CONFLICT` on stale writes); serialized transaction semantics
verified by concurrent-writer tests.

## 5. Encryption (Phase: implemented)

`backend/enterprise/encryptionProvider.js` defines the `EncryptionProvider`
abstraction:

- **ServerKeyProvider (implemented, default)** — AES-256-GCM envelope
  encryption. Each document gets a unique data key; the data key is wrapped by
  the active master key (versioned, rotatable). Master keys load exclusively
  from server-side env (`ENTERPRISE_ENCRYPTION_KEYS` / `ENTERPRISE_ENCRYPTION_KEY`),
  never reach the frontend, and never appear in logs, tokens, or stored
  documents. Any non-`PUBLIC` resource payload is sealed before persistence;
  tampered ciphertext fails authenticated decryption.
- **ManagedKmsProvider (NOT implemented)** — the configuration slot exists
  (`ENTERPRISE_ENCRYPTION_PROVIDER=kms`) and fails with an explicit
  *"not implemented in this deployment"* error. **No managed KMS is claimed.**

Fail-closed contract: missing keys ⇒ resource writes/reads of encrypted data
return `ENTERPRISE_ENCRYPTION_UNAVAILABLE` (503). Rotation: add a new key
version and set `ENTERPRISE_ENCRYPTION_ACTIVE_KEY`; old documents remain
readable while the old version is configured; rewrites seal with the new
version.

## 6. Durable jobs: Firestore outbox (replaces the in-memory queue)

`backend/enterprise/enterpriseOutbox.js`. The previous non-durable
`EnterpriseQueueWorkerEngine` (arrays + `Map`) was **deleted**.

- **Enqueue** — the server derives a signed HMAC-SHA256 envelope from the
  *verified* context (the client never supplies identity or signature) and
  writes `enterprise_outbox/{sha256(tenantId+idempotencyKey)}`; duplicate
  submissions collapse onto one job.
- **Claim** — lease-based Firestore transactions; concurrent workers cannot
  double-claim; crashed workers' leases expire and the job is reclaimable.
- **Reauthorization at execution** — signature + expiry verified, then tenant
  lifecycle + membership + canonical principal re-resolved. Suspended tenant,
  revoked membership, expiry, tampering ⇒ terminal `REJECTED` (never retried,
  always visible). Transient failures ⇒ exponential backoff with jitter ⇒
  `DEAD_LETTER` after max attempts.
- **DLQ + replay** — tenant-scoped listing and replay (permission-gated,
  audited, fresh attempt budget). Cross-tenant replay is invisible.
- **Worker** — enable with `ENTERPRISE_OUTBOX_WORKER_ENABLED=true` (a `NOTIFY`
  handler fans out to the certified durable notification outbox; unhandled job
  types retry → DLQ, never silently dropped).

## 7. No cache tier — by removal, not by fallback

Redis was removed completely: no client, no `REDIS_URL`/`TENANT_REDIS_URL`
wiring, no health surface, and no `ioredis` dependency. Quotas and limits are
enforced by `TenantQuotaGuard` on Firestore atomic counters; jobs, audit, and
usage live in Firestore. The architecture test suite asserts the absence of
any Redis module, dependency, or route reference so it cannot silently
return.

## 8. AI metering

Quota (per-minute/per-day) → durable Firestore counters (429 on exhaustion).
Usage → idempotent ledger entries + atomic daily rollups
(per-workspace/provider/model, tokens + estimated cost) → `/usage/ai` API →
Usage console. Tenant A can never consume or observe Tenant B quota
(verified). Provider failure after metering is honest: no ledger entry is
written for unfulfilled generations (the entry is recorded after the provider
returns), and duplicate accounting is collapsed by correlation-id idempotency.

## 9. Storage

`backend/enterprise/storageProvider.js` abstracts object storage:
`firebase-storage` (implemented via the Admin SDK) with `s3`/`r2` as explicit
not-implemented slots. Artifact keys remain
`tenants/{t}/workspaces/{w}/{category}/{type}/{id}/{artifact}.v{n}.{ext}` and
access is mediated by purpose-bound, expiring, tenant/workspace/route-bound
signed tokens (`tenantSignedArtifacts.js`). Client-supplied paths are never
trusted (`assertStorageContext`).

## 10. Backup / restore & migration

- **Backup** (`enterpriseBackup.js`): tenant-scoped logical snapshots —
  collection manifest, canonical checksums, dry-run, idempotent apply,
  foreign-tenant refusal, post-restore verification. Platform-level Firestore
  scheduled exports (GCS) remain the operator's infrastructure task.
- **Migration** (`enterpriseMigration.js`): legacy-Firebase → enterprise
  executor; dry-run, checksum-verified against the live source, idempotent
  ledger, reversible (rollback deletes the tenant resource; the legacy source
  is never modified). No production data is migrated automatically.

## 11. Feature flags

`ENTERPRISE_TENANCY_ENABLED` (server) and `VITE_ENTERPRISE_TENANCY_ENABLED`
(browser). Disabled ⇒ enterprise APIs return 404 and the legacy product is
untouched (verified). Enabled ⇒ the console operates against the Firestore
data plane. No mixed state: the frontend reads `/api/enterprise/status` for
the server's truth.

## 12. Configuration reference

| Variable | Status | Notes |
|---|---|---|
| `ENTERPRISE_ENCRYPTION_KEYS` / `_KEY` | **required when tenancy enabled** | 32-byte base64; fail closed without |
| `ENTERPRISE_ENCRYPTION_ACTIVE_KEY` | optional | key rotation |
| `TENANT_JOB_SIGNING_SECRET` | required for jobs | ≥32 bytes |
| `TENANT_ARTIFACT_SIGNING_SECRET` | required for artifact tokens | ≥32 bytes |
| `ENTERPRISE_OUTBOX_WORKER_ENABLED` | optional | enables the local durable-worker timer |
| `ENTERPRISE_OUTBOX_INTERVAL_MS` | optional (default 15000) | worker poll interval |
| `ENTERPRISE_STORAGE_PROVIDER` | optional (default `firebase-storage`) | only implemented provider |

Removed variables (setting them has no effect and no equivalent exists):
`ENTERPRISE_DATA_PROVIDER`, `TENANT_DATABASE_URL`, `DATABASE_URL`,
`REDIS_URL`, `TENANT_REDIS_URL`. There is no PostgreSQL or Redis service in
this architecture to point them at.
